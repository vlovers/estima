import { Inject, Injectable, Optional } from '@nestjs/common';
import { DeviationReason } from './entities/estimate-feedback.entity';
import {
  FeedbackCalibrationContext,
  FeedbackCalibrationPolicy,
  FeedbackCalibrationPolicyResult,
} from './feedback-calibration-policy';

export const ADAPTIVE_ALGORITHM_VERSION = 'adaptive-log-pr3.4-v1';
export const ADAPTIVE_CALIBRATION_OPTIONS = Symbol(
  'ADAPTIVE_CALIBRATION_OPTIONS'
);

// Engineering defaults, not empirically optimal parameters. Change the algorithm
// version when changing these in production so audit records remain interpretable.
export const DEFAULT_ADAPTIVE_CALIBRATION_OPTIONS = Object.freeze({
  minRatio: 0.35,
  maxRatio: 3,
  minLearningSamples: 5,
  fullConfidenceSamples: 30,
  baseLearningRate: 0.08,
  ewmaAlpha: 0.2,
  maxCombinedLogStep: Math.log(1.05),
});
export type AdaptiveCalibrationOptions = {
  [Key in keyof typeof DEFAULT_ADAPTIVE_CALIBRATION_OPTIONS]: number;
};

const EXCLUDED_REASONS = new Set<DeviationReason>([
  DeviationReason.SCOPE_CREEP,
  DeviationReason.EXTERNAL_DEPENDENCY_DELAY,
  DeviationReason.ENVIRONMENT_OR_TOOLING_ISSUES,
]);
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

