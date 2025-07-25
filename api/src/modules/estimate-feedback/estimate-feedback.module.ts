import { EstimateFeedbackController } from './estimate-feedback.controller';
import { EstimateFeedbackService } from './estimate-feedback.service';
import { EstimateFeedback } from './entities/estimate-feedback.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

@Module({
  imports: [TypeOrmModule.forFeature([EstimateFeedback])],
  providers: [EstimateFeedbackService],
  controllers: [EstimateFeedbackController],
  exports: [EstimateFeedbackService],
})
export class EstimateFeedbackModule {}
