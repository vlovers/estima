import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AiEstimatorService } from './ai-estimator.service';
import { Task } from '../tasks/entities/task.entity';
import { CalibrationService } from '../calibration/calibration.service';

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
    getCoefficient: jest.fn((key: string) => {
      const values: Record<string, number> = {
        'experience.MIDDLE': 1,
        'project.complexity.MEDIUM': 1,
      };
      return values[key];
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
});
