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

export interface Subtask {
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
    const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o');

    const explanationLog: string[] = [];

    // 1. Top-down estimate
    const topDownPrompt = this.buildPrompt(taskDto, project);
    const topDown = await this.requestEstimateOnly(topDownPrompt, model);
    explanationLog.push(`Top-down: ${topDown}h`);

    // 2. Bottom-up estimate
    const subtasks = await this.breakdownTask(taskDto, project);
    const bottomUp = subtasks.reduce((sum, st) => sum + st.estimateHours, 0);
    explanationLog.push(`Bottom-up (subtasks sum): ${bottomUp}h`);

    // 3. Learn from past estimates
    const { correctedEstimate, averageError } = await this.getCorrectedEstimate(
      bottomUp,
      taskDto
    );
    explanationLog.push(
      `Corrected by feedback (avg error ${averageError.toFixed(
        1
      )}h): ${correctedEstimate.toFixed(1)}h`
    );

    // 4. Apply context-based modifiers
    const adjusted = this.applyModifiers(
      correctedEstimate,
      taskDto,
      project,
      explanationLog
    );

    // 5. Mismatch warning & Confidence calculation
    const divergence =
      bottomUp > 0 ? Math.abs(topDown - bottomUp) / bottomUp : 0;
    if (divergence > 0.4) {
      explanationLog.push(`⚠️ High divergence: ${topDown}h vs ${bottomUp}h`);
    }

    // 6. Final cleanup
    const final = this.sanitize(adjusted);
    explanationLog.push(`Final sanitized: ${final}h`);

    const estimate = new EstimateDto();
    estimate.finalEstimate = final;
    estimate.confidence = this.calculateConfidence({
      description: taskDto.description,
      divergence,
      historicalError: averageError,
      manualEstimate: taskDto.manualEstimate,
      aiEstimate: final,
    });
    estimate.source = EstimateSource.AI;
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

    switch (project.complexity) {
      case 'LOW':
        multiplier *= 0.85;
        break;
      case 'HIGH':
        multiplier *= 1.2;
        break;
    }

    switch (taskDto.experienceLevel.toLowerCase()) {
      case 'junior':
        multiplier *= 1.25;
        break;
      case 'mid':
        multiplier *= 1;
        break;
      case 'senior':
        multiplier *= 0.85;
        break;
    }

    if (/react|next/i.test(taskDto.technology)) multiplier *= 0.95;
    else if (/nestjs|java|graphql/i.test(taskDto.technology)) multiplier *= 1.1;

    const adjusted = original * multiplier;
    log.push(`Modifier x${multiplier.toFixed(2)} → ${adjusted.toFixed(1)}h`);

    if (project.overhead > 0) {
      const withOverhead = adjusted * (1 + project.overhead / 100);
      log.push(`Overhead +${project.overhead}% → ${withOverhead.toFixed(1)}h`);
      return withOverhead;
    }