@Injectable()
export class AdaptiveFeedbackCalibrationPolicy
  implements FeedbackCalibrationPolicy
{
  readonly algorithmVersion = ADAPTIVE_ALGORITHM_VERSION;
  readonly options: Readonly<AdaptiveCalibrationOptions>;

  constructor(
    @Optional()
    @Inject(ADAPTIVE_CALIBRATION_OPTIONS)
    options?: Partial<AdaptiveCalibrationOptions>
  ) {
    this.options = Object.freeze({
      ...DEFAULT_ADAPTIVE_CALIBRATION_OPTIONS,
      ...options,
    });
    const o = this.options;
    if (
      !Object.values(o).every(Number.isFinite) ||
      o.minRatio <= 0 ||
      o.minRatio > 1 ||
      o.maxRatio < 1 ||
      !Number.isSafeInteger(o.minLearningSamples) ||
      o.minLearningSamples < 1 ||
      !Number.isSafeInteger(o.fullConfidenceSamples) ||
      o.fullConfidenceSamples < o.minLearningSamples ||
      o.baseLearningRate <= 0 ||
      o.baseLearningRate > 0.08 ||
      o.ewmaAlpha <= 0 ||
      o.ewmaAlpha > 1 ||
      o.maxCombinedLogStep <= 0 ||
      o.maxCombinedLogStep > Math.log(1.05)
    ) {
      throw new Error('Invalid adaptive calibration options');
    }
  }

  async evaluate(
    context: FeedbackCalibrationContext
  ): Promise<FeedbackCalibrationPolicyResult> {
    const keys = [...context.targetCoefficientKeys].sort();
    const result: FeedbackCalibrationPolicyResult = {
      targetCoefficientKeys: keys,
      mutations: [],
      algorithmVersion: this.algorithmVersion,
      metadata: null,
    };
    const skip = (reason: string): FeedbackCalibrationPolicyResult => ({
      ...result,
      skipReason: reason,
    });
    const { feedback } = context;
    if (!Number.isFinite(feedback.actualHours) || feedback.actualHours <= 0) {
      return skip('invalid_actual_hours');
    }
    const estimated = feedback.estimatedHoursSnapshot;
    if (
      typeof estimated !== 'number' ||
      !Number.isFinite(estimated) ||
      estimated <= 0
    ) {
      return skip('invalid_estimated_hours_snapshot');
    }
    if (EXCLUDED_REASONS.has(feedback.reasonForDeviation)) {
      return skip(`excluded_deviation_reason:${feedback.reasonForDeviation}`);
    }
    // All other declared reasons and absent reasons are eligible, including accurate estimates.
    if (
      feedback.reasonForDeviation &&
      !Object.values(DeviationReason).includes(feedback.reasonForDeviation)
    ) {
      return skip('unknown_deviation_reason');
    }
    const byKey = new Map(context.coefficients.map((row) => [row.key, row]));
    if (
      !context.tenantUserId ||
      keys.length === 0 ||
      new Set(keys).size !== keys.length ||
      byKey.size !== context.coefficients.length ||
      byKey.size !== keys.length ||
      keys.some((key) => !byKey.has(key)) ||
      context.coefficients.some(
        (row) => row.tenantUserId !== context.tenantUserId
      )
    ) {
      return skip('missing_or_invalid_calibration_context');
    }
    // Reject overflow/underflow rather than treating a non-finite ratio as a valid outlier.
    const ratio = feedback.actualHours / estimated;
    if (!Number.isFinite(ratio) || ratio <= 0)
      return skip('invalid_effort_ratio');
    const clampedRatio = clamp(
      ratio,
      this.options.minRatio,
      this.options.maxRatio
    );
    const logError = Math.log(ratio);
    const clampedLogError = Math.log(clampedRatio);
    const weight = 1 / keys.length;
    result.metadata = {
      ratio,
      logError,
      clampedRatio,
      clampedLogError,
      factorCount: keys.length,
    };
    result.mutations = keys.map((key) => {
      const row = byKey.get(key);
      if (!row) throw new Error(`Missing locked coefficient ${key}`);
      if (
        ![
          row.value,
          row.defaultValue,
          row.minValue,
          row.maxValue,
          row.totalWeight,
          row.ewmaLogError,
        ].every(Number.isFinite) ||
        row.minValue < 0.5 ||
        row.maxValue > 2 ||
        row.minValue > row.maxValue ||
        row.value < row.minValue ||
        row.value > row.maxValue ||
        row.defaultValue < row.minValue ||
        row.defaultValue > row.maxValue ||
        !Number.isSafeInteger(row.eligibleSampleCount) ||
        row.eligibleSampleCount < 0 ||
        row.totalWeight < 0 ||
        !Number.isSafeInteger(row.version) ||
        row.version < 1
      ) {
        throw new Error(`Invalid locked calibration state for ${key}`);
      }
      const sampleCount = row.eligibleSampleCount + 1;
      const confidence = clamp(
        (sampleCount - this.options.minLearningSamples + 1) /
          (this.options.fullConfidenceSamples -
            this.options.minLearningSamples +
            1),
        0,
        1
      );
      const learningRate = this.options.baseLearningRate * confidence;
      // Each factor receives 1/k of the log correction. Bounds never redistribute
      // unused correction to other factors; sum(abs(deltaLog)) <= maxCombinedLogStep.
      const deltaLog =
        weight *
        clamp(
          learningRate * clampedLogError,
          -this.options.maxCombinedLogStep,
          this.options.maxCombinedLogStep
        );
      const newValue = clamp(
        row.value * Math.exp(deltaLog),
        row.minValue,
        row.maxValue
      );
      // EWMA is an attributed residual diagnostic, not accumulated correction debt.
      // Using the current residual for movement avoids drift on later accurate feedback.
      const newEwmaLogError =
        (1 - this.options.ewmaAlpha) * row.ewmaLogError +
        this.options.ewmaAlpha * weight * clampedLogError;
      return {
        coefficientKey: key,
        oldValue: row.value,
        newValue,
        oldEligibleSampleCount: row.eligibleSampleCount,
        newEligibleSampleCount: sampleCount,
        oldTotalWeight: row.totalWeight,
        newTotalWeight: row.totalWeight + weight,
        oldEwmaLogError: row.ewmaLogError,
        newEwmaLogError,
        defaultValue: row.defaultValue,
        correctionFactor: ratio,
        clampedCorrectionFactor: clampedRatio,
        weight,
        reason: 'adaptive_log_error',
        metadata: {
          ...result.metadata,
          confidence,
          learningRate,
          deltaLog,
          appliedDeltaLog: Math.log(newValue / row.value),
          oldEwmaLogError: row.ewmaLogError,
          newEwmaLogError,
          options: this.options,
        },
      };
    });
    return result;
  }
}
