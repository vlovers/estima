import { UpdateEstimateDto } from './dto/update-estimate.dto';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { EstimateSource } from './entities/estimate.entity';
import { Estimate } from './entities/estimate.entity';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { Task } from '../tasks/entities/task.entity';

@Injectable()
export class EstimatesService {
  constructor(
    @InjectRepository(Estimate)
    private readonly estimateRepository: Repository<Estimate>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>
  ) {}

  async create(
    createEstimateDto: CreateEstimateDto,
    userId?: string,
    manager?: EntityManager
  ): Promise<Estimate> {
    const {
      taskId,
      manualEstimate,
      finalEstimate,
      source,
      confidence,
      explanation,
      managerExplanation,
      p10,
      p50,
      p90,
      topDown,
      bottomUp,
      divergencePct,
      logs,
    } = createEstimateDto;

    if (userId) {
      await this.ensureTaskOwnedByUser(taskId, userId, manager);
    }

    const estimateData: Partial<Estimate> = {
      finalEstimate,
      manualEstimate,
      source,
      confidence,
      explanation,
      managerExplanation,
      p10,
      p50,
      p90,
      topDown,
      bottomUp,
      divergencePct,
      logs,
      task: { id: taskId } as any,
    };

    const repository =
      manager?.getRepository(Estimate) ?? this.estimateRepository;
    const estimate = repository.create(estimateData);
    const inserted = await repository.insert(estimate);
    estimate.id = inserted.identifiers[0].id;
    return estimate;
  }

  async addManagerExplanation(
    estimateId: string,
    explanation: string,
    userId: string
  ) {
    const result = await this.ownedUpdate(estimateId, userId, {
      managerExplanation: explanation,
    });
    if (result.affected === 0) {
      throw new NotFoundException(`Estimate with id ${estimateId} not found`);
    }
    return this.findOne(estimateId, userId);
  }

  findAll(userId: string) {
    return this.estimateRepository
      .createQueryBuilder('estimate')
      .innerJoinAndSelect('estimate.task', 'task')
      .innerJoin('task.project', 'project')
      .where('project."userId" = :userId', { userId })
      .getMany();
  }

  async findOne(id: string, userId: string) {
    const estimate = await this.estimateRepository
      .createQueryBuilder('estimate')
      .innerJoinAndSelect('estimate.task', 'task')
      .innerJoin('task.project', 'project')
      .where('estimate.id = :id', { id })
      .andWhere('project."userId" = :userId', { userId })
      .getOne();

    if (!estimate) {
      throw new NotFoundException(`Estimate with id ${id} not found`);
    }

    return estimate;
  }

  async update(
    id: string,
    updateEstimateDto: UpdateEstimateDto,
    userId: string
  ) {
    const { taskId } = updateEstimateDto;

    if (taskId) {
      await this.ensureTaskOwnedByUser(taskId, userId);
    }

    const changes = {
      finalEstimate: updateEstimateDto.finalEstimate,
      manualEstimate: updateEstimateDto.manualEstimate,
      source: updateEstimateDto.source,
      confidence: updateEstimateDto.confidence,
      explanation: updateEstimateDto.explanation,
      managerExplanation: updateEstimateDto.managerExplanation,
      p10: updateEstimateDto.p10,
      p50: updateEstimateDto.p50,
      p90: updateEstimateDto.p90,
      topDown: updateEstimateDto.topDown,
      bottomUp: updateEstimateDto.bottomUp,
      divergencePct: updateEstimateDto.divergencePct,
      logs: updateEstimateDto.logs,
    };
    if (!Object.values(changes).some((value) => value !== undefined)) {
      return this.findOne(id, userId);
    }
    const result = await this.ownedUpdate(id, userId, changes);

    if (result.affected === 0) {
      throw new NotFoundException(`Estimate with id ${id} not found`);
    }

    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string) {
    const result = await this.estimateRepository
      .createQueryBuilder()
      .delete()
      .from(Estimate)
      .where('id = :id', { id })
      .andWhere(
        `"taskId" IN (
          SELECT task.id
          FROM tasks task
          INNER JOIN projects project ON project.id = task."projectId"
          WHERE project."userId" = :userId
        )`,
        { userId }
      )
      .execute();

    if (result.affected === 0) {
      throw new NotFoundException(`Estimate with id ${id} not found`);
    }

    return result;
  }

