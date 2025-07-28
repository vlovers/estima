import { UpdateEstimateDto } from './dto/update-estimate.dto';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { EstimateSource } from './entities/estimate.entity';
import { Estimate } from './entities/estimate.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';

@Injectable()
export class EstimatesService {
  constructor(
    @InjectRepository(Estimate)
    private readonly estimateRepository: Repository<Estimate>
  ) {}

  async create(createEstimateDto: CreateEstimateDto): Promise<Estimate> {
    const {
      taskId,
      userId,
      manualEstimate,
      finalEstimate,
      source,
      confidence,
    } = createEstimateDto;

    const estimateData: Partial<Estimate> = {
      finalEstimate,
      manualEstimate,
      source,
      confidence,
      task: { id: taskId } as any,
    };

    if (userId) {
      estimateData.user = { id: userId } as any;
    }

    const estimate = this.estimateRepository.create(estimateData);
    return this.estimateRepository.save(estimate);
  }

  findAll() {
    return this.estimateRepository.find({ relations: ['task', 'user'] });
  }

  findOne(id: string) {
    return this.estimateRepository.findOne({
      where: { id },
      relations: ['task', 'user'],
    });
  }

  async update(id: string, updateEstimateDto: UpdateEstimateDto) {
    const result = await this.estimateRepository.update(id, updateEstimateDto);

    if (result.affected === 0) {
      throw new Error(`Estimate with id ${id} not found`);
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    return this.estimateRepository.delete(id);
  }

  async createOrUpdateManualEstimate(
    taskId: string,
    hours: number
  ): Promise<Estimate> {
    const existingEstimate = await this.estimateRepository.findOne({
      where: {
        task: { id: taskId },
      },
    });

    if (existingEstimate) {
      existingEstimate.manualEstimate = hours;
      return this.estimateRepository.save(existingEstimate);
    }

    const newEstimate = this.estimateRepository.create({
      task: { id: taskId },
      manualEstimate: hours,
      source: EstimateSource.MANUAL,
    });
    return this.estimateRepository.save(newEstimate);
  }
}
