import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoefficientChangeEvent } from './entities/coefficient-change-event.entity';
import { Coefficient } from './entities/coefficient.entity';
import { CalibrationService } from './calibration.service';
import { TenantCalibrationCoefficient } from './entities/tenant-calibration-coefficient.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Coefficient,
      CoefficientChangeEvent,
      TenantCalibrationCoefficient,
    ]),
  ],
  providers: [CalibrationService],
  exports: [CalibrationService],
})
export class CalibrationModule {}
