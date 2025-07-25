import { CreateEstimateFeedbackDto } from './dto/create-estimate-feedback.dto';
import { EstimateFeedback } from './entities/estimate-feedback.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';

@Injectable()
export class EstimateFeedbackService {
  constructor(
    @InjectRepository(EstimateFeedback)
    private readonly feedbackRepository: Repository<EstimateFeedback>
  ) {}

  async create(dto: CreateEstimateFeedbackDto): Promise<EstimateFeedback> {
    const feedback = this.feedbackRepository.create({
      task: { id: dto.taskId },
      actualHours: dto.actualHours,
      userEstimate: dto.userEstimate,
    });
    return this.feedbackRepository.save(feedback);
  }

  async findAll(): Promise<EstimateFeedback[]> {
    return this.feedbackRepository.find({ relations: ['task'] });
  }
}
