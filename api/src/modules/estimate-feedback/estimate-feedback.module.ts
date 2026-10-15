import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EstimateFeedback } from './entities/estimate-feedback.entity';
import { EstimateFeedbackService } from './estimate-feedback.service';
import { EstimateFeedbackController } from './estimate-feedback.controller';
import { FeedbackAnalysisService } from './feedback-analysis.service';
import { FeedbackCalibrationProcessor } from './feedback-calibration.processor';
import { FEEDBACK_CALIBRATION_POLICY } from './feedback-calibration-policy';
import { AdaptiveFeedbackCalibrationPolicy } from './adaptive-feedback-calibration-policy';
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
  providers: [
    EstimateFeedbackService,
    FeedbackAnalysisService,
    FeedbackCalibrationProcessor,
    AdaptiveFeedbackCalibrationPolicy,
    {
      provide: FEEDBACK_CALIBRATION_POLICY,
      useExisting: AdaptiveFeedbackCalibrationPolicy,
    },
  ],
  exports: [EstimateFeedbackService, FeedbackCalibrationProcessor],
})
export class EstimateFeedbackModule {}
