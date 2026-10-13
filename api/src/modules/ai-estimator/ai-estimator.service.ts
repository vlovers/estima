import { EstimateSource } from '../estimates/entities/estimate.entity';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { Project } from '../projects/entities/project.entity';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Task } from '../tasks/entities/task.entity';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { CalibrationService } from '../calibration/calibration.service';

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
  // PR-6: pipeline versioning and read-through cache (in-memory with TTL)
  private readonly pipelineVersion = '1.7.0';
  private readonly cacheTtlMs = 24 * 60 * 60 * 1000; // 24 hours
  private readonly analysisCache = new Map<
    string,
    { createdAt: number; version: string; result: AiAnalysisResult }
  >();
  // PR-7: semantic similarity (embeddings) — in-memory cache
  private readonly embeddingModel = this.configService.get<string>(
    'OPENAI_EMBEDDING_MODEL',
    'text-embedding-3-small'
  );
  private readonly embedCache = new Map<string, number[]>(); // key: sha256(text)

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly calibrationService: CalibrationService
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  private hashText(text: string): string {
    return createHash('sha256').update(text || '').digest('hex');
  }

  private cosine(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0,
      na = 0,
      nb = 0;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      dot += x * y;
      na += x * x;
      nb += y * y;
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  private async getEmbeddings(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    const toQuery: { idx: number; text: string; key: string }[] = [];
    // Check cache first
    texts.forEach((t, idx) => {
      const key = this.hashText(t);
      const cached = this.embedCache.get(key);
      if (cached) {
        vectors[idx] = cached;
      } else {
        toQuery.push({ idx, text: t, key });
      }
    });
    if (toQuery.length > 0) {
      const res = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: toQuery.map((x) => x.text),
      } as any);
      res.data.forEach((d: any, i: number) => {
        const vec = d.embedding as number[];
        const meta = toQuery[i];
        this.embedCache.set(meta.key, vec);
        vectors[meta.idx] = vec;
      });
    }
    return vectors;
  }

  // Build a deterministic input hash for caching
  private buildInputHash(
    taskDto: CreateTaskDto,
    project: Project,
    history: { question: string; answer: string }[]
  ): string {
    // Canonicalize data shape; include pipelineVersion so cache invalidates on logic changes
    const payload = {
      pipelineVersion: this.pipelineVersion,
      task: {
        title: taskDto.title,
        description: taskDto.description,
        technology: taskDto.technology,
        experienceLevel: taskDto.experienceLevel,
        tags: (taskDto.tags || []).slice().sort(),
        breakdown: (taskDto as any).breakdown ?? true,
        generateRiskAnalysis: (taskDto as any).generateRiskAnalysis ?? false,
        generateManagerNote: (taskDto as any).generateManagerNote ?? false,
        manualEstimate: (taskDto as any).manualEstimate ?? null,
        acceptanceCriteria: (taskDto as any).acceptanceCriteria
          ? [...(taskDto as any).acceptanceCriteria]
          : [],
        assumptions: (taskDto as any).assumptions
          ? [...(taskDto as any).assumptions]
          : [],
        constraints: (taskDto as any).constraints
          ? [...(taskDto as any).constraints]
          : [],
        nfrs: (taskDto as any).nfrs
          ? (taskDto as any).nfrs.map((n: any) => ({
              category: String(n.category),
              requirement: String(n.requirement),
              target: n.target != null ? String(n.target) : undefined,
            }))
          : [],
        integrations: (taskDto as any).integrations
          ? (taskDto as any).integrations
              .map((i: any) => ({
                name: String(i.name),
                type: i.type != null ? String(i.type) : undefined,
                interaction: String(i.interaction),
                auth: i.auth != null ? String(i.auth) : undefined,
                sandbox: Boolean(i.sandbox ?? false),
              }))
              .sort((a: any, b: any) => (a.name + a.interaction).localeCompare(b.name + b.interaction))
          : [],
        testing: (taskDto as any).testing
          ? {
              unit: Boolean((taskDto as any).testing.unit ?? true),
              integration: Boolean((taskDto as any).testing.integration ?? false),
              e2e: Boolean((taskDto as any).testing.e2e ?? false),
              unitCoverageTarget:
                typeof (taskDto as any).testing.unitCoverageTarget === 'number'
                  ? (taskDto as any).testing.unitCoverageTarget
                  : undefined,
              performance: Boolean((taskDto as any).testing.performance ?? false),
              security: Boolean((taskDto as any).testing.security ?? false),
            }
          : null,
        documentation: (taskDto as any).documentation
          ? {
              userDocs: Boolean((taskDto as any).documentation.userDocs ?? false),
              apiDocs: Boolean((taskDto as any).documentation.apiDocs ?? false),
              readme: Boolean((taskDto as any).documentation.readme ?? false),
              changelog: Boolean((taskDto as any).documentation.changelog ?? false),
            }
          : null,
        complexityTags: ((taskDto as any).complexityTags || [])
          .slice()
          .map((x: any) => String(x))
          .sort(),
        uiDesignComplexity: (taskDto as any).uiDesignComplexity ?? null,
        needsDataMigration: Boolean((taskDto as any).needsDataMigration ?? false),
        migrationComplexity: (taskDto as any).migrationComplexity ?? null,
      },
      project: {
        id: project.id,
        complexity: project.complexity,
        overhead: project.overhead,
      },
      history: (history || []).map((h) => ({
        q: h.question,
        a: h.answer,
      })),
    };
    const json = JSON.stringify(payload);
    return createHash('sha256').update(json).digest('hex');
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
    // PR-6: cache lookup
    const inputHash = this.buildInputHash(taskDto, project, history);
    const cached = this.analysisCache.get(inputHash);
    if (cached) {
      const fresh = Date.now() - cached.createdAt < this.cacheTtlMs;
      const sameVersion = cached.version === this.pipelineVersion;
      if (fresh && sameVersion) {
        this.logger.log(`Cache hit for analysis ${inputHash.slice(0, 8)} (v${cached.version})`);
        return cached.result;
      }
      this.logger.log(
        `Cache stale/mismatch for ${inputHash.slice(0, 8)} (fresh=${fresh}, versionOk=${sameVersion}); recomputing.`
      );
    } else {
      this.logger.log(`Cache miss for analysis ${inputHash.slice(0, 8)}; computing.`);
    }

    // 0) Run spec quality assessment to decide whether to ask questions first
    const isFirstCycle = history.length === 0;
    const descLen = taskDto.description?.length ?? 0;
    let specQuality: SpecQualityResponse | null = null;
    try {
      specQuality = await this.assessSpecQuality(taskDto, project, history);
      // Structured log for spec quality
      this.logger.log(
        `SpecQuality: score=${specQuality.score?.toFixed?.(2) ?? 'n/a'}; missing=${(specQuality.missing || []).join(', ')}; reasons=${(specQuality.reasons || []).join(' | ')}`
      );
    } catch (e) {
      this.logger.warn(`Spec quality assessment failed, falling back. ${e}`);
    }

    const needsQuestions = (() => {
      if (!specQuality) return isFirstCycle && descLen < 50; // fallback heuristic
      const missingCount = (specQuality.missing || []).length;
      // Gate thresholds (PR-5):
      // - Always gate if first cycle and score < 0.55
      // - Gate if score < 0.7 and we see 3+ missing aspects
      // - Across cycles, if score is extremely low (<0.4), still gate
      if (isFirstCycle && specQuality.score < 0.55) return true;
      if (specQuality.score < 0.7 && missingCount >= 3) return true;
      if (specQuality.score < 0.4) return true;
      return false;
    })();

    if (needsQuestions) {
      const reason = specQuality
        ? `Clarification gate triggered (score=${specQuality.score.toFixed(2)}, missing=${(specQuality.missing || []).length})`
        : `Clarification gate triggered via fallback heuristic (descLen=${descLen})`;
      this.logger.log(reason);
    }

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
        0,
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
        const result = { type: 'questions', data: parsed as AiQuestionsResponse } as AiAnalysisResult;
        this.analysisCache.set(inputHash, {
          createdAt: Date.now(),
          version: this.pipelineVersion,
          result,
        });
        return result;
      }

      if (
        'subtasks' in parsed &&
        parsed.subtasks &&
        Array.isArray(parsed.subtasks) &&
        parsed.subtasks.length > 0
      ) {
        const result = { type: 'estimate', data: parsed as AiEstimateResponse } as AiAnalysisResult;
        this.analysisCache.set(inputHash, {
          createdAt: Date.now(),
          version: this.pipelineVersion,
          result,
        });
        return result;
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
    return Math.round(val * 4) / 4; // round to nearest 0.25
  }

  async computeCalibratedEstimate(args: {
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

    // 1) Top-down estimate with strict retries and fallback
    const bottomUp = this.sanitize(args.totalBottomUp);
    const topDown = await this.getTopDownWithRetries(
      args.taskDto,
      args.project,
      model,
      logs,
      { matched: false, min: 0, max: 0, priorP50: 0 },
      bottomUp
    );
    logs.push(`Top-down: ${topDown.toFixed(1)}h`);

    // 2) Bottom-up base
    logs.push(`Bottom-up: ${bottomUp.toFixed(1)}h`);

    // Placeholder for modifier logic until CalibrationService is built
    const baseHours = bottomUp;
    const modifier = this.applyModifiers(baseHours, args.taskDto, args.project, logs);
    const p50 = modifier;

    // Uncertainty coefficient (PR-5)
    const uncertainty = 0.3;

    return {
      p10: p50 * (1 - uncertainty),
      p50: p50,
      p90: p50 * (1 + uncertainty),
      confidence: (1 - uncertainty) * 100,
      explanation: `Derived from ${args.subtasksCount} subtasks (bottom-up) and a top-down cross-check.`,
      logs,
      topDown,
      bottomUp,
      divergencePct: 0,
    };
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

  private computeSimilarityScore(
    pastTask: any,
    target: CreateTaskDto,
    targetCategory?: 'fe_small' | 'integration' | 'backend'
  ): number {
    const pastText = `${pastTask.title ?? ''} ${pastTask.description ?? ''}`.toLowerCase();
    const targetText = `${target.title} ${target.description}`.toLowerCase();
    let score = 0;

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

  private applyModifiers(
    baseHours: number,
    taskDto: CreateTaskDto,
    project: Project,
    logs: string[],
  ): number {
    let modifier = 1.0;
    const log = (msg: string) => {
      this.logger.debug(msg);
      logs.push(msg);
    };

    log(`Starting modifier calculation with base modifier: ${modifier.toFixed(3)}`);

    // Experience Level
    const expKey = `experience.${taskDto.experienceLevel}`;
    const expCoeff = this.calibrationService.getCoefficient(expKey);
    if (expCoeff) {
      modifier *= expCoeff;
      log(`Applied coefficient for ${expKey}: ${expCoeff.toFixed(3)}x -> new modifier: ${modifier.toFixed(3)}`);
    } else {
      // Fallback to old hardcoded values if no coefficient is found
      if (taskDto.experienceLevel === 'JUNIOR') modifier *= 1.5;
      if (taskDto.experienceLevel === 'SENIOR') modifier *= 0.75;
    }

    // Project Complexity
    const projComplexityKey = `project.complexity.${project.complexity}`;
    const projComplexityCoeff = this.calibrationService.getCoefficient(projComplexityKey);
    if (projComplexityCoeff) {
      modifier *= projComplexityCoeff;
      log(`Applied coefficient for ${projComplexityKey}: ${projComplexityCoeff.toFixed(3)}x -> new modifier: ${modifier.toFixed(3)}`);
    } else {
      if (project.complexity === 'HIGH') modifier *= 1.2;
      if (project.complexity === 'LOW') modifier *= 0.9;
    }

    // Complexity Tags
    if (taskDto.complexityTags && taskDto.complexityTags.length > 0) {
      taskDto.complexityTags.forEach(tag => {
        const tagKey = `complexity.${tag}`;
        const tagCoeff = this.calibrationService.getCoefficient(tagKey);
        if (tagCoeff) {
          modifier *= tagCoeff;
          log(`Applied coefficient for tag ${tagKey}: ${tagCoeff.toFixed(3)}x -> new modifier: ${modifier.toFixed(3)}`);
        } else {
            log(`No coefficient found for tag ${tagKey}, skipping.`);
        }
      });
    }

    // Project Overhead
    const overheadModifier = 1 + project.overhead / 100;
    modifier *= overheadModifier;
    log(`Applied project overhead: ${overheadModifier.toFixed(3)}x -> new modifier: ${modifier.toFixed(3)}`);

    log(`Final modifier: ${modifier.toFixed(3)}`);
    return baseHours * modifier;
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
    const details: string[] = [];
    if ((taskDto as any).acceptanceCriteria?.length) {
      details.push(`- Acceptance Criteria: ${(taskDto as any).acceptanceCriteria.join('; ')}`);
    }
    if ((taskDto as any).assumptions?.length) {
      details.push(`- Assumptions: ${(taskDto as any).assumptions.join('; ')}`);
    }
    if ((taskDto as any).constraints?.length) {
      details.push(`- Constraints: ${(taskDto as any).constraints.join('; ')}`);
    }
    if ((taskDto as any).nfrs?.length) {
      const nfrStr = (taskDto as any).nfrs
        .map((n: any) => `${n.category}: ${n.requirement}${n.target ? ` (target: ${n.target})` : ''}`)
        .join(' | ');
      details.push(`- Non-Functional Requirements: ${nfrStr}`);
    }
    if ((taskDto as any).integrations?.length) {
      const intStr = (taskDto as any).integrations
        .map(
          (i: any) => `${i.name} [${i.type || 'n/a'}, ${i.interaction}${i.auth ? `, auth=${i.auth}` : ''}${i.sandbox ? ', sandbox' : ''}]`
        )
        .join(' | ');
      details.push(`- Integrations: ${intStr}`);
    }
    if ((taskDto as any).testing) {
      const t = (taskDto as any).testing;
      details.push(
        `- Testing: unit=${!!t.unit}${typeof t.unitCoverageTarget === 'number' ? ` (coverage ${t.unitCoverageTarget}%)` : ''}, integration=${!!t.integration}, e2e=${!!t.e2e}, performance=${!!t.performance}, security=${!!t.security}`
      );
    }
    if ((taskDto as any).documentation) {
      const d = (taskDto as any).documentation;
      details.push(
        `- Documentation: userDocs=${!!d.userDocs}, apiDocs=${!!d.apiDocs}, readme=${!!d.readme}, changelog=${!!d.changelog}`
      );
    }
    if ((taskDto as any).complexityTags?.length) {
      details.push(`- Complexity Tags: ${((taskDto as any).complexityTags || []).join(', ')}`);
    }
    if ((taskDto as any).uiDesignComplexity) {
      details.push(`- UI Design Complexity: ${(taskDto as any).uiDesignComplexity}`);
    }
    if ((taskDto as any).needsDataMigration) {
      details.push(
        `- Data Migration: needs=${!!(taskDto as any).needsDataMigration}, complexity=${(taskDto as any).migrationComplexity || 'n/a'}`
      );
    }

    return `
      The user provided the task: "${taskDto.title} - ${taskDto.description}".
      Additional provided details (may be partial):
      ${details.length ? details.join('\n      ') : '(none)'}
      Your task is to generate 3-7 critical, concise questions to clarify requirements needed for accurate time estimation.
      Avoid generic questions; target the most impactful unknowns that affect scope, testing, design complexity, integrations, and NFRs.
      Do not ask about project management topics (assignees, deadlines, sprints, status).
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

    const details: string[] = [];
    if ((taskDto as any).acceptanceCriteria?.length) {
      details.push(`- Acceptance Criteria: ${(taskDto as any).acceptanceCriteria.join('; ')}`);
    }
    if ((taskDto as any).assumptions?.length) {
      details.push(`- Assumptions: ${(taskDto as any).assumptions.join('; ')}`);
    }
    if ((taskDto as any).constraints?.length) {
      details.push(`- Constraints: ${(taskDto as any).constraints.join('; ')}`);
    }
    if ((taskDto as any).nfrs?.length) {
      const nfrStr = (taskDto as any).nfrs
        .map((n: any) => `${n.category}: ${n.requirement}${n.target ? ` (target: ${n.target})` : ''}`)
        .join(' | ');
      details.push(`- Non-Functional Requirements: ${nfrStr}`);
    }
    if ((taskDto as any).integrations?.length) {
      const intStr = (taskDto as any).integrations
        .map(
          (i: any) => `${i.name} [${i.type || 'n/a'}, ${i.interaction}${i.auth ? `, auth=${i.auth}` : ''}${i.sandbox ? ', sandbox' : ''}]`
        )
        .join(' | ');
      details.push(`- Integrations: ${intStr}`);
    }
    if ((taskDto as any).testing) {
      const t = (taskDto as any).testing;
      details.push(
        `- Testing: unit=${!!t.unit}${typeof t.unitCoverageTarget === 'number' ? ` (coverage ${t.unitCoverageTarget}%)` : ''}, integration=${!!t.integration}, e2e=${!!t.e2e}, performance=${!!t.performance}, security=${!!t.security}`
      );
    }
    if ((taskDto as any).documentation) {
      const d = (taskDto as any).documentation;
      details.push(
        `- Documentation: userDocs=${!!d.userDocs}, apiDocs=${!!d.apiDocs}, readme=${!!d.readme}, changelog=${!!d.changelog}`
      );
    }
    if ((taskDto as any).complexityTags?.length) {
      details.push(`- Complexity Tags: ${((taskDto as any).complexityTags || []).join(', ')}`);
    }
    if ((taskDto as any).uiDesignComplexity) {
      details.push(`- UI Design Complexity: ${(taskDto as any).uiDesignComplexity}`);
    }
    if ((taskDto as any).needsDataMigration) {
      details.push(
        `- Data Migration: needs=${!!(taskDto as any).needsDataMigration}, complexity=${(taskDto as any).migrationComplexity || 'n/a'}`
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
      ${details.length ? details.join('\n      ') : ''}

      **Clarification History:**
      ${history.length > 0 ? historyStr : 'No clarification was needed.'}

      **Your Instructions:**
      ${instructions.join('\n')}
    `;
  }
}
