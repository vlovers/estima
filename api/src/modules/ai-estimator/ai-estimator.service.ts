import { EstimateSource } from '../estimates/entities/estimate.entity';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
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

  async estimateTask(taskDto: CreateTaskDto): Promise<EstimateDto> {
    const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4-turbo');

    const explanationLog: string[] = [];

    // 1. Top-down
    const topDownPrompt = this.buildPrompt(taskDto);
    const topDown = await this.requestEstimateOnly(topDownPrompt, model);
    explanationLog.push(`Top-down: ${topDown}h`);

    // 2. Breakdown
    const subtasks = await this.breakdownTask(taskDto);
    const bottomUp = subtasks.reduce((s, t) => s + t.estimateHours, 0);
    explanationLog.push(`Bottom-up (subtasks sum): ${bottomUp}h`);

    // 3. Correction from feedback
    const corrected = await this.getCorrectedEstimate(bottomUp, taskDto);
    explanationLog.push(`Corrected by feedback: ${corrected.toFixed(1)}h`);

    // 4. Modifiers
    const adjusted = this.applyModifiers(corrected, taskDto, explanationLog);

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
    log: string[]
  ): number {
    let multiplier = 1;

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
    return adjusted;
  }

  private sanitize(val: number): number {
    if (val < 0.5) return 0.5;
    if (val > 200) return 200;
    return parseFloat(val.toFixed(1));
  }

  async breakdownTask(taskDto: CreateTaskDto): Promise<Subtask[]> {
    const prompt = this.buildBreakdownPrompt(taskDto);
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

  private parseEstimate(responseText: string): number {
    const text = responseText.toLowerCase();
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

  private buildPrompt(taskDto: CreateTaskDto): string {
    return `
You are a software project estimation assistant.

Estimate how many **working hours** it would take for a developer with the following experience to complete this task.

Requirements:
- Only return a single **number** in your answer (e.g., "12").
- The number should be **in hours**, assuming an 8-hour workday.
- Do NOT explain your reasoning.
- Do NOT include any units (no "hours", "hrs", etc).
- Do NOT return a range.

Context:
Task Title: ${taskDto.title}
Description: ${taskDto.description}
Technology Stack: ${taskDto.technology}
Experience Level: ${taskDto.experienceLevel}

Answer:
`;
  }

  private buildBreakdownPrompt(taskDto: CreateTaskDto): string {
    return `
You are a senior software engineer helping to break down development tasks.

Break down the task below into smaller, well-defined subtasks. Each subtask should:
- Have a clear title
- Include a short description (1-2 sentences)
- Include a numeric estimate in **hours** (no ranges, no decimals >1 digit)

⚠️ IMPORTANT:
- Return only a **valid JSON object**.
- The JSON must have a single key "subtasks", which maps to an **array** of objects.
- Each object must have exactly 3 fields: "title" (string), "description" (string), and "estimateHours" (number).
- Only return the JSON — **no commentary, no explanation**.

Context:
Task Title: ${taskDto.title}
Description: ${taskDto.description}
Technology Stack: ${taskDto.technology}
Experience Level: ${taskDto.experienceLevel}

Return format example:
{
  "subtasks": [
    {
      "title": "Set up project structure",
      "description": "Initialize the project with required folders and dependencies.",
      "estimateHours": 2
    },
    {
      "title": "Implement authentication logic",
      "description": "Build login and registration logic with JWT support.",
      "estimateHours": 5
    }
  ]
}
`;
  }
}
