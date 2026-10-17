import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EstimatesService } from './estimates.service';
import { Estimate, EstimateSource } from './entities/estimate.entity';
import { Task } from '../tasks/entities/task.entity';

const buildQueryBuilder = (result: {
  getOne?: unknown;
  getMany?: unknown[];
  execute?: { affected?: number };
}) => ({
  innerJoinAndSelect: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(result.getOne ?? null),
  getMany: jest.fn().mockResolvedValue(result.getMany ?? []),
  execute: jest.fn().mockResolvedValue(result.execute ?? { affected: 0 }),
});

describe('EstimatesService tenant isolation', () => {
  let estimateRepository: jest.Mocked<Repository<Estimate>>;
  let taskRepository: jest.Mocked<Repository<Task>>;

  const buildService = (taskOwnerMatch = true) => {
    const taskQb = buildQueryBuilder({
      getOne: taskOwnerMatch ? ({ id: 'task-a' } as Task) : null,
    });
    const estimateQb = buildQueryBuilder({
      getOne: { id: 'estimate-a' } as Estimate,
      getMany: [{ id: 'estimate-a' } as Estimate],
      execute: { affected: 1 },
    });

    estimateRepository = {
      create: jest.fn((value) => value as Estimate),
      insert: jest.fn(
        async () => ({ identifiers: [{ id: 'estimate-a' }] } as any)
      ),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => estimateQb as any),
    } as unknown as jest.Mocked<Repository<Estimate>>;

    taskRepository = {
      createQueryBuilder: jest.fn(() => taskQb as any),
    } as unknown as jest.Mocked<Repository<Task>>;

    return {
      estimateQb,
      service: new EstimatesService(estimateRepository, taskRepository),
      taskQb,
    };
  };

  it('creates an estimate only after validating task ownership', async () => {
    const { service, taskQb } = buildService(true);

    await service.create(
      {
        taskId: 'task-a',
        finalEstimate: 8,
        source: EstimateSource.AI,
      },
      'user-a'
    );

    expect(taskQb.andWhere).toHaveBeenCalledWith('project."userId" = :userId', {
      userId: 'user-a',
    });
    expect(estimateRepository.insert).toHaveBeenCalled();
  });

  it('does not create an estimate for another user task', async () => {
    const { service } = buildService(false);

    await expect(
      service.create(
        {
          taskId: 'task-b',
          finalEstimate: 8,
          source: EstimateSource.AI,
        },
        'user-a'
      )
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(estimateRepository.insert).not.toHaveBeenCalled();
  });

  it('scopes estimate list queries by project owner', async () => {
    const { service, estimateQb } = buildService(true);

    await service.findAll('user-a');

    expect(estimateQb.where).toHaveBeenCalledWith(
      'project."userId" = :userId',
      { userId: 'user-a' }
    );
  });

  it('initializes manual estimate hours without leaving the default zero final value', async () => {
    const { service } = buildService(true);
    estimateRepository.findOne.mockResolvedValue(null);
    await service.createOrUpdateManualEstimate('task-a', 8, 'user-a');
    expect(estimateRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: EstimateSource.MANUAL,
        manualEstimate: 8,
        finalEstimate: 8,
      })
    );
  });

  it.each([EstimateSource.MANUAL, EstimateSource.AI, EstimateSource.FINAL])(
    'updates manual hours on %s without changing an AI/final result',
    async (source) => {
      const { service } = buildService(true);
      const estimate = {
        id: 'estimate-a',
        source,
        finalEstimate: 8,
      } as Estimate;
      estimateRepository.findOne.mockImplementation(async (options) =>
        (options.where as { source: EstimateSource }).source === source
          ? estimate
          : null
      );
      estimateRepository.save = jest.fn().mockResolvedValue(estimate);
      await service.createOrUpdateManualEstimate('task-a', 14, 'user-a');
      expect(estimate.manualEstimate).toBe(14);
      expect(estimate.finalEstimate).toBe(
        source === EstimateSource.MANUAL ? 14 : 8
      );
    }
  );

  it('returns 404 when detail query cannot find an owned estimate', async () => {
    const { service } = buildService(true);
    (estimateRepository.createQueryBuilder as jest.Mock).mockReturnValue(
      buildQueryBuilder({ getOne: null }) as any
    );

    await expect(
      service.findOne('estimate-b', 'user-a')
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses ownership-aware atomic update and delete statements', async () => {
    const { service, estimateQb } = buildService(true);

    await service.update('estimate-a', { finalEstimate: 12 }, 'user-a');
    await service.remove('estimate-a', 'user-a');

    expect(estimateQb.update).toHaveBeenCalledWith(Estimate);
    expect(estimateQb.delete).toHaveBeenCalled();
    expect(estimateQb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('project."userId" = :userId'),
      { userId: 'user-a' }
    );
  });
});