  async createOrUpdateManualEstimate(
    taskId: string,
    hours: number,
    userId?: string,
    manager?: EntityManager
  ): Promise<Estimate> {
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new BadRequestException(
        'Manual estimate must be greater than zero.'
      );
    }
    if (!manager) {
      return this.taskRepository.manager.transaction((transaction) =>
        this.createOrUpdateManualEstimate(taskId, hours, userId, transaction)
      );
    }

    // Serialize reference selection and insertion for the same task. Use the
    // caller's manager so uncommitted task creation is visible and rolls back.
    const query = manager
      .getRepository(Task)
      .createQueryBuilder('task')
      .innerJoin('task.project', 'project')
      .where('task.id = :taskId', { taskId });
    if (userId) query.andWhere('project."userId" = :userId', { userId });
    const task = await query
      .setLock('pessimistic_write', undefined, ['task'])
      .getOne();
    if (!task) throw new NotFoundException(`Task with id ${taskId} not found`);
    const repository = manager.getRepository(Estimate);

    // Match the displayed manual reference: a dedicated manual record first,
    // otherwise the preferred final/aggregate/AI result. An unordered findOne
    // can update an older AI record while leaving the displayed final reference stale.
    let existingEstimate: Estimate | null = null;
    for (const source of [
      EstimateSource.MANUAL,
      EstimateSource.FINAL,
      EstimateSource.AI_SUBTASK_SUM,
      EstimateSource.AI,
    ]) {
      existingEstimate = await repository.findOne({
        where: { task: { id: taskId }, source },
        lock: { mode: 'pessimistic_write', tables: ['estimates'] },
      });
      if (existingEstimate) break;
    }

    if (existingEstimate) {
      const changes = {
        manualEstimate: hours,
        ...(existingEstimate.source === EstimateSource.MANUAL
          ? { finalEstimate: hours }
          : {}),
      };
      // Update only reference fields, never save a stale AI/final entity snapshot.
      // Synchronize duplicate legacy records of the chosen source so whichever
      // record the client reads first has the same displayed reference.
      await repository.update(
        { task: { id: taskId }, source: existingEstimate.source },
        changes
      );
      return { ...existingEstimate, ...changes };
    }

    const newEstimate = repository.create({
      task: { id: taskId },
      manualEstimate: hours,
      finalEstimate: hours,
      source: EstimateSource.MANUAL,
    });
    const inserted = await repository.insert(newEstimate);
    newEstimate.id = inserted.identifiers[0].id;
    return newEstimate;
  }

  private async ensureTaskOwnedByUser(
    taskId: string,
    userId: string,
    manager?: EntityManager
  ): Promise<void> {
    const task = await (manager?.getRepository(Task) ?? this.taskRepository)
      .createQueryBuilder('task')
      .innerJoin('task.project', 'project')
      .where('task.id = :taskId', { taskId })
      .andWhere('project."userId" = :userId', { userId })
      .getOne();

    if (!task) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }
  }

  private ownedUpdate(
    estimateId: string,
    userId: string,
    updateData: Partial<Estimate>
  ) {
    return this.estimateRepository
      .createQueryBuilder()
      .update(Estimate)
      .set(updateData)
      .where('id = :estimateId', { estimateId })
      .andWhere(
        `"taskId" IN (
          SELECT task.id
          FROM tasks task
          INNER JOIN projects project ON project.id = task."projectId"
          WHERE project."userId" = :userId
        )`,
        { userId }
      )
      .execute();
  }
}
