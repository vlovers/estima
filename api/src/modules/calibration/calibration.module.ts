import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Coefficient } from './entities/coefficient.entity';
import { CalibrationService } from './calibration.service';

@Module({
  imports: [TypeOrmModule.forFeature([Coefficient])],
  providers: [CalibrationService],
  exports: [CalibrationService],
})
export class CalibrationModule {}
