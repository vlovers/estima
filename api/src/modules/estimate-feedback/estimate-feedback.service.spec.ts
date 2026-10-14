import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EstimateFeedback } from './entities/estimate-feedback.entity';
import { EstimateFeedbackService } from './estimate-feedback.service';
import {
  Estimate,
  EstimateSource,
} from '../estimates/entities/estimate.entity';
import { Task } from '../tasks/entities/task.entity';

const buildQueryBuilder = (result: {
  getOne?: unknown;
  getMany?: unknown[];
}) => ({
  innerJoinAndSelect: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(result.getOne ?? null),
  getMany: jest.fn().mockResolvedValue(result.getMany ?? []),
});

describe('EstimateFeedbackService tenant isolation', () => {
  let feedbackRepository: jest.Mocked<Repository<EstimateFeedback>>;
  let taskRepository: jest.Mocked<Repository<Task>>;
  let estimateRepository: jest.Mocked<Repository<Estimate>>;

  const buildService = (
    taskOwnerMatch = true,
    estimate: Estimate | null = {
      id: 'estimate-final',
      finalEstimate: 12,
      source: EstimateSource.FINAL,
    } as Estimate
  ) => {
    const taskQb = buildQueryBuilder({
      getOne: taskOwnerMatch ? ({ id: 'task-a' } as Task) : null,
    });
    const feedbackQb = buildQueryBuilder({
      getMany: [{ id: 'feedback-a' } as EstimateFeedback],
    });

    feedbackRepository = {
      create: jest.fn((value) => value as EstimateFeedback),
      save: jest.fn(
        async (value) => ({ id: 'feedback-a', ...value } as EstimateFeedback)
      ),
      createQueryBuilder: jest.fn(() => feedbackQb as any),
    } as unknown as jest.Mocked<Repository<EstimateFeedback>>;

    taskRepository = {
      createQueryBuilder: jest.fn(() => taskQb as any),
    } as unknown as jest.Mocked<Repository<Task>>;

    const estimateQb = buildQueryBuilder({
      getOne: estimate,
    });
    estimateRepository = {
      createQueryBuilder: jest.fn(() => estimateQb as any),
    } as unknown as jest.Mocked<Repository<Estimate>>;

    return {
      estimateQb,
      feedbackQb,
      service: new EstimateFeedbackService(
        feedbackRepository,
        taskRepository,
        estimateRepository
      ),
      taskQb,
    };
  };

  it('accepts feedback only after validating task ownership', async () => {
    const { service, taskQb } = buildService(true);

    await service.create({ taskId: 'task-a', actualHours: 10 }, 'user-a');

    expect(taskQb.andWhere).toHaveBeenCalledWith('project."userId" = :userId', {
      userId: 'user-a',
    });
    expect(feedbackRepository.save).toHaveBeenCalled();
    expect(feedbackRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        estimateId: 'estimate-final',
        estimatedHoursSnapshot: 12,
      })
    );
  });

  it('does not save feedback for another user task', async () => {
    const { service } = buildService(false);

    await expect(
      service.create({ taskId: 'task-b', actualHours: 10 }, 'user-a')
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(feedbackRepository.save).not.toHaveBeenCalled();
  });

  it('scopes feedback list queries by project owner', async () => {
    const { service, feedbackQb } = buildService(true);

    await service.findAll('user-a');

    expect(feedbackQb.where).toHaveBeenCalledWith(
      'project."userId" = :userId',
      { userId: 'user-a' }
    );
  });

  it('returns existing feedback for identical idempotency payload', async () => {
    const { service } = buildService(true);
    const existing = {
      id: 'feedback-existing',
      taskId: 'task-a',
      estimateId: 'estimate-final',
      actualHours: 10,
      rating: 4,
      comment: 'same',
      missedComplexityTags: ['legacy_code'],
    } as EstimateFeedback;
    (feedbackRepository.createQueryBuilder as jest.Mock).mockReturnValueOnce(
      buildQueryBuilder({ getOne: existing }) as any
    );

    await expect(
      service.create(
        {
          taskId: 'task-a',
          estimateId: 'estimate-final',
          idempotencyKey: 'idem-1',
          actualHours: 10,
          rating: 4,
          comment: 'same',
          missedComplexityTags: ['legacy_code'],
        },
        'user-a'
      )
    ).resolves.toBe(existing);
    expect(feedbackRepository.save).not.toHaveBeenCalled();
  });

  it('rejects conflicting idempotency payloads', async () => {
    const { service } = buildService(true);
    (feedbackRepository.createQueryBuilder as jest.Mock).mockReturnValueOnce(
      buildQueryBuilder({
        getOne: {
          id: 'feedback-existing',
          taskId: 'task-a',
          estimateId: 'estimate-final',
          actualHours: 10,
        } as EstimateFeedback,
      }) as any
    );

    await expect(
      service.create(
        {
          taskId: 'task-a',
          estimateId: 'estimate-final',
          idempotencyKey: 'idem-1',
          actualHours: 11,
        },
        'user-a'
      )
    ).rejects.toBeInstanceOf(ConflictException);
    expect(feedbackRepository.save).not.toHaveBeenCalled();
  });
});
