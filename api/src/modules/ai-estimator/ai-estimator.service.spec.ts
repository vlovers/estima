import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AiEstimatorService } from './ai-estimator.service';
import { Task } from '../tasks/entities/task.entity';
import { CalibrationService } from '../calibration/calibration.service';
import OpenAI from 'openai';

class ConfigStub implements Partial<ConfigService> {
  get<T = any>(key: string, defaultValue?: T): T {
    const map: Record<string, any> = {
      OPENAI_MODEL: 'gpt-4o',
      OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
      OPENAI_API_KEY: 'test-key',
    };
    return (map[key] ?? defaultValue) as T;
  }
}

const project = {
  id: 'p1',
  name: 'Proj',
  description: '',
  complexity: 'MEDIUM',
  overhead: 15,
} as any;

function buildService() {
  const config = new ConfigStub() as ConfigService;
  const repo = {} as Repository<Task>;
  const calibrationService = {
    getEffectiveCoefficients: jest.fn(async (keys: string[]) => {
      const values: Record<string, number> = {
        'experience.MIDDLE': 1,
        'project.complexity.MEDIUM': 1,
      };
      const entries = keys
        .map((key): [string, number | undefined] => [key, values[key]])
        .filter((entry): entry is [string, number] => entry[1] !== undefined);
      return new Map<string, number>(entries);
    }),
  } as unknown as CalibrationService;

  const service = new AiEstimatorService(config, repo, calibrationService);

  jest
    .spyOn(service as any, 'getTopDownWithRetries')
    .mockImplementation(async (_dto, _project, _model, logs: string[]) => {
      logs.push('Top-down mocked');
      return 120;
    });

  return service;
}

describe('AiEstimatorService provider timeout boundary', () => {
  it('returns a sanitized gateway timeout without exposing the provider message', async () => {
    const service = buildService();
    jest
      .spyOn((service as any).openai.chat.completions, 'create')
      .mockRejectedValue(
        new OpenAI.APIConnectionTimeoutError({
          message: 'sensitive-upstream-timeout-detail',
        })
      );
    await expect(
      service.getAiAnalysis(
        {
          title: 'Task',
          description: 'Bounded scope',
          technology: 'React',
        } as any,
        project
      )
    ).rejects.toMatchObject({
      status: 504,
      message: 'AI estimation timed out. Please try again later.',
    });
  });
});

describe('AiEstimatorService.computeCalibratedEstimate', () => {
  it('computes p10/p50/p90 from bottom-up estimate and modifiers', async () => {
    const service = buildService();

    const result = await service.computeCalibratedEstimate({
      totalBottomUp: 100,
      subtasksCount: 5,
      taskDto: {
        description: 'Build feature X',
        technology: 'node',
        experienceLevel: 'MIDDLE',
        useAiEstimate: true,
        breakdown: true,
        title: 'Feat',
        tags: [],
      } as any,
      project,
      risksCount: 2,
    });

    expect(result.bottomUp).toBe(100);
    expect(result.topDown).toBe(120);
    expect(result.p50).toBeCloseTo(115);
    expect(result.p10).toBeCloseTo(80.5);
    expect(result.p90).toBeCloseTo(149.5);
    expect(result.logs.join('\n')).toContain('Bottom-up: 100.0h');
  });

  it('uses tenant overrides when computing modifiers', async () => {
    const service = buildService();
    const calibrationService = (service as any)
      .calibrationService as jest.Mocked<CalibrationService>;
    calibrationService.getEffectiveCoefficients = jest.fn(
      async (_keys: string[], _tenantUserId?: string | null) => {
        return new Map<string, number>([
          ['experience.MIDDLE', 1.2],
          ['project.complexity.MEDIUM', 1.1],
          ['complexity.legacy_code', 1.5],
        ]);
      }
    );

    const result = await service.computeCalibratedEstimate({
      totalBottomUp: 100,
      subtasksCount: 1,
      taskDto: {
        description: 'Build feature X',
        technology: 'node',
        experienceLevel: 'MIDDLE',
        useAiEstimate: true,
        breakdown: true,
        title: 'Feat',
        tags: [],
        complexityTags: ['legacy_code'],
      } as any,
      project: { ...project, userId: 'user-a' },
      risksCount: 0,
    });

    expect(calibrationService.getEffectiveCoefficients).toHaveBeenCalledWith(
      [
        'experience.MIDDLE',
        'project.complexity.MEDIUM',
        'complexity.legacy_code',
      ],
      'user-a'
    );
    expect(result.p50).toBeCloseTo(227.7);
  });

  it('keeps tenant coefficient resolution isolated by project owner', async () => {
    const service = buildService();
    const calibrationService = (service as any)
      .calibrationService as jest.Mocked<CalibrationService>;
    calibrationService.getEffectiveCoefficients = jest.fn(
      async (_keys: string[], tenantUserId?: string | null) => {
        return new Map([
          ['experience.MIDDLE', tenantUserId === 'tenant-a' ? 1.5 : 1],
          ['project.complexity.MEDIUM', 1],
        ]);
      }
    );

    const taskDto = {
      description: 'Build feature X',
      technology: 'node',
      experienceLevel: 'MIDDLE',
      useAiEstimate: true,
      breakdown: true,
      title: 'Feat',
      tags: [],
    } as any;

    const tenantA = await service.computeCalibratedEstimate({
      totalBottomUp: 100,
      subtasksCount: 1,
      taskDto,
      project: { ...project, userId: 'tenant-a', overhead: 0 },
      risksCount: 0,
    });
    const tenantB = await service.computeCalibratedEstimate({
      totalBottomUp: 100,
      subtasksCount: 1,
      taskDto,
      project: { ...project, userId: 'tenant-b', overhead: 0 },
      risksCount: 0,
    });

    expect(tenantA.p50).toBe(150);
    expect(tenantB.p50).toBe(100);
  });

  it('handles missing coefficients through existing deterministic fallbacks', async () => {
    const service = buildService();
    const calibrationService = (service as any)
      .calibrationService as jest.Mocked<CalibrationService>;
    calibrationService.getEffectiveCoefficients = jest.fn(
      async (_keys: string[], _tenantUserId?: string | null) =>
        new Map<string, number>()
    );

    const result = await service.computeCalibratedEstimate({
      totalBottomUp: 100,
      subtasksCount: 1,
      taskDto: {
        description: 'Build feature X',
        technology: 'node',
        experienceLevel: 'JUNIOR',
        useAiEstimate: true,
        breakdown: true,
        title: 'Feat',
        tags: [],
        complexityTags: ['unknown_tag'],
      } as any,
      project: { ...project, complexity: 'HIGH', overhead: 0 },
      risksCount: 0,
    });

    expect(result.p50).toBeCloseTo(180);
    expect(result.logs.join('\n')).toContain(
      'No coefficient found for tag complexity.unknown_tag, skipping.'
    );
  });
});
