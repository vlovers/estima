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
    await this.seedInitialCoefficients();
    await this.loadCoefficients();
  }

  private async seedInitialCoefficients(): Promise<void> {
    const count = await this.coefficientRepository.count();
    if (count > 0) {
      this.logger.log('Coefficients table is not empty, skipping seed.');
      return;
    }

    this.logger.log('Coefficients table is empty, seeding initial values...');

    const initialCoefficients: Partial<Coefficient>[] = [
      // Experience Level
      { key: 'experience.JUNIOR', value: 1.5, category: 'experience', description: 'Modifier for Junior-level tasks.' },
      { key: 'experience.MIDDLE', value: 1.0, category: 'experience', description: 'Baseline modifier for Middle-level tasks.' },
      { key: 'experience.SENIOR', value: 0.75, category: 'experience', description: 'Modifier for Senior-level tasks.' },

      // Project Complexity
      { key: 'project.complexity.LOW', value: 0.9, category: 'project', description: 'Modifier for low-complexity projects.' },
      { key: 'project.complexity.MEDIUM', value: 1.0, category: 'project', description: 'Baseline modifier for medium-complexity projects.' },
      { key: 'project.complexity.HIGH', value: 1.2, category: 'project', description: 'Modifier for high-complexity projects.' },

      // Complexity Tags (examples)
      { key: 'complexity.legacy_code', value: 1.4, category: 'complexity', description: 'Working with old, poorly documented code.' },
      { key: 'complexity.third_party_integration', value: 1.3, category: 'complexity', description: 'Integrating with external APIs or services.' },
      { key: 'complexity.new_infra', value: 1.5, category: 'complexity', description: 'Setting up new infrastructure components.' },
      { key: 'complexity.refactor', value: 1.2, category: 'complexity', description: 'Significant refactoring of existing code.' },
      { key: 'complexity.concurrency', value: 1.6, category: 'complexity', description: 'Tasks involving multithreading or parallel processing.' },
      { key: 'complexity.data_modeling', value: 1.3, category: 'complexity', description: 'Complex data schema design or modification.' },
      { key: 'complexity.performance_critical', value: 1.4, category: 'complexity', description: 'Tasks with strict performance requirements.' },
    ];

    const entities = this.coefficientRepository.create(initialCoefficients);
    await this.coefficientRepository.save(entities);

    this.logger.log(`Seeded ${entities.length} initial coefficients.`);
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
