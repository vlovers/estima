import { EstimateSource } from '../estimates/entities/estimate.entity';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { Project } from '../projects/entities/project.entity';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Task } from '../tasks/entities/task.entity';
import { EstimateDto } from './dto/estimate.dto';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import OpenAI from 'openai';

interface Subtask {
  title: string;
  description: string;
  estimateHours: number;
}

@Injectable()
export class AiEstimatorService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(AiEstimatorService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async estimateTask(
    taskDto: CreateTaskDto,
    project: Project
  ): Promise<EstimateDto> {
    const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4-turbo');

    const explanationLog: string[] = [];

    // 1. Top-down
    const topDownPrompt = this.buildPrompt(taskDto, project);
    const topDown = await this.requestEstimateOnly(topDownPrompt, model);
    explanationLog.push(`Top-down: ${topDown}h`);

    // 2. Breakdown
    const subtasks = await this.breakdownTask(taskDto, project);
    const bottomUp = subtasks.reduce((s, t) => s + t.estimateHours, 0);
    explanationLog.push(`Bottom-up (subtasks sum): ${bottomUp}h`);

    // 3. Correction from feedback
    const corrected = await this.getCorrectedEstimate(bottomUp, taskDto);
    explanationLog.push(`Corrected by feedback: ${corrected.toFixed(1)}h`);

    // 4. Modifiers
    const adjusted = this.applyModifiers(
      corrected,
      taskDto,
      project,
      explanationLog
    );

    // 5. Mismatch check
    const divergence = Math.abs(topDown - bottomUp);
    if (divergence > Math.max(4, bottomUp * 0.25)) {
      explanationLog.push(
        `⚠️ Divergence detected: ${topDown}h vs ${bottomUp}h`
      );
    }

    const final = this.sanitize(adjusted);
    explanationLog.push(`Final sanitized: ${final}h`);

    console.log('explanationLog', explanationLog);

    const estimate = new EstimateDto();
    estimate.finalEstimate = final;
    estimate.confidence = this.calculateConfidence(taskDto.description);
    estimate.source = 'AI';
    estimate.explanation = explanationLog.join('\n');

    return estimate;
  }

  private async requestEstimateOnly(
    prompt: string,
    model: string
  ): Promise<number> {
    const res = await this.openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 10,
    });
    const content = res.choices[0].message.content;
    return this.parseEstimate(content ?? '');
  }

  private applyModifiers(
    original: number,
    taskDto: CreateTaskDto,
    project: Project,
    log: string[]
  ): number {
    let multiplier = 1;

    // Project complexity
    switch (project.complexity) {
      case 'LOW':
        multiplier *= 0.8;
        break;
      case 'HIGH':
        multiplier *= 1.25;
        break;
    }

    switch (taskDto.experienceLevel.toLowerCase()) {
      case 'junior':
        multiplier *= 1.3;
        break;
      case 'mid':
        multiplier *= 1.0;
        break;
      case 'senior':
        multiplier *= 0.8;
        break;
    }

    if (/react|next/i.test(taskDto.technology)) multiplier *= 0.9;
    else if (/nestjs|java|graphql/i.test(taskDto.technology)) multiplier *= 1.1;

    const adjusted = original * multiplier;
    log.push(`Modifier x${multiplier.toFixed(2)} → ${adjusted.toFixed(1)}h`);

    // Overhead
    if (project.overhead > 0) {
      const withOverhead = adjusted * (1 + project.overhead / 100);
      log.push(`Overhead +${project.overhead}% → ${withOverhead.toFixed(1)}h`);
      return withOverhead;
    }

    return adjusted;
  }

  private sanitize(val: number): number {
    if (val < 0.5) return 0.5;
    if (val > 200) return 200;
    return parseFloat(val.toFixed(1));
  }

  async breakdownTask(
    taskDto: CreateTaskDto,
    project: Project
  ): Promise<Subtask[]> {
    const prompt = this.buildBreakdownPrompt(taskDto, project);
    const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4-turbo');

    this.logger.log(`Sending breakdown request to ${model}...`);

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      this.logger.log(`Received breakdown response from AI: ${content}`);

      if (!content) {
        this.logger.error('AI breakdown response content is null');
        throw new Error('Failed to get a breakdown response from AI.');
      }

      const parsed = JSON.parse(content);
      // TODO: Add validation for the parsed JSON structure
      return parsed.subtasks as Subtask[];
    } catch (error) {
      this.logger.error('Error getting breakdown from OpenAI', error.stack);
      throw new Error('Failed to get breakdown from AI.');
    }
  }

  private async getCorrectedEstimate(
    originalEstimate: number,
    taskDto: CreateTaskDto
  ): Promise<number> {
    const similarTasks = await this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.estimates', 'estimate')
      .leftJoinAndSelect('task.feedbacks', 'feedback')
      .where('task.technology LIKE :technology', {
        technology: `%${taskDto.technology}%`,
      })
      .andWhere('task.experienceLevel = :experienceLevel', {
        experienceLevel: taskDto.experienceLevel,
      })
      .andWhere('estimate.source = :source', { source: EstimateSource.AI })
      .andWhere('feedback.actualHours IS NOT NULL')
      .limit(10)
      .getMany();

    let totalError = 0;
    let feedbackCount = 0;

    for (const task of similarTasks) {
      const aiEstimate = task.estimates.find(
        (e) => e.source === EstimateSource.AI
      );
      const feedbacksWithActual = task.feedbacks.filter(
        (f) => f.actualHours != null
      );
      if (aiEstimate && feedbacksWithActual.length > 0) {
        // Average error for all task feedbacks
        const avgActual =
          feedbacksWithActual.reduce((sum, f) => sum + f.actualHours, 0) /
          feedbacksWithActual.length;

        totalError += avgActual - aiEstimate.finalEstimate;
        feedbackCount++;
      }
    }

    if (feedbackCount === 0) return originalEstimate;

    const averageError = totalError / feedbackCount;
    const correctedEstimate = originalEstimate + averageError;

    this.logger.log(
      `Original estimate: ${originalEstimate}, Corrected estimate: ${correctedEstimate}`
    );

    return Math.max(0.5, correctedEstimate);
  }

  private parseEstimate(content: string): number {
    const text = content.toLowerCase();
    const numbers = text.match(/\d+(\.\d+)?/g);

    if (!numbers) {
      return 0;
    }

    const value = parseFloat(numbers[0]);

    if (text.includes('week') || text.includes('weeks')) {
      return value * 40; // 40 hours in a work week
    }

    if (text.includes('day') || text.includes('days')) {
      return value * 8; // 8 hours in a work day
    }

    // By default, we assume this is in hours
    return value;
  }

  private calculateConfidence(description: string): number {
    const length = description.length;
    if (length < 50) return 0.6;
    if (length < 100) return 0.75;
    return 0.9;
  }

  private buildPrompt(taskDto: CreateTaskDto, project: Project): string {
    return `
      You are an expert software engineer specializing in effort estimation.
      Your task is to estimate the number of hours required to complete a task.

      Project Context:
      - Complexity: ${project.complexity}

      Task Details:
      - Title: ${taskDto.title}
      - Description: ${taskDto.description}
      - Technology: ${taskDto.technology}
      - Developer Experience: ${taskDto.experienceLevel}

      Based on these details, provide a single, numeric estimate of the hours required.
      Do not add any text, just the number.
      Example: 8.5
    `;
  }

  private buildBreakdownPrompt(
    taskDto: CreateTaskDto,
    project: Project
  ): string {
    return `
      You are an expert software engineer. Your task is to break down a larger task into smaller, manageable subtasks and estimate each one.

      Project Context:
      - Complexity: ${project.complexity}

      Main Task Details:
      - Title: ${taskDto.title}
      - Description: ${taskDto.description}
      - Technology: ${taskDto.technology}
      - Developer Experience: ${taskDto.experienceLevel}

      Instructions:
      1. Analyze the main task and identify 3-5 key subtasks required for completion.
      2. For each subtask, provide a clear title, a brief description (1-2 sentences), and an estimated number of hours.
      3. Return the result as a JSON object with a single key "subtasks", which is an array of objects. Each object should have "title", "description", and "estimateHours" (numeric) fields.

      Example JSON Output:
      {
        "subtasks": [
          { "title": "Set up database schema", "description": "Create tables and relationships for the new feature.", "estimateHours": 4 },
          { "title": "Build API endpoints", "description": "Develop CRUD endpoints for the feature.", "estimateHours": 6.5 },
          { "title": "Implement frontend UI", "description": "Create the user interface components.", "estimateHours": 8 }
        ]
      }
    `;
  }
}
