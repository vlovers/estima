import { EstimateSource } from '../estimates/entities/estimate.entity';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { Project } from '../projects/entities/project.entity';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Task } from '../tasks/entities/task.entity';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import OpenAI from 'openai';

export interface Subtask {
  title: string;
  description: string;
  estimateHours: number;
  explanation: string;
}

export interface AiEstimateResponse {
  subtasks: Subtask[];
  risks: { risk: string; mitigation: string }[];
  managerNote?: string;
  questions: null;
}

export interface AiQuestionsResponse {
  subtasks: null;
  risks: null;
  questions: string[];
}

export type AiAnalysisResult =
  | { type: 'estimate'; data: AiEstimateResponse }
  | { type: 'questions'; data: AiQuestionsResponse };

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

  async createInitialAnalysis(
    taskDto: CreateTaskDto,
    project: Project
  ): Promise<AiAnalysisResult> {
    return this.getAiAnalysis(taskDto, project);
  }

  async getAiAnalysis(
    taskDto: CreateTaskDto,
    project: Project,
    history: { question: string; answer: string }[] = []
  ): Promise<AiAnalysisResult> {
    // If the description is too short and we are not in a clarification cycle, force questions.
    const isVague =
      (taskDto.description?.length ?? 0) < 50 && history.length === 0;

    const prompt = isVague
      ? this.buildClarificationRequestPrompt(taskDto)
      : this.buildEstimationPrompt(taskDto, project, history);

    const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o');

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error('Empty AI response');

      const parsed = JSON.parse(content) as
        | AiEstimateResponse
        | AiQuestionsResponse;

      if (parsed.questions && parsed.questions.length > 0) {
        return { type: 'questions', data: parsed as AiQuestionsResponse };
      }

      if (parsed.subtasks && parsed.subtasks.length > 0) {
        return { type: 'estimate', data: parsed as AiEstimateResponse };
      }

      throw new Error('Invalid AI response structure');
    } catch (error) {
      this.logger.error('Failed to get AI analysis', error.stack);
      throw error;
    }
  }

  private async requestEstimateOnly(
    prompt: string,
    model: string
  ): Promise<number> {
    try {
      const res = await this.openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 10,
      });
      const content = res.choices[0].message.content;
      return this.parseEstimate(content ?? '');
    } catch (error) {
      this.logger.error('Failed to get AI estimate', error.stack);
      return 0;
    }
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

  private async getCorrectedEstimate(
    original: number,
    taskDto: CreateTaskDto
  ): Promise<{ correctedEstimate: number; averageErrorRatio: number }> {
    const similarTasks = await this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.estimates', 'estimate')
      .leftJoinAndSelect('task.feedbacks', 'feedback')
      .where('task.technology LIKE :tech', { tech: `%${taskDto.technology}%` })
      .andWhere('task.experienceLevel = :exp', { exp: taskDto.experienceLevel })
      .andWhere('estimate.source = :source', { source: EstimateSource.AI })
      .andWhere('feedback.actualHours IS NOT NULL')
      .orderBy('task.createdAt', 'DESC')
      .limit(20)
      .getMany();

    if (similarTasks.length < 3) {
      // Not enough data for a meaningful correction
      return { correctedEstimate: original, averageErrorRatio: 0 };
    }

    let totalErrorRatio = 0;
    let count = 0;

    for (const task of similarTasks) {
      const aiEstimate = task.estimates.find(
        (e) => e.source === EstimateSource.AI
      );
      const feedback = task.feedbacks[0];

      if (
        aiEstimate &&
        aiEstimate.finalEstimate > 0 &&
        feedback &&
        feedback.actualHours > 0
      ) {
        const errorRatio =
          (feedback.actualHours - aiEstimate.finalEstimate) /
          aiEstimate.finalEstimate;
        totalErrorRatio += errorRatio;
        count++;
      }
    }

    if (count === 0) {
      return { correctedEstimate: original, averageErrorRatio: 0 };
    }

    const averageErrorRatio = totalErrorRatio / count;
    const correctedEstimate = original * (1 + averageErrorRatio);

    return { correctedEstimate, averageErrorRatio };
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
    let confidence = 0.99; // Start high

    // 1. Penalize for high divergence between top-down and bottom-up
    if (args.divergence > 0.5) confidence -= 0.25;
    else if (args.divergence > 0.25) confidence -= 0.1;

    // 2. Penalize for historical inaccuracy
    const absError = Math.abs(args.historicalError);
    if (absError > 0.4) confidence -= 0.2;
    else if (absError > 0.2) confidence -= 0.1;

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

  private buildClarificationRequestPrompt(taskDto: CreateTaskDto): string {
    return `
      The user has provided a very brief task description: "${taskDto.title} - ${taskDto.description}".
      This is not enough information to create an estimate.
      Your task is to generate 3-5 critical questions to ask the user to clarify the requirements.
      Return these questions in a JSON object with a single key "questions", which is an array of strings.
      Example: { "questions": ["What color should the button be?", "Where should it be placed?"] }
    `;
  }

  private buildEstimationPrompt(
    taskDto: CreateTaskDto,
    project: Project,
    history: { question: string; answer: string }[] = []
  ): string {
    const historyStr = history
      .map((h) => `Q: ${h.question}\n\nA: ${h.answer}`)
      .join('\n\n');

    const instructions = [
      `1. Break down the task into a list of 2-5 technical subtasks. For each subtask, provide a title, a brief technical description, an estimated time in hours, and a short explanation for the estimate.`,
      `2. Provide the output in a JSON object with the following structure: { "subtasks": [{ "title": string, "description": string, "estimateHours": number, "explanation": string }], "risks": [{ "risk": string, "mitigation": string }] | null, "managerNote": string | null, "questions": null }`,
    ];

    let instructionNumber = 3;

    if (taskDto.generateRiskAnalysis) {
      instructions.push(
        `${instructionNumber++}. Identify 2-3 potential risks for this task and suggest a mitigation strategy for each. The risks should be in the 'risks' array.`
      );
    } else {
      instructions.push(
        `${instructionNumber++}. The 'risks' field should be null.`
      );
    }

    if (taskDto.generateManagerNote) {
      instructions.push(
        `${instructionNumber++}. Add a 'managerNote' field with a brief, high-level summary (2-3 sentences) for a non-technical manager, explaining the core work and potential challenges.`
      );
    } else {
      instructions.push(
        `${instructionNumber++}. The 'managerNote' field should be null.`
      );
    }

    return `
      You are an expert software engineering estimator.
      Your task is to analyze the following task and provide a detailed estimate.

      **Project Context:**
      - Project Name: ${project.name}
      - Project Description: ${project.description}
      - Project Complexity: ${project.complexity}

      **Task Details:**
      - Title: ${taskDto.title}
      - Description: ${taskDto.description}
      - Technology: ${taskDto.technology}
      - Experience Level Required: ${taskDto.experienceLevel}

      **Clarification History:**
      ${history.length > 0 ? historyStr : 'No clarification was needed.'}

      **Your Instructions:**
      ${instructions.join('\n')}
    `;
  }
}
