import { UpdateEstimateDto } from './dto/update-estimate.dto';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { EstimateSource } from './entities/estimate.entity';
import { Estimate } from './entities/estimate.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
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
    userId?: string
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
      await this.ensureTaskOwnedByUser(taskId, userId);
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

    const estimate = this.estimateRepository.create(estimateData);
    const inserted = await this.estimateRepository.insert(estimate);
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
    userId?: string
  ): Promise<Estimate> {
    if (userId) {
      await this.ensureTaskOwnedByUser(taskId, userId);
    }

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
      existingEstimate = await this.estimateRepository.findOne({
        where: { task: { id: taskId }, source },
      });
      if (existingEstimate) break;
    }

    if (existingEstimate) {
      existingEstimate.manualEstimate = hours;
      if (existingEstimate.source === EstimateSource.MANUAL) {
        existingEstimate.finalEstimate = hours;
      }
      return this.estimateRepository.save(existingEstimate);
    }

    const newEstimate = this.estimateRepository.create({
      task: { id: taskId },
      manualEstimate: hours,
      finalEstimate: hours,
      source: EstimateSource.MANUAL,
    });
    const inserted = await this.estimateRepository.insert(newEstimate);
    newEstimate.id = inserted.identifiers[0].id;
    return newEstimate;
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
