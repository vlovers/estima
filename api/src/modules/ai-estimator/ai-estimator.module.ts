import { EstimateFeedbackModule } from '../estimate-feedback/estimate-feedback.module';
import { AiEstimatorController } from './ai-estimator.controller';
import { AiEstimatorService } from './ai-estimator.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from '../tasks/entities/task.entity';
import { Module } from '@nestjs/common';

@Module({
  imports: [EstimateFeedbackModule, TypeOrmModule.forFeature([Task])],
  controllers: [AiEstimatorController],
  providers: [AiEstimatorService],
  exports: [AiEstimatorService],
})
export class AiEstimatorModule {}
