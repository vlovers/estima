import { CreateEstimateFeedbackDto } from './dto/create-estimate-feedback.dto';
import { EstimateFeedback } from './entities/estimate-feedback.entity';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { FeedbackAnalysisService } from './feedback-analysis.service';
import { Task } from '../tasks/entities/task.entity';

@Injectable()
export class EstimateFeedbackService {
  constructor(
    @InjectRepository(EstimateFeedback)
    private readonly feedbackRepository: Repository<EstimateFeedback>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @Inject(forwardRef(() => FeedbackAnalysisService))
    private readonly feedbackAnalysisService: FeedbackAnalysisService
  ) {}

  async create(
    dto: CreateEstimateFeedbackDto,
    userId: string
  ): Promise<EstimateFeedback> {
    await this.ensureTaskOwnedByUser(dto.taskId, userId);

    const feedback = this.feedbackRepository.create({
      taskId: dto.taskId,
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
    this.feedbackAnalysisService
      .analyzeFeedback(savedFeedback)
      .catch((error) => {
        // Log error but don't block the response
        console.error('Error during feedback analysis:', error);
      });

    return savedFeedback;
  }

  async findAll(userId: string): Promise<EstimateFeedback[]> {
    return this.feedbackRepository
      .createQueryBuilder('feedback')
      .innerJoinAndSelect('feedback.task', 'task')
      .innerJoin('task.project', 'project')
      .where('project."userId" = :userId', { userId })
      .getMany();
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
