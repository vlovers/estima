import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Coefficient } from './entities/coefficient.entity';
import { TenantCalibrationCoefficient } from './entities/tenant-calibration-coefficient.entity';

@Injectable()
export class CalibrationService implements OnModuleInit {
  private readonly logger = new Logger(CalibrationService.name);
  private coefficientsCache: Map<string, number> = new Map();

  constructor(
    @InjectRepository(Coefficient)
    private readonly coefficientRepository: Repository<Coefficient>,
    @InjectRepository(TenantCalibrationCoefficient)
    private readonly tenantCoefficientRepository: Repository<TenantCalibrationCoefficient>
  ) {}

  async onModuleInit() {
    await this.loadCoefficients();
  }

  async loadCoefficients(): Promise<void> {
    this.logger.log('Loading coefficients from database...');
    const coefficients = await this.coefficientRepository.find();
    const newCache = new Map<string, number>();
    coefficients.forEach((c) => {
      if (this.isValidCoefficientValue(c.value)) {
        newCache.set(c.key, c.value);
      } else {
        this.logger.warn(`Ignoring invalid global coefficient '${c.key}'.`);
      }
    });
    this.coefficientsCache = newCache;
    this.logger.log(
      `Loaded ${this.coefficientsCache.size} coefficients into cache.`
    );
  }

  getCoefficients(): Map<string, number> {
    return this.coefficientsCache;
  }

  getCoefficient(key: string): number | undefined {
    return this.coefficientsCache.get(key);
  }

  async getEffectiveCoefficients(
    keys: string[],
    tenantUserId?: string | null
  ): Promise<Map<string, number>> {
    const uniqueKeys = [...new Set(keys)].filter(Boolean);
    const effective = new Map<string, number>();

    for (const key of uniqueKeys) {
      const globalValue = this.getCoefficient(key);
      if (this.isValidCoefficientValue(globalValue)) {
        effective.set(key, globalValue);
      }
    }

    if (!tenantUserId || uniqueKeys.length === 0) {
      return effective;
    }

    const tenantRows = await this.tenantCoefficientRepository.find({
      where: {
        tenantUserId,
        key: In(uniqueKeys),
      },
    });

    for (const row of tenantRows) {
      if (this.isValidTenantCoefficient(row)) {
        effective.set(row.key, row.value);
      } else {
        this.logger.warn(
          `Ignoring invalid tenant coefficient '${row.key}' for tenant '${tenantUserId}'.`
        );
      }
    }

    return effective;
  }

  private isValidCoefficientValue(value: number | undefined | null): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  private isValidTenantCoefficient(row: TenantCalibrationCoefficient): boolean {
    return (
      this.isValidCoefficientValue(row.value) &&
      Number.isFinite(row.minValue) &&
      Number.isFinite(row.maxValue) &&
      row.minValue > 0 &&
      row.maxValue >= row.minValue &&
      row.value >= row.minValue &&
      row.value <= row.maxValue
    );
  }

  async resetCache(): Promise<void> {
    this.logger.log('Resetting coefficients cache...');
    await this.loadCoefficients();
  }
}
