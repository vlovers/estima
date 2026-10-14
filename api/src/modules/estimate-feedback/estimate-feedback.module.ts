import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EstimateFeedback } from './entities/estimate-feedback.entity';
import { EstimateFeedbackService } from './estimate-feedback.service';
import { EstimateFeedbackController } from './estimate-feedback.controller';
import { FeedbackAnalysisService } from './feedback-analysis.service';
import { CalibrationModule } from '../calibration/calibration.module';
import { Coefficient } from '../calibration/entities/coefficient.entity';
import { Estimate } from '../estimates/entities/estimate.entity';
import { Task } from '../tasks/entities/task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EstimateFeedback, Coefficient, Estimate, Task]),
    CalibrationModule,
  ],
  controllers: [EstimateFeedbackController],
  providers: [EstimateFeedbackService, FeedbackAnalysisService],
  exports: [EstimateFeedbackService],
})
export class EstimateFeedbackModule {}
