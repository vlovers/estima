import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EstimateFeedback } from './entities/estimate-feedback.entity';
import { EstimateFeedbackService } from './estimate-feedback.service';
import { FeedbackAnalysisService } from './feedback-analysis.service';
import { Task } from '../tasks/entities/task.entity';

const buildQueryBuilder = (result: {
  getOne?: unknown;
  getMany?: unknown[];
}) => ({
  innerJoinAndSelect: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(result.getOne ?? null),
  getMany: jest.fn().mockResolvedValue(result.getMany ?? []),
});

describe('EstimateFeedbackService tenant isolation', () => {
  let feedbackRepository: jest.Mocked<Repository<EstimateFeedback>>;
  let taskRepository: jest.Mocked<Repository<Task>>;
  let feedbackAnalysisService: jest.Mocked<FeedbackAnalysisService>;

  const buildService = (taskOwnerMatch = true) => {
    const taskQb = buildQueryBuilder({
      getOne: taskOwnerMatch ? ({ id: 'task-a' } as Task) : null,
    });
    const feedbackQb = buildQueryBuilder({
      getMany: [{ id: 'feedback-a' } as EstimateFeedback],
    });

    feedbackRepository = {
      create: jest.fn((value) => value as EstimateFeedback),
      save: jest.fn(
        async (value) => ({ id: 'feedback-a', ...value }) as EstimateFeedback
      ),
      createQueryBuilder: jest.fn(() => feedbackQb as any),
    } as unknown as jest.Mocked<Repository<EstimateFeedback>>;

    taskRepository = {
      createQueryBuilder: jest.fn(() => taskQb as any),
    } as unknown as jest.Mocked<Repository<Task>>;

    feedbackAnalysisService = {
      analyzeFeedback: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<FeedbackAnalysisService>;

    return {
      feedbackQb,
      service: new EstimateFeedbackService(
        feedbackRepository,
        taskRepository,
        feedbackAnalysisService
      ),
      taskQb,
    };
  };

  it('accepts feedback only after validating task ownership', async () => {
    const { service, taskQb } = buildService(true);

    await service.create({ taskId: 'task-a', actualHours: 10 }, 'user-a');

    expect(taskQb.andWhere).toHaveBeenCalledWith(
      'project."userId" = :userId',
      { userId: 'user-a' }
    );
    expect(feedbackRepository.save).toHaveBeenCalled();
    expect(feedbackAnalysisService.analyzeFeedback).toHaveBeenCalled();
  });

  it('does not save feedback or trigger calibration for another user task', async () => {
    const { service } = buildService(false);

    await expect(
      service.create({ taskId: 'task-b', actualHours: 10 }, 'user-a')
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(feedbackRepository.save).not.toHaveBeenCalled();
    expect(feedbackAnalysisService.analyzeFeedback).not.toHaveBeenCalled();
  });

  it('scopes feedback list queries by project owner', async () => {
    const { service, feedbackQb } = buildService(true);

    await service.findAll('user-a');

    expect(feedbackQb.where).toHaveBeenCalledWith(
      'project."userId" = :userId',
      { userId: 'user-a' }
    );
  });
});