    return adjusted;
  }

  private sanitize(val: number): number {
    return Math.min(Math.max(0.25, parseFloat(val.toFixed(1))), 200);
  }

  async breakdownTask(
    taskDto: CreateTaskDto,
    project: Project
  ): Promise<Subtask[]> {
    const prompt = this.buildBreakdownPrompt(taskDto, project);
    const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o');

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error('Empty breakdown response');

      const parsed = JSON.parse(content);
      return parsed.subtasks as Subtask[];
    } catch (error) {
      this.logger.error('Failed to get AI breakdown', error.stack);
      throw new Error('AI breakdown failed');
    }
  }

  private async getCorrectedEstimate(
    original: number,
    taskDto: CreateTaskDto
  ): Promise<{ correctedEstimate: number; averageError: number }> {
    const tasks = await this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.estimates', 'estimate')
      .leftJoinAndSelect('task.feedbacks', 'feedback')
      .where('task.technology LIKE :tech', { tech: `%${taskDto.technology}%` })
      .andWhere('task.experienceLevel = :exp', { exp: taskDto.experienceLevel })
      .andWhere('estimate.source = :source', { source: EstimateSource.AI })
      .andWhere('feedback.actualHours IS NOT NULL')
      .limit(10)
      .getMany();

    let errorSum = 0;
    let count = 0;

    for (const task of tasks) {
      const aiEstimate = task.estimates.find(
        (e) => e.source === EstimateSource.AI
      );
      const feedbacks = task.feedbacks.filter((f) => f.actualHours != null);

      if (aiEstimate && feedbacks.length > 0) {
        const avgActual =
          feedbacks.reduce((s, f) => s + f.actualHours, 0) / feedbacks.length;
        errorSum += avgActual - aiEstimate.finalEstimate;
        count++;
      }
    }

    if (count === 0) {
      return { correctedEstimate: original, averageError: 0 };
    }

    const averageError = errorSum / count;
    const correctedEstimate = original + averageError;

    return {
      correctedEstimate: Math.max(0.25, correctedEstimate),
      averageError,
    };
  }

  private parseEstimate(content: string): number {
    const text = content.toLowerCase();
    const numbers = text.match(/\d+(\.\d+)?/g);
    if (!numbers) return 0;
    const value = parseFloat(numbers[0]);

    if (/week/.test(text)) return value * 40;
    if (/day/.test(text)) return value * 8;
    return value;
  }

  private calculateConfidence(args: {
    description: string;
    divergence: number;
    historicalError: number;
    manualEstimate?: number;
    aiEstimate: number;
  }): number {
    let confidence = 1.0; // Start with perfect confidence

    // 1. Penalize for high divergence between top-down and bottom-up
    if (args.divergence > 0.5) confidence -= 0.25;
    else if (args.divergence > 0.25) confidence -= 0.1;

    // 2. Penalize for historical inaccuracy
    const absError = Math.abs(args.historicalError);
    if (absError > 4) confidence -= 0.2;
    else if (absError > 2) confidence -= 0.1;

    // 3. Adjust based on description quality
    const descLen = args.description.length;
    if (descLen < 50) confidence -= 0.2;
    else if (descLen < 100) confidence -= 0.1;

    if (!/api|ui|test|database|баз данных/i.test(args.description)) {
      confidence -= 0.05; // Penalize if no tech keywords
    }

    // 4. Penalize for disagreement with manual estimate, if provided
    if (args.manualEstimate) {
      const manualDivergence =
        Math.abs(args.aiEstimate - args.manualEstimate) / args.manualEstimate;
      if (manualDivergence > 0.5) confidence -= 0.2;
      else if (manualDivergence > 0.25) confidence -= 0.1;
    }

    return Math.max(0.1, Math.min(0.99, confidence)); // Clamp between 10% and 99%
  }

  private buildPrompt(taskDto: CreateTaskDto, project: Project): string {
    return `
  You are a senior software engineer estimating development tasks.
  Your goal is to give a realistic time estimate in hours for completing the described task.

  Project complexity: ${project.complexity}
  Task title: ${taskDto.title}
  Task description: ${taskDto.description}
  Required technology: ${taskDto.technology}
  Developer experience level: ${taskDto.experienceLevel}

  Estimate the time required to complete this task, considering best practices and potential blockers.
  Respond with a single number representing the estimated hours (e.g. 7.5). Do not include any explanation.
`;
  }

  private buildBreakdownPrompt(
    taskDto: CreateTaskDto,
    project: Project
  ): string {
    return `
You are a senior software engineer assisting in granular task planning.

Context:
- Project Complexity: ${project.complexity}
- Technology: ${taskDto.technology}
- Experience Level: ${taskDto.experienceLevel}

Main Task:
- Title: ${taskDto.title}
- Description: ${taskDto.description}

Instructions:
1. Break the task into 3–6 independent **developer-level subtasks** (not epics, not vague goals).
2. Each subtask must be:
   - small enough to complete in under 1 day
   - clearly scoped and testable
   - in the same technical stack (unless integration is needed)
3. Prefer action-oriented verbs: "Implement", "Setup", "Refactor", "Write tests", "Integrate", etc.
4. Each subtask must include:
   - "title": concise string
   - "description": 1–2 sentence goal and what’s expected
   - "estimateHours": realistic hours for a developer of specified experience

Return a **valid JSON** in this shape:
{
  "subtasks": [
    {
      "title": "Setup GraphQL schema",
      "description": "Define types and queries for user registration.",
      "estimateHours": 2.5
    },
    ...
  ]
}
  `.trim();
  }
}
