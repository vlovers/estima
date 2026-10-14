import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coefficient } from './entities/coefficient.entity';

@Injectable()
export class CalibrationService implements OnModuleInit {
  private readonly logger = new Logger(CalibrationService.name);
  private coefficientsCache: Map<string, number> = new Map();

  constructor(
    @InjectRepository(Coefficient)
    private readonly coefficientRepository: Repository<Coefficient>,
  ) {}

  async onModuleInit() {
    await this.loadCoefficients();
  }

  async loadCoefficients(): Promise<void> {
    this.logger.log('Loading coefficients from database...');
    const coefficients = await this.coefficientRepository.find();
    const newCache = new Map<string, number>();
    coefficients.forEach(c => newCache.set(c.key, c.value));
    this.coefficientsCache = newCache;
    this.logger.log(`Loaded ${this.coefficientsCache.size} coefficients into cache.`);
  }

  getCoefficients(): Map<string, number> {
    return this.coefficientsCache;
  }

  getCoefficient(key: string): number | undefined {
    return this.coefficientsCache.get(key);
  }

  async resetCache(): Promise<void> {
    this.logger.log('Resetting coefficients cache...');
    await this.loadCoefficients();
  }
}
