import { CreateEstimateFeedbackDto } from './dto/create-estimate-feedback.dto';
import { EstimateFeedback } from './entities/estimate-feedback.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Repository } from 'typeorm';
import { FeedbackAnalysisService } from './feedback-analysis.service';

@Injectable()
export class EstimateFeedbackService {
  constructor(
    @InjectRepository(EstimateFeedback)
    private readonly feedbackRepository: Repository<EstimateFeedback>,
    @Inject(forwardRef(() => FeedbackAnalysisService))
    private readonly feedbackAnalysisService: FeedbackAnalysisService,
  ) {}

  async create(dto: CreateEstimateFeedbackDto): Promise<EstimateFeedback> {
    const feedback = this.feedbackRepository.create({
      task: { id: dto.taskId },
      actualHours: dto.actualHours,
      rating: dto.rating,
      comment: dto.comment,
      reasonForDeviation: dto.reasonForDeviation,
      missedComplexityTags: dto.missedComplexityTags,
      deviationComment: dto.deviationComment,
    });
    const savedFeedback = await this.feedbackRepository.save(feedback);

    // Trigger analysis asynchronously
    this.feedbackAnalysisService.analyzeFeedback(savedFeedback).catch(error => {
      // Log error but don't block the response
      console.error('Error during feedback analysis:', error);
    });

    return savedFeedback;
  }

  async findAll(): Promise<EstimateFeedback[]> {
    return this.feedbackRepository.find({ relations: ['task'] });
  }
}
