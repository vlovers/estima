import { Injectable } from '@nestjs/common';
import { TenantCalibrationCoefficient } from '../calibration/entities/tenant-calibration-coefficient.entity';
import { EstimateFeedback } from './entities/estimate-feedback.entity';

export type FeedbackCalibrationContext = {
  feedback: EstimateFeedback;
  tenantUserId: string;
  targetCoefficientKeys: string[];
  coefficients: TenantCalibrationCoefficient[];
};

export type FeedbackCoefficientMutation = {
  coefficientKey: string;
  oldValue: number;
  newValue: number;
  oldEligibleSampleCount: number;
  newEligibleSampleCount: number;
  oldTotalWeight: number;
  newTotalWeight: number;
  defaultValue: number | null;
  correctionFactor: number | null;
  clampedCorrectionFactor: number | null;
  weight: number | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
};

export type FeedbackCalibrationPolicyResult = {
  targetCoefficientKeys: string[];
  mutations: FeedbackCoefficientMutation[];
  algorithmVersion: string;
  skipReason?: string;
  metadata: Record<string, unknown> | null;
};

export interface FeedbackCalibrationPolicy {
  evaluate(
    context: FeedbackCalibrationContext
  ): Promise<FeedbackCalibrationPolicyResult>;
}

export const NO_LEARNING_ALGORITHM_VERSION = 'no-learning-pr3.3';

@Injectable()
export class NoLearningFeedbackCalibrationPolicy
  implements FeedbackCalibrationPolicy
{
  async evaluate(
    context: FeedbackCalibrationContext
  ): Promise<FeedbackCalibrationPolicyResult> {
    return {
      targetCoefficientKeys: context.targetCoefficientKeys,
      mutations: [],
      algorithmVersion: NO_LEARNING_ALGORITHM_VERSION,
      skipReason: 'learning_policy_disabled_until_pr3_4',
      metadata: {
        reason: 'PR3.3 establishes transactional processing only.',
        feedbackId: context.feedback.id,
        tenantUserId: context.tenantUserId,
      },
    };
  }
}
