import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coefficient } from '../calibration/entities/coefficient.entity';
import { EstimateFeedback, DeviationReason } from './entities/estimate-feedback.entity';
import { CalibrationService } from '../calibration/calibration.service';
import { Task } from '../tasks/entities/task.entity';
import { EstimateSource } from '../estimates/entities/estimate.entity';

const LEARNING_RATE = 0.1; // How much to adjust coefficients by, 0.01 to 0.2 is a safe range
const MIN_DEVIATION_THRESHOLD = 0.15; // 15% deviation required to trigger learning

@Injectable()
export class FeedbackAnalysisService {
  private readonly logger = new Logger(FeedbackAnalysisService.name);

  constructor(
    @InjectRepository(Coefficient)
    private readonly coefficientRepository: Repository<Coefficient>,
    @InjectRepository(EstimateFeedback)
    private readonly feedbackRepository: Repository<EstimateFeedback>,
    private readonly calibrationService: CalibrationService,
  ) {}

  public async analyzeFeedback(feedback: EstimateFeedback): Promise<void> {
    this.logger.log(`Starting analysis for feedback ID: ${feedback.id}`);

    const fullFeedback = await this.feedbackRepository.findOne({
      where: { id: feedback.id },
      relations: ['task', 'task.estimates', 'task.project'],
    });

    if (!fullFeedback || !fullFeedback.task) {
      this.logger.warn(`Feedback or associated task not found for ID: ${feedback.id}. Aborting analysis.`);
      return;
    }

    const { task, actualHours, reasonForDeviation } = fullFeedback;

    // 1. Filter out irrelevant feedback
    const ignorableReasons = [
      DeviationReason.SCOPE_CREEP,
      DeviationReason.EXTERNAL_DEPENDENCY_DELAY,
      DeviationReason.ENVIRONMENT_OR_TOOLING_ISSUES,
      DeviationReason.ESTIMATE_WAS_ACCURATE,
    ];

    if (reasonForDeviation && ignorableReasons.includes(reasonForDeviation)) {
      this.logger.log(`Feedback ID ${feedback.id} has reason '${reasonForDeviation}', which is not subject to learning. Skipping.`);
      return;
    }

    const aiEstimate = task.estimates.find(e => e.source === EstimateSource.AI_SUBTASK_SUM)?.finalEstimate;

    if (!aiEstimate || aiEstimate <= 0) {
      this.logger.warn(`Task ${task.id} has no valid AI estimate. Aborting analysis.`);
      return;
    }

    const deviation = Math.abs(actualHours - aiEstimate) / aiEstimate;
    if (deviation < MIN_DEVIATION_THRESHOLD) {
      this.logger.log(`Deviation for task ${task.id} is ${deviation.toFixed(2)}, which is below the threshold of ${MIN_DEVIATION_THRESHOLD}. Skipping.`);
      return;
    }

    this.logger.log(`Feedback for task ${task.id} is eligible for learning. Deviation: ${deviation.toFixed(2)}`);

    // 2. Calculate correction factor
    const correctionFactor = actualHours / aiEstimate;
    this.logger.log(`Correction factor for task ${task.id} is ${correctionFactor.toFixed(3)}x`);

    // 3. Identify & update target coefficients
    const keysToUpdate = this.getRelevantCoefficientKeys(task, fullFeedback);
    this.logger.log(`Identified ${keysToUpdate.length} coefficient keys for update: ${keysToUpdate.join(', ')}`);

    for (const key of keysToUpdate) {
      await this.adjustCoefficient(key, correctionFactor);
    }

    // 4. Reset cache to apply changes immediately
    await this.calibrationService.resetCache();

    this.logger.log(`Finished analysis for feedback ID: ${feedback.id}`);
  }

  private getRelevantCoefficientKeys(task: Task, feedback: EstimateFeedback): string[] {
    const keys = new Set<string>();

    // Experience level
    if (task.experienceLevel) {
      keys.add(`experience.${task.experienceLevel}`);
    }

    // Project complexity
    if (task.project?.complexity) {
      keys.add(`project.complexity.${task.project.complexity}`);
    }

    // Original complexity tags
    (task.complexityTags || []).forEach(tag => keys.add(`complexity.${tag}`));

    // Missed complexity tags from feedback
    (feedback.missedComplexityTags || []).forEach(tag => keys.add(`complexity.${tag}`));

    return Array.from(keys);
  }

  private async adjustCoefficient(key: string, correctionFactor: number): Promise<void> {
    let coefficient = await this.coefficientRepository.findOne({ where: { key } });

    if (!coefficient) {
      this.logger.log(`Coefficient with key '${key}' not found. Creating it with default value 1.0 before adjustment.`);
      coefficient = this.coefficientRepository.create({
        key,
        value: 1.0,
        category: key.split('.')[0],
        description: `Auto-created during feedback analysis.`,
      });
    }

    const oldValue = coefficient.value;
    // Apply learning rate to avoid drastic changes from a single feedback
    const newValue = oldValue * (1 - LEARNING_RATE) + (oldValue * correctionFactor) * LEARNING_RATE;

    coefficient.value = newValue;
    await this.coefficientRepository.save(coefficient);

    this.logger.log(`Adjusted coefficient '${key}': ${oldValue.toFixed(3)} -> ${newValue.toFixed(3)}`);
  }
}
