import { EstimateFeedbackModule } from '../estimate-feedback/estimate-feedback.module';
import { ProjectsModule } from '../projects/projects.module';
import { AiEstimatorService } from './ai-estimator.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from '../tasks/entities/task.entity';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    EstimateFeedbackModule,
    TypeOrmModule.forFeature([Task]),
    ProjectsModule,
  ],
  controllers: [],
  providers: [AiEstimatorService],
  exports: [AiEstimatorService],
})
export class AiEstimatorModule {}
