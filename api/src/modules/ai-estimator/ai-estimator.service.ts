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

interface SpecQualityResponse {
  score: number;
  missing: string[];
  reasons: string[];
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

  private getSpecQualitySchema() {
    return {
      name: 'SpecQuality',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          score: { type: 'number', minimum: 0, maximum: 1 },
          reasons: { type: 'array', items: { type: 'string' } },
          missing: { type: 'array', items: { type: 'string' } },
        },
        required: ['score'],
      },
      strict: true,
    } as const;
  }

  private async assessSpecQuality(
    taskDto: CreateTaskDto,
    project: Project,
    history: { question: string; answer: string }[]
  ): Promise<SpecQualityResponse> {
    const clarifierModel = this.configService.get<string>(
      'OPENAI_CLARIFIER_MODEL',
      'gpt-4o-mini'
    );
    const historyStr =
      history?.length > 0
        ? history.map((h) => `Q: ${h.question}\nA: ${h.answer}`).join('\n')
        : 'No history.';
    const prompt = `You are assessing the quality of a task description for software effort estimation.
Return a JSON with fields: score (0..1), reasons (why the score), and missing (key aspects that are not specified).
Consider acceptance criteria, scope boundaries, dependencies/integrations, environments, data models, UX specifics, testing requirements, and documentation needs.

Project: ${project.name} (${project.complexity})
Title: ${taskDto.title}
Description: ${taskDto.description}
Technology: ${taskDto.technology}
Experience: ${taskDto.experienceLevel}
History: ${historyStr}`;

    const res = await this.chatWithOptionalSchema(
      clarifierModel,
      [{ role: 'user', content: prompt }],
      0,
      this.getSpecQualitySchema()
    );
    const content = res.choices[0].message.content || '{}';
    return JSON.parse(content) as SpecQualityResponse;
  }

  // Strict JSON schema for AI responses (either questions or estimate)
  private getAiResponseSchema() {
    return {
      name: 'AiAnalysis',
      schema: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              questions: {
                type: 'array',
                minItems: 1,
                items: { type: 'string' },
              },
              subtasks: { type: 'null' },
              risks: { type: 'null' },
              managerNote: { type: ['string', 'null'] },
            },
            required: ['questions'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              subtasks: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    estimateHours: { type: 'number' },
                    explanation: { type: 'string' },
                  },
                  required: [
                    'title',
                    'description',
                    'estimateHours',
                    'explanation',
                  ],
                },
              },
              risks: {
                anyOf: [
                  { type: 'null' },
                  {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        risk: { type: 'string' },
                        mitigation: { type: 'string' },
                      },
                      required: ['risk', 'mitigation'],
                    },
                  },
                ],
              },
              managerNote: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              questions: { type: 'null' },
            },
            required: ['subtasks', 'questions'],
          },
        ],
      },
      strict: true,
    } as const;
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
    // 0) Run spec quality assessment to decide whether to ask questions first
    const isFirstCycle = history.length === 0;
    const descLen = taskDto.description?.length ?? 0;
    let specQuality: SpecQualityResponse | null = null;
    try {
      specQuality = await this.assessSpecQuality(taskDto, project, history);
    } catch (e) {
      this.logger.warn(`Spec quality assessment failed, falling back. ${e}`);
    }

    const needsQuestions = (() => {
      if (!specQuality) return isFirstCycle && descLen < 50; // fallback heuristic
      if (isFirstCycle && specQuality.score < 0.6) return true;
      if (specQuality.score < 0.4) return true; // even in later cycles, still too vague
      return false;
    })();

    const prompt = needsQuestions
      ? this.buildClarificationRequestPrompt(taskDto, specQuality?.missing)
      : this.buildEstimationPrompt(taskDto, project, history);

    const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o');

    const messages = [
      {
        role: 'system',
        content:
          'You are an expert software engineering estimator. Always return a single JSON object that strictly matches the provided JSON Schema. Do not include any extra keys or text outside JSON.',
      },
      { role: 'user', content: prompt },
    ] as any;

    try {
      const schema = needsQuestions
        ? {
            name: 'ai_questions_response',
            schema: this.getQuestionsSchema(),
            strict: true,
          }
        : {
            name: 'ai_estimate_response',
            schema: this.getEstimateSchema(),
            strict: true,
          };

      const response = await this.chatWithOptionalSchema(
        model,
        messages,
        0.2,
        schema
      );

      const content = response.choices[0].message.content;
      if (!content) throw new Error('Empty AI response');

      const parsed = JSON.parse(content) as
        | AiEstimateResponse
        | AiQuestionsResponse;

      if (
        'questions' in parsed &&
        parsed.questions &&
        Array.isArray(parsed.questions) &&
        parsed.questions.length > 0
      ) {
        return { type: 'questions', data: parsed as AiQuestionsResponse };
      }

      if (
        'subtasks' in parsed &&
        parsed.subtasks &&
        Array.isArray(parsed.subtasks) &&
        parsed.subtasks.length > 0
      ) {
        return { type: 'estimate', data: parsed as AiEstimateResponse };
      }

      throw new Error('Invalid AI response structure');
    } catch (error) {
      this.logger.error(
        'Failed to get AI analysis',
        (error as any)?.stack || String(error)
      );
      throw error;
    }
  }

  private validateAiResponseStructure(
    parsed: any
  ): parsed is AiEstimateResponse | AiQuestionsResponse {
    if (!parsed || typeof parsed !== 'object') return false;

    // Questions-only response
    if (Array.isArray(parsed.questions)) {
      return parsed.subtasks == null && parsed.risks == null;
    }

    // Estimate response
    if (Array.isArray(parsed.subtasks)) {
      const validSubtasks = parsed.subtasks.every(
        (s: any) =>
          s &&
          typeof s.title === 'string' &&
          typeof s.description === 'string' &&
          typeof s.estimateHours === 'number' &&
          isFinite(s.estimateHours) &&
          typeof s.explanation === 'string'
      );
      const validRisks =
        parsed.risks == null ||
        (Array.isArray(parsed.risks) &&
          parsed.risks.every(
            (r: any) =>
              r &&
              typeof r.risk === 'string' &&
              typeof r.mitigation === 'string'
          ));
      const validManagerNote =
        parsed.managerNote == null || typeof parsed.managerNote === 'string';
      const questionsNull = parsed.questions == null;
      return validSubtasks && validRisks && validManagerNote && questionsNull;
    }

    return false;
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
      .limit(50)
      .getMany();

    if (similarTasks.length < 3) {
      // Not enough data for a meaningful correction
      return { correctedEstimate: original, averageErrorRatio: 0 };
    }

    // Determine target archetype category to score similarity
    const targetPrior = this.getTaskPriors(taskDto);

    const items: { error: number; weight: number }[] = [];
    let idx = 0;
    for (const task of similarTasks) {
      const aiEstimate = task.estimates.find(
        (e) => e.source === EstimateSource.AI
      );
      const feedback = task.feedbacks[0];
      if (!aiEstimate || !feedback) continue;
      if (!aiEstimate.finalEstimate || aiEstimate.finalEstimate <= 0) continue;
      if (!feedback.actualHours || feedback.actualHours <= 0) continue;

      const errorRatio =
        (feedback.actualHours - aiEstimate.finalEstimate) /
        aiEstimate.finalEstimate;

      // Similarity 0..1
      const sim = this.computeSimilarityScore(
        task as any,
        taskDto,
        targetPrior.category
      );
      // Freshness weight: more recent → closer to 1.0
      const recency = 1 - idx / Math.max(1, similarTasks.length - 1); // 1..0
      const weight = 0.6 * sim + 0.4 * recency;

      items.push({ error: errorRatio, weight });
      idx++;
    }

    if (items.length < 3) {
      return { correctedEstimate: original, averageErrorRatio: 0 };
    }

    // Winsorize errors at 10%
    const errors = items.map((x) => x.error);
    const [lo, hi] = this.winsorizeBounds(errors, 0.1);
    const clipped = items.map((x) => ({
      error: Math.max(lo, Math.min(hi, x.error)),
      weight: x.weight,
    }));

    // Keep top-15 by weight to reduce noise
    clipped.sort((a, b) => b.weight - a.weight);
    const top = clipped.slice(0, Math.min(15, clipped.length));

    // Weighted median error
    const medianError = this.computeWeightedMedian(
      top.map((x) => x.error),
      top.map((x) => x.weight)
    );

    // Clamp correction strength
    const boundedMedian = Math.max(-0.6, Math.min(0.6, medianError));
    const correctedEstimate = original * (1 + boundedMedian);

    return { correctedEstimate, averageErrorRatio: boundedMedian };
  }

  private computeSimilarityScore(
    pastTask: any,
    target: CreateTaskDto,
    targetCategory?: 'fe_small' | 'integration' | 'backend'
  ): number {
    const pastText = `${pastTask.title ?? ''} ${
      pastTask.description ?? ''
    }`.toLowerCase();
    const targetText = `${target.title} ${target.description}`.toLowerCase();
    let score = 0;

    // Archetype match
    try {
      const pastPrior = this.getTaskPriors({
        title: pastTask.title ?? '',
        description: pastTask.description ?? '',
        technology: pastTask.technology ?? '',
        experienceLevel: pastTask.experienceLevel ?? target.experienceLevel,
      } as any);
      if (
        pastPrior.category &&
        targetCategory &&
        pastPrior.category === targetCategory
      )
        score += 0.4;
    } catch (_) {}

    // Tech keyword overlap
    const techKeywords = [
      'react',
      'next',
      'vue',
      'angular',
      'nest',
      'express',
      'django',
      'spring',
      'graphql',
      'rest',
      'crud',
    ];
    const overlap = techKeywords.filter(
      (k) => pastText.includes(k) && targetText.includes(k)
    ).length;
    if (overlap > 0) score += Math.min(0.3, 0.1 * overlap);

    // Domain keywords overlap (tables, forms, auth, i18n, cache, queue, api)
    const domain = [
      'table',
      'filter',
      'pagination',
      'form',
      'validation',
      'auth',
      '2fa',
      'i18n',
      'cache',
      'queue',
      'api',
      'webhook',
    ];
    const domainOverlap = domain.filter(
      (k) => pastText.includes(k) && targetText.includes(k)
    ).length;
    if (domainOverlap > 0) score += Math.min(0.2, 0.1 * domainOverlap);

    // Experience match bonus
    if ((pastTask.experienceLevel ?? '') === target.experienceLevel)
      score += 0.1;

    return Math.max(0, Math.min(1, score));
  }

  private computeWeightedMedian(values: number[], weights: number[]): number {
    const pairs = values.map((v, i) => ({ v, w: Math.max(1e-6, weights[i]) }));
    pairs.sort((a, b) => a.v - b.v);
    const total = pairs.reduce((s, p) => s + p.w, 0);
    let acc = 0;
    for (const p of pairs) {
      acc += p.w;
      if (acc >= total / 2) return p.v;
    }
    return pairs[pairs.length - 1]?.v ?? 0;
  }

  private winsorizeBounds(arr: number[], p: number): [number, number] {
    if (arr.length === 0) return [0, 0];
    const sorted = [...arr].sort((a, b) => a - b);
    const loIdx = Math.floor(p * (sorted.length - 1));
    const hiIdx = Math.ceil((1 - p) * (sorted.length - 1));
    return [sorted[loIdx], sorted[hiIdx]];
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

  private buildTopDownPrompt(taskDto: CreateTaskDto, project: Project): string {
    return `You are an expert engineering manager.
Provide a single top-down estimate of total effort for the following task strictly in HOURS as a plain number (e.g., 18). Do NOT answer in days or weeks.
Consider typical ranges for similar tasks and avoid extreme values unless the description clearly justifies it.

Project: ${project.name} (${project.complexity})
Technology: ${taskDto.technology}
Experience Level: ${taskDto.experienceLevel}
Title: ${taskDto.title}
Description: ${taskDto.description}`;
  }

  private buildTopDownPromptStrict(
    taskDto: CreateTaskDto,
    project: Project
  ): string {
    return `Return ONLY one number representing HOURS for the following task. No words, no units, no explanations. Example: 12.5

Project: ${project.name} (${project.complexity})
Tech: ${taskDto.technology}
Experience: ${taskDto.experienceLevel}
Title: ${taskDto.title}
Description: ${taskDto.description}`;
  }

  private async getTopDownWithRetries(
    taskDto: CreateTaskDto,
    project: Project,
    model: string,
    logs: string[],
    priors: { matched: boolean; min: number; max: number; priorP50: number },
    bottomUp: number
  ): Promise<number> {
    // Try normal prompt
    let prompt = this.buildTopDownPrompt(taskDto, project);
    let td = this.sanitize(await this.requestEstimateOnly(prompt, model));
    if (td > 0) return td;

    logs.push('Top-down empty/invalid, retrying (strict #1)');
    // Strict retry #1
    prompt = this.buildTopDownPromptStrict(taskDto, project);
    td = this.sanitize(await this.requestEstimateOnly(prompt, model));
    if (td > 0) return td;

    logs.push('Top-down still invalid, retrying (strict #2)');
    // Strict retry #2
    td = this.sanitize(await this.requestEstimateOnly(prompt, model));
    if (td > 0) return td;

    // Fallback
    if (priors.matched && priors.priorP50 > 0) {
      logs.push(`Top-down fallback → priorP50 ${priors.priorP50.toFixed(1)}h`);
      return this.sanitize(priors.priorP50);
    }
    logs.push(`Top-down fallback → bottom-up ${bottomUp.toFixed(1)}h`);
    return bottomUp;
  }

  public async computeCalibratedEstimate(args: {
    totalBottomUp: number;
    subtasksCount: number;
    taskDto: CreateTaskDto;
    project: Project;
    risksCount: number;
  }): Promise<{
    p10: number;
    p50: number;
    p90: number;
    confidence: number;
    explanation: string;
    logs: string[];
    topDown: number;
    bottomUp: number;
    divergencePct: number;
  }> {
    const logs: string[] = [];
    const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o');

    // Pre-calc priors for retries/fallback
    const priors = this.getTaskPriors(args.taskDto);

    // 1) Top-down estimate with strict retries and fallback
    const bottomUp = this.sanitize(args.totalBottomUp);
    const topDown = await this.getTopDownWithRetries(
      args.taskDto,
      args.project,
      model,
      logs,
      priors,
      bottomUp
    );
    logs.push(`Top-down: ${topDown.toFixed(1)}h`);

    // 2) Bottom-up base
    logs.push(`Bottom-up: ${bottomUp.toFixed(1)}h`);
    // 2a) Apply task priors and clamp TD if archetype matched
    let tdEffective = topDown;
    if (priors.matched) {
      const clamped = Math.max(priors.min, Math.min(priors.max, tdEffective));
      if (clamped !== tdEffective) {
        logs.push(
          `Top-down clamped to archetype bounds [${priors.min}-${
            priors.max
          }] → ${clamped.toFixed(1)}h`
        );
      }
      // Blend with prior to ground the estimate
      const preliminaryDiv = (() => {
        const denom = clamped + bottomUp;
        return denom > 0 ? (200 * Math.abs(bottomUp - clamped)) / denom : 0;
      })();
      const weightPrior = preliminaryDiv > 60 ? 0.85 : 0.7;
      const blended = this.sanitize(
        weightPrior * priors.priorP50 + (1 - weightPrior) * clamped
      );
      if (Math.abs(blended - clamped) > 0.25) {
        logs.push(
          `Top-down blended with prior (w_prior=${weightPrior.toFixed(
            2
          )}) → ${blended.toFixed(1)}h (prior ${priors.priorP50.toFixed(1)}h)`
        );
      }
      tdEffective = blended;
    }

    // 3) Divergence (symmetric): 200 * |TD - BU| / (TD + BU)
    const denom = tdEffective + bottomUp;
    const symDivPct =
      denom > 0 ? (200 * Math.abs(bottomUp - tdEffective)) / denom : 0;
    logs.push(`Divergence (symmetric): ${symDivPct.toFixed(1)}%`);

    // 4) Apply context modifiers to bottom-up
    const adjusted = this.applyModifiers(
      bottomUp,
      args.taskDto,
      args.project,
      logs
    );
    const adjustedClamped = this.sanitize(adjusted);
    logs.push(`Adjusted (context): ${adjustedClamped.toFixed(1)}h`);

    // 5) Historical correction
    const { correctedEstimate, averageErrorRatio } =
      await this.getCorrectedEstimate(adjustedClamped, args.taskDto);
    const correctedClamped = this.sanitize(correctedEstimate);
    logs.push(
      `Historical correction (${(averageErrorRatio * 100).toFixed(
        1
      )}%): ${correctedClamped.toFixed(1)}h`
    );

    // 6) Confidence
    const confidence = this.calculateConfidence({
      description: args.taskDto.description,
      divergence: symDivPct / 100, // 0..2
      historicalError: averageErrorRatio,
      manualEstimate: args.taskDto.manualEstimate,
      aiEstimate: correctedClamped,
    });
    logs.push(`Confidence: ${(confidence * 100).toFixed(0)}%`);

    // 7) Optional gentle anchoring to manual estimate if present and divergence high
    let p50 = correctedClamped;
    if (
      typeof args.taskDto.manualEstimate === 'number' &&
      args.taskDto.manualEstimate > 0
    ) {
      const manual = this.sanitize(args.taskDto.manualEstimate);
      const overFactor = p50 / manual;
      if (overFactor > 3 && symDivPct > 60) {
        // Pull towards manual by 20% without overfitting
        const anchored = this.sanitize(0.8 * p50 + 0.2 * manual);
        logs.push(
          `Anchored slightly towards manual (${manual}h) → ${anchored.toFixed(
            1
          )}h`
        );
        p50 = anchored;
      }
    }

    // 8) Range (tuned spreads by archetype) + sanity clamps
    const riskFactor = Math.min(0.2, args.risksCount * 0.05);
    let baseSpread = 0.22;
    if (priors.matched && priors.category === 'fe_small') baseSpread = 0.14;
    else if (priors.matched && priors.category === 'integration')
      baseSpread = 0.26;
    else if (priors.matched && priors.category === 'backend') baseSpread = 0.2;

    const confidenceInfluence = (1 - confidence) * 0.1; // up to +10%
    let spread = Math.min(0.35, baseSpread + riskFactor + confidenceInfluence);

    let p10 = this.sanitize(p50 * (1 - spread));
    let p90 = this.sanitize(p50 * (1 + spread));

    // Sanity: bound ratios
    const maxRatio = 1.6;
    if (p90 / p50 > maxRatio) p90 = this.sanitize(p50 * maxRatio);
    if (p50 / Math.max(0.25, p10) > maxRatio)
      p10 = this.sanitize(p50 / maxRatio);
    logs.push(
      `Range: p10=${p10.toFixed(1)}h, p50=${p50.toFixed(1)}h, p90=${p90.toFixed(
        1
      )}h`
    );

    const explanation = [
      `Derived from ${args.subtasksCount} subtasks (bottom-up) and a top-down cross-check.`,
      `Adjusted for project context (complexity=${args.project.complexity}, overhead=${args.project.overhead}%).`,
      `Calibrated using recent similar tasks (avg error ${(
        averageErrorRatio * 100
      ).toFixed(0)}%).`,
      priors.matched
        ? `Applied task prior (p50≈${priors.priorP50.toFixed(1)}h, bounds ${
            priors.min
          }-${priors.max}h).`
        : '',
      `Divergence (symmetric) ${symDivPct.toFixed(0)}%; confidence ${(
        confidence * 100
      ).toFixed(0)}%.`,
    ].join(' ');

    return {
      p10,
      p50,
      p90,
      confidence,
      explanation,
      logs,
      topDown: tdEffective,
      bottomUp,
      divergencePct: symDivPct,
    };
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

    // Normalize experience level to support both 'mid' and 'middle'
    const exp = String(taskDto.experienceLevel).toLowerCase();
    switch (exp) {
      case 'junior':
        multiplier *= 1.25;
        break;
      case 'mid':
      case 'middle':
        multiplier *= 0.95; // MIDDLE a bit faster on typical FE tasks
        break;
      case 'senior':
        multiplier *= 0.85;
        break;
    }

    // Frontend stacks often faster to deliver small UI tasks
    if (/react|next/i.test(taskDto.technology)) multiplier *= 0.92;
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

  // Very simple heuristic priors for common scopes to prevent extreme TD values
  private getTaskPriors(taskDto: CreateTaskDto): {
    matched: boolean;
    min: number;
    max: number;
    priorP50: number;
    category?: 'fe_small' | 'integration' | 'backend';
  } {
    const text = `${taskDto.title} ${taskDto.description}`.toLowerCase();
    const tech = taskDto.technology.toLowerCase();

    // FE: Responsive marketing landing page (React)
    if (/landing\s*page|\blanding\b/.test(text) && /react|next/.test(tech)) {
      let mid = 16;
      if (/animation|animated|gsap|lottie/.test(text)) mid += 4;
      if (/seo|search engine|meta/.test(text)) mid += 4;
      const min = Math.max(6, mid * 0.6);
      const max = Math.min(40, mid * 1.6);
      return { matched: true, min, max, priorP50: mid, category: 'fe_small' };
    }

    // FE: Simple form/CRUD page (React/Vue/Angular)
    if (
      /form|crud|create|edit|delete|submit/.test(text) &&
      /react|next|vue|nuxt|angular/.test(tech)
    ) {
      let mid = 12; // includes basic validation and API wiring
      if (/validation|yup|zod|complex/.test(text)) mid += 4;
      const min = Math.max(5, mid * 0.6);
      const max = Math.min(36, mid * 1.7);
      return { matched: true, min, max, priorP50: mid, category: 'fe_small' };
    }

    // FE: Table with filters/sorting/pagination
    if (
      /table|grid/.test(text) &&
      /filter|sort|pagination|infinite/.test(text)
    ) {
      let mid = 18;
      if (/server[- ]?side|virtual/.test(text)) mid += 6;
      const min = Math.max(8, mid * 0.6);
      const max = Math.min(48, mid * 1.7);
      return { matched: true, min, max, priorP50: mid, category: 'fe_small' };
    }

    // FE: Auth (login/reset/2FA)
    if (/auth|login|sign[- ]?in|reset|2fa|otp/.test(text)) {
      let mid = 14;
      if (/2fa|otp/.test(text)) mid += 4;
      const min = Math.max(6, mid * 0.6);
      const max = Math.min(40, mid * 1.7);
      return { matched: true, min, max, priorP50: mid, category: 'fe_small' };
    }

    // FE: i18n
    if (/i18n|internationalization|localization|translate/.test(text)) {
      const mid = 10;
      const min = 5;
      const max = 28;
      return { matched: true, min, max, priorP50: mid, category: 'fe_small' };
    }

    // FE: SSR/Next.js page
    if (/ssr|server[- ]side rendering/.test(text) && /next/.test(tech)) {
      const mid = 16;
      const min = 7;
      const max = 42;
      return { matched: true, min, max, priorP50: mid, category: 'fe_small' };
    }

    // BE: REST CRUD (Node/Nest, Django, Spring)
    if (
      /crud|endpoint|rest/.test(text) &&
      /nest|express|django|spring|fastapi/.test(tech)
    ) {
      let mid = 18;
      if (/auth|rbac|permissions/.test(text)) mid += 6;
      const min = Math.max(8, mid * 0.6);
      const max = Math.min(60, mid * 1.8);
      return { matched: true, min, max, priorP50: mid, category: 'backend' };
    }

    // BE: External API integration
    if (/integrat|external api|third[- ]party|webhook/.test(text)) {
      let mid = 20;
      if (/oauth|signature|retry|rate[- ]?limit/.test(text)) mid += 6;
      const min = Math.max(8, mid * 0.6);
      const max = Math.min(72, mid * 1.8);
      return {
        matched: true,
        min,
        max,
        priorP50: mid,
        category: 'integration',
      };
    }

    // Infra-ish: cache/queue wiring
    if (/cache|redis|queue|sqs|rabbit|kafka/.test(text)) {
      const mid = 14;
      const min = 6;
      const max = 40;
      return { matched: true, min, max, priorP50: mid, category: 'backend' };
    }

    // Default: no match
    return { matched: false, min: 0, max: 0, priorP50: 0 };
  }

  private calculateConfidence(args: {
    description: string;
    divergence: number; // 0..2 from symmetric divergence / 100
    historicalError: number; // mean/median error ratio, may be negative
    manualEstimate?: number;
    aiEstimate: number;
  }): number {
    // Build a score: higher is better
    const descLen = args.description.length;
    const quality =
      descLen >= 200 ? 1 : descLen >= 120 ? 0.8 : descLen >= 60 ? 0.6 : 0.3;
    const hasTech =
      /api|ui|test|database|sql|react|next|nest|django|spring|graphql|баз данных/i.test(
        args.description
      )
        ? 1
        : 0;
    const div = Math.min(2, Math.max(0, args.divergence));
    const histAbs = Math.min(1, Math.abs(args.historicalError));

    let manualDisagree = 0;
    if (args.manualEstimate && args.manualEstimate > 0) {
      manualDisagree = Math.min(
        1,
        Math.abs(args.aiEstimate - args.manualEstimate) / args.manualEstimate
      );
    }

    // Weighted score 0..1 (higher better)
    const score =
      0.35 * quality +
      0.1 * hasTech +
      0.25 * (1 - div / 2) +
      0.2 * (1 - histAbs) +
      0.1 * (1 - manualDisagree);

    // Logistic squashing to [0.2, 0.95]
    // map score (0..1) to z in (-inf..inf)
    const z = 6 * (score - 0.5); // center at 0.5
    const sigmoid = 1 / (1 + Math.exp(-z));
    const conf = 0.2 + sigmoid * (0.95 - 0.2);
    return Math.max(0.2, Math.min(0.95, conf));
  }

  private getEstimateSchema(): Record<string, any> {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['subtasks', 'risks', 'managerNote', 'questions'],
      properties: {
        subtasks: {
          type: 'array',
          minItems: 2,
          maxItems: 7,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'description', 'estimateHours', 'explanation'],
            properties: {
              title: { type: 'string', minLength: 1 },
              description: { type: 'string', minLength: 1 },
              estimateHours: { type: 'number', minimum: 0.25, maximum: 200 },
              explanation: { type: 'string', minLength: 1 },
            },
          },
        },
        risks: {
          anyOf: [
            {
              type: 'array',
              minItems: 0,
              maxItems: 5,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['risk', 'mitigation'],
                properties: {
                  risk: { type: 'string', minLength: 1 },
                  mitigation: { type: 'string', minLength: 1 },
                },
              },
            },
            { type: 'null' },
          ],
        },
        managerNote: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        questions: { type: 'null' },
      },
    };
  }

  // Wrapper to use response_format with JSON schema when supported; otherwise retry without it
  private async chatWithOptionalSchema(
    model: string,
    messages: { role: 'user' | 'system' | 'assistant'; content: string }[],
    temperature: number,
    jsonSchema?: { name: string; schema: any; strict?: boolean }
  ) {
    try {
      if (jsonSchema) {
        return await this.openai.chat.completions.create({
          model,
          messages: messages as any,
          temperature,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: jsonSchema.name,
              schema: jsonSchema.schema,
              strict: jsonSchema.strict ?? true,
            },
          } as any,
        });
      }
      return await this.openai.chat.completions.create({
        model,
        messages: messages as any,
        temperature,
      });
    } catch (err: any) {
      const message = err?.message || '';
      if (
        message.includes("'response_format'") ||
        message.includes('json_schema')
      ) {
        this.logger.warn(
          `Model ${model} does not support structured outputs; retrying without response_format.`
        );
        return await this.openai.chat.completions.create({
          model,
          messages: messages as any,
          temperature,
        });
      }
      throw err;
    }
  }

  private getQuestionsSchema(): Record<string, any> {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['subtasks', 'risks', 'managerNote', 'questions'],
      properties: {
        subtasks: { type: 'null' },
        risks: { type: 'null' },
        managerNote: { type: 'null' },
        questions: {
          type: 'array',
          minItems: 3,
          maxItems: 7,
          items: { type: 'string', minLength: 3 },
        },
      },
    };
  }

  private buildClarificationRequestPrompt(
    taskDto: CreateTaskDto,
    missing?: string[]
  ): string {
    const missingHint =
      missing && missing.length > 0
        ? `Focus on clarifying these missing aspects if relevant: ${missing.join(
            ', '
          )}.`
        : '';
    return `
      The user provided the task: "${taskDto.title} - ${taskDto.description}".
      Your task is to generate 3-7 critical, concise questions to clarify requirements needed for accurate time estimation.
      Avoid generic questions; be specific and non-technical where possible.
      ${missingHint}
      Return a JSON object: { "questions": [string, ...] } only.
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
