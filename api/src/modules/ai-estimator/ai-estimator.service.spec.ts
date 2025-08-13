import 'reflect-metadata';
import { AiEstimatorService } from './ai-estimator.service';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Task } from '../tasks/entities/task.entity';

// Simple stub for ConfigService
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

// Minimal project stub
const project = {
  id: 'p1',
  name: 'Proj',
  description: '',
  complexity: 'MEDIUM',
  overhead: 15,
} as any;

// Helper to build service with spies
function buildService() {
  const config = new ConfigStub() as ConfigService;
  const repo = { find: jest.fn() } as unknown as Repository<Task>;
  const service = new AiEstimatorService(config, repo);

  // Mock internals to avoid network/external calls
  const priorsSpy = jest.spyOn(service as any, "getTaskPriors").mockReturnValue({
    matched: false,
    category: 'generic',
    priorP50: 0,
    min: 0,
    max: 0,
  });
  const topDownSpy = jest
    .spyOn(service as any, 'getTopDownWithRetries')
    .mockImplementation(async (_dto, _project, _model, logs: string[]) => {
      logs.push('Top-down: 120.0h');
      return 120; // deterministic TD
    });
  const modsSpy = jest.spyOn(service as any, 'applyModifiers').mockImplementation((bu: number) => bu); // no-op
  const corrSpy = jest
    .spyOn(service as any, 'getCorrectedEstimate')
    .mockImplementation(async (x: number) => ({ correctedEstimate: x, averageErrorRatio: 0.12 }));
  const confSpy = jest
    .spyOn(service as any, 'calculateConfidence')
    .mockImplementation(() => 0.6);

  return { service, spies: { priorsSpy, topDownSpy, modsSpy, corrSpy, confSpy } };
}

describe('AiEstimatorService.computeCalibratedEstimate', () => {
  it('computes p10/p50/p90 with clamping and logs', async () => {
    const { service } = buildService();

    const result = await service.computeCalibratedEstimate({
      totalBottomUp: 100, // BU
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
      risksCount: 2, // adds a bit of spread
    });

    // p50 should equal corrected bottom-up (since we mocked to no-op modifiers and TD blending off)
    expect(result.p50).toBeGreaterThan(0);
    expect(result.p10).toBeGreaterThan(0);
    expect(result.p90).toBeGreaterThan(0);

    // Max ratio clamp: p90/p50 and p50/p10 should be <= 1.6
    expect(result.p90 / result.p50).toBeLessThanOrEqual(1.6);
    expect(result.p50 / Math.max(0.25, result.p10)).toBeLessThanOrEqual(1.6);

    // Divergence computed and within 0..200
    expect(result.divergencePct).toBeGreaterThanOrEqual(0);
    expect(result.divergencePct).toBeLessThanOrEqual(200);

    // Logs must include Range and Bottom-up/Top-down lines
    const text = result.logs.join('\n');
    expect(text).toMatch(/Top-down:/);
    expect(text).toMatch(/Bottom-up:/);
    expect(text).toMatch(/Range: p10=.*h, p50=.*h, p90=.*h/);
  });

  it('anchors slightly toward manual when divergence is high', async () => {
    const { service, spies } = buildService();
    // Force high divergence by making TD very different from BU
    spies.topDownSpy.mockImplementation(async (_dto, _p, _m, logs: string[]) => {
      logs.push('Top-down: 400.0h');
      return 400;
    });

    const res = await service.computeCalibratedEstimate({
      totalBottomUp: 40,
      subtasksCount: 3,
      taskDto: {
        description: 'Big mismatch',
        technology: 'node',
        experienceLevel: 'MIDDLE',
        useAiEstimate: true,
        breakdown: true,
        manualEstimate: 10,
        title: 'Mismatch',
        tags: [],
      } as any,
      project,
      risksCount: 0,
    });

    // After anchoring with manual=10h and p50 initially around 40h, p50 should pull slightly towards 10h
    expect(res.p50).toBeLessThan(40);
  });
});
