import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EstimateFeedback } from './entities/estimate-feedback.entity';
import { EstimateFeedbackService } from './estimate-feedback.service';
import { EstimateFeedbackController } from './estimate-feedback.controller';
import { FeedbackAnalysisService } from './feedback-analysis.service';
import { CalibrationModule } from '../calibration/calibration.module';
import { Coefficient } from '../calibration/entities/coefficient.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EstimateFeedback, Coefficient]),
    CalibrationModule,
  ],
  controllers: [EstimateFeedbackController],
  providers: [EstimateFeedbackService, FeedbackAnalysisService],
  exports: [EstimateFeedbackService],
})
export class EstimateFeedbackModule {}
