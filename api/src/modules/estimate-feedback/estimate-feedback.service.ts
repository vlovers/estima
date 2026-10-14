import { CreateEstimateFeedbackDto } from './dto/create-estimate-feedback.dto';
import { EstimateFeedback } from './entities/estimate-feedback.entity';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  Estimate,
  EstimateSource,
} from '../estimates/entities/estimate.entity';
import { Task } from '../tasks/entities/task.entity';

@Injectable()
export class EstimateFeedbackService {
  constructor(
    @InjectRepository(EstimateFeedback)
    private readonly feedbackRepository: Repository<EstimateFeedback>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Estimate)
    private readonly estimateRepository: Repository<Estimate>
  ) {}

  async create(
    dto: CreateEstimateFeedbackDto,
    userId: string
  ): Promise<EstimateFeedback> {
    await this.ensureTaskOwnedByUser(dto.taskId, userId);

    if (dto.idempotencyKey) {
      const existing = await this.findExistingIdempotentFeedback(
        dto.taskId,
        dto.idempotencyKey,
        userId
      );
      if (existing) {
        if (this.isSameIdempotentPayload(existing, dto)) {
          return existing;
        }
        throw new ConflictException(
          'Idempotency key has already been used with a different feedback payload.'
        );
      }
    }

    const estimate = await this.resolveFeedbackEstimate(dto, userId);

    const feedback = this.feedbackRepository.create({
      taskId: dto.taskId,
      task: { id: dto.taskId },
      estimateId: estimate?.id ?? null,
      estimate: estimate ? ({ id: estimate.id } as Estimate) : null,
      idempotencyKey: dto.idempotencyKey ?? null,
      estimatedHoursSnapshot: estimate?.finalEstimate ?? null,
      actualHours: dto.actualHours,
      rating: dto.rating,
      comment: dto.comment,
      reasonForDeviation: dto.reasonForDeviation,
      missedComplexityTags: dto.missedComplexityTags,
      deviationComment: dto.deviationComment,
    });
    return this.feedbackRepository.save(feedback);
  }

  async findAll(userId: string): Promise<EstimateFeedback[]> {
    return this.feedbackRepository
      .createQueryBuilder('feedback')
      .innerJoinAndSelect('feedback.task', 'task')
      .innerJoin('task.project', 'project')
      .where('project."userId" = :userId', { userId })
      .getMany();
  }

  private async findExistingIdempotentFeedback(
    taskId: string,
    idempotencyKey: string,
    userId: string
  ): Promise<EstimateFeedback | null> {
    return this.feedbackRepository
      .createQueryBuilder('feedback')
      .innerJoinAndSelect('feedback.task', 'task')
      .innerJoin('task.project', 'project')
      .leftJoinAndSelect('feedback.estimate', 'estimate')
      .where('feedback."taskId" = :taskId', { taskId })
      .andWhere('feedback."idempotencyKey" = :idempotencyKey', {
        idempotencyKey,
      })
      .andWhere('project."userId" = :userId', { userId })
      .getOne();
  }

  private async resolveFeedbackEstimate(
    dto: CreateEstimateFeedbackDto,
    userId: string
  ): Promise<Estimate | null> {
    const qb = this.estimateRepository
      .createQueryBuilder('estimate')
      .innerJoinAndSelect('estimate.task', 'task')
      .innerJoin('task.project', 'project')
      .where('task.id = :taskId', { taskId: dto.taskId })
      .andWhere('project."userId" = :userId', { userId })
      .andWhere('estimate.source = :source', { source: EstimateSource.FINAL });

    if (dto.estimateId) {
      qb.andWhere('estimate.id = :estimateId', { estimateId: dto.estimateId });
    } else {
      qb.orderBy('estimate.id', 'DESC');
    }

    const estimate = await qb.getOne();
    if (dto.estimateId && !estimate) {
      throw new NotFoundException(
        `Estimate with id ${dto.estimateId} not found`
      );
    }

    return estimate ?? null;
  }

  private isSameIdempotentPayload(
    existing: EstimateFeedback,
    dto: CreateEstimateFeedbackDto
  ): boolean {
    const normalizedExistingTags = [
      ...(existing.missedComplexityTags || []),
    ].sort();
    const normalizedDtoTags = [...(dto.missedComplexityTags || [])].sort();

    return (
      existing.taskId === dto.taskId &&
      existing.estimateId === (dto.estimateId ?? existing.estimateId) &&
      existing.actualHours === dto.actualHours &&
      (existing.rating ?? undefined) === dto.rating &&
      (existing.comment ?? undefined) === dto.comment &&
      (existing.reasonForDeviation ?? undefined) === dto.reasonForDeviation &&
      (existing.deviationComment ?? undefined) === dto.deviationComment &&
      JSON.stringify(normalizedExistingTags) ===
        JSON.stringify(normalizedDtoTags)
    );
  }

  private async ensureTaskOwnedByUser(
    taskId: string,
    userId: string
  ): Promise<void> {
    const task = await this.taskRepository
      .createQueryBuilder('task')
      .innerJoin('task.project', 'project')
      .where('task.id = :taskId', { taskId })
      .andWhere('project."userId" = :userId', { userId })
      .getOne();

    if (!task) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }
  }
}
