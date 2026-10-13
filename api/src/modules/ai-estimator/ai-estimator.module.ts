import { Module } from '@nestjs/common';
import { AiEstimatorService } from './ai-estimator.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from '../tasks/entities/task.entity';
import { ProjectsModule } from '../projects/projects.module';
import { CalibrationModule } from '../calibration/calibration.module';

@Module({
  imports: [TypeOrmModule.forFeature([Task]), ProjectsModule, CalibrationModule],
  providers: [AiEstimatorService],
  exports: [AiEstimatorService],
})
export class AiEstimatorModule {}
