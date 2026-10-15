import {
  AdaptiveFeedbackCalibrationPolicy,
  ADAPTIVE_ALGORITHM_VERSION,
} from './adaptive-feedback-calibration-policy';
import { FeedbackCalibrationContext } from './feedback-calibration-policy';
import {
  EstimateFeedback,
  DeviationReason,
} from './entities/estimate-feedback.entity';
import { TenantCalibrationCoefficient } from '../calibration/entities/tenant-calibration-coefficient.entity';

const context = (
  ratio = 1.5,
  count = 29,
  keys = ['experience.MIDDLE']
): FeedbackCalibrationContext => ({
  tenantUserId: 'tenant-a',
  targetCoefficientKeys: keys,
  feedback: Object.assign(new EstimateFeedback(), {
    id: 'feedback',
    actualHours: ratio * 10,
    estimatedHoursSnapshot: 10,
  }),
  coefficients: keys.map((key) =>
    Object.assign(new TenantCalibrationCoefficient(), {
      key,
      tenantUserId: 'tenant-a',
      value: 1,
      defaultValue: 1,
      minValue: 0.5,
      maxValue: 2,
      eligibleSampleCount: count,
      totalWeight: count,
      ewmaLogError: 0,
      version: 1,
    })
  ),
});

describe('AdaptiveFeedbackCalibrationPolicy', () => {
  const policy = new AdaptiveFeedbackCalibrationPolicy();
  it('uses exact log residual, learning rate, EWMA and version', async () => {
    const result = await policy.evaluate(context());
    const m = result.mutations[0];
    expect(result.algorithmVersion).toBe(ADAPTIVE_ALGORITHM_VERSION);
    expect(m.newValue).toBeCloseTo(Math.exp(0.08 * Math.log(1.5)), 14);
    expect(m.newEwmaLogError).toBeCloseTo(0.2 * Math.log(1.5), 14);
    expect(m.newEligibleSampleCount).toBe(30);
    expect(m.newTotalWeight).toBe(30);
  });
  it.each([0.05, 0.1, 5, 10, 100])(
    'clips ratio %s and limits total movement',
    async (ratio) => {
      const m = (await policy.evaluate(context(ratio))).mutations[0];
      expect(m.clampedCorrectionFactor).toBe(
        Math.max(0.35, Math.min(3, ratio))
      );
      expect(Math.abs(Math.log(m.newValue))).toBeLessThanOrEqual(
        Math.log(1.05) + 1e-15
      );
    }
  );
  it.each([1, 2, 3, 4])(
    'accumulates state without movement at sample %s',
    async (n) => {
      const m = (await policy.evaluate(context(1.5, n - 1))).mutations[0];
      expect(m.newValue).toBe(m.oldValue);
      expect(m.newEligibleSampleCount).toBe(n);
      expect(m.newTotalWeight).toBe(n);
      expect(m.newEwmaLogError).toBeCloseTo(0.2 * Math.log(1.5), 14);
    }
  );
  it('ramps confidence continuously from 1/26 at sample 5 to 1 at 30', async () => {
    for (let n = 5; n <= 31; n++) {
      const m = (await policy.evaluate(context(1.5, n - 1))).mutations[0];
      expect(m.newValue).toBeCloseTo(
        Math.exp(0.08 * Math.min(1, (n - 4) / 26) * Math.log(1.5)),
        14
      );
    }
  });
  it('normalizes all factors independent of key order and unequal confidence', async () => {
    const c = context(100, 29, [
      'project.complexity.MEDIUM',
      'complexity.refactor',
      'experience.MIDDLE',
    ]);
    const result = await policy.evaluate(c);
    expect(result.mutations.reduce((sum, m) => sum + m.weight!, 0)).toBe(1);
    expect(
      result.mutations.reduce((p, m) => (p * m.newValue) / m.oldValue, 1)
    ).toBeCloseTo(1.05, 14);
    expect(result.mutations.every((m) => m.newTotalWeight === 29 + 1 / 3)).toBe(
      true
    );
    expect(
      await policy.evaluate({
        ...c,
        coefficients: [...c.coefficients].reverse(),
        targetCoefficientKeys: [...c.targetCoefficientKeys].reverse(),
      })
    ).toEqual(result);
    c.coefficients[0].eligibleSampleCount = 0;
    const mixed = await policy.evaluate(c);
    expect(
      mixed.mutations.reduce(
        (sum, m) => sum + Math.abs(Math.log(m.newValue / m.oldValue)),
        0
      )
    ).toBeLessThan(Math.log(1.05));
  });
  it('uses the locked previous EWMA and decays it on accurate feedback without value drift', async () => {
    const c = context(1);
    c.coefficients[0].ewmaLogError = 0.5;
    const m = (await policy.evaluate(c)).mutations[0];
    expect(m.oldEwmaLogError).toBe(0.5);
    expect(m.newEwmaLogError).toBe(0.4);
    expect(m.newValue).toBe(m.oldValue);
    expect(m.newEligibleSampleCount).toBe(30);
  });
  it.each([0.9, 1, 1.1])(
    'learns even below the former 15%% threshold: %s',
    async (ratio) => {
      expect((await policy.evaluate(context(ratio))).mutations).toHaveLength(1);
    }
  );
  it.each([
    DeviationReason.SCOPE_CREEP,
    DeviationReason.EXTERNAL_DEPENDENCY_DELAY,
    DeviationReason.ENVIRONMENT_OR_TOOLING_ISSUES,
  ])('excludes %s with an explicit reason', async (reason) => {
    const c = context();
    c.feedback.reasonForDeviation = reason;
    expect(await policy.evaluate(c)).toMatchObject({
      skipReason: `excluded_deviation_reason:${reason}`,
      mutations: [],
    });
  });
  it.each([
    DeviationReason.UNFORESEEN_TECHNICAL_COMPLEXITY,
    DeviationReason.INCORRECT_INITIAL_ASSUMPTIONS,
    DeviationReason.ESTIMATE_WAS_ACCURATE,
    DeviationReason.OTHER,
  ])('accepts %s', async (reason) => {
    const c = context();
    c.feedback.reasonForDeviation = reason;
    expect((await policy.evaluate(c)).mutations).toHaveLength(1);
  });
  it.each([0, -1, NaN, Infinity, -Infinity])(
    'rejects invalid actual and estimated hours: %s',
    async (value) => {
      const c = context();
      c.feedback.actualHours = value;
      expect((await policy.evaluate(c)).skipReason).toBe(
        'invalid_actual_hours'
      );
      c.feedback.actualHours = 10;
      c.feedback.estimatedHoursSnapshot = value;
      expect((await policy.evaluate(c)).skipReason).toBe(
        'invalid_estimated_hours_snapshot'
      );
    }
  );
  it('rejects missing and overflowing numeric context', async () => {
    const c = context();
    c.feedback.estimatedHoursSnapshot = null;
    expect((await policy.evaluate(c)).skipReason).toBe(
      'invalid_estimated_hours_snapshot'
    );
    c.feedback.estimatedHoursSnapshot = Number.MIN_VALUE;
    expect((await policy.evaluate(c)).skipReason).toBe('invalid_effort_ratio');
  });
  it('rejects missing, duplicate or foreign tenant coefficient context', async () => {
    const c = context();
    expect((await policy.evaluate({ ...c, coefficients: [] })).skipReason).toBe(
      'missing_or_invalid_calibration_context'
    );
    expect(
      (
        await policy.evaluate({
          ...c,
          targetCoefficientKeys: [
            c.targetCoefficientKeys[0],
            c.targetCoefficientKeys[0],
          ],
        })
      ).skipReason
    ).toBe('missing_or_invalid_calibration_context');
    c.coefficients[0].tenantUserId = 'tenant-b';
    expect((await policy.evaluate(c)).skipReason).toBe(
      'missing_or_invalid_calibration_context'
    );
  });
  it.each([NaN, Infinity])(
    'throws for corrupt persisted EWMA %s',
    async (value) => {
      const c = context();
      c.coefficients[0].ewmaLogError = value;
      await expect(policy.evaluate(c)).rejects.toThrow(
        'Invalid locked calibration state'
      );
    }
  );
  it.each([
    [2, 100],
    [0.5, 0.05],
  ])('retains state at boundary %s', async (value, ratio) => {
    const c = context(ratio);
    c.coefficients[0].value = value;
    const m = (await policy.evaluate(c)).mutations[0];
    expect(m.newValue).toBe(value);
    expect(m.newEligibleSampleCount).toBe(30);
    expect(m.newTotalWeight).toBe(30);
  });
  it.each([
    [1.999, 100, 2],
    [0.501, 0.05, 0.5],
  ])(
    'clamps a step crossing the boundary from %s',
    async (value, ratio, expected) => {
      const c = context(ratio);
      c.coefficients[0].value = value;
      expect((await policy.evaluate(c)).mutations[0].newValue).toBe(expected);
    }
  );
  it('rejects arithmetic underflow instead of treating it as a valid clipped observation', async () => {
    const c = context();
    c.feedback.actualHours = Number.MIN_VALUE;
    c.feedback.estimatedHoursSnapshot = Number.MAX_VALUE;
    expect((await policy.evaluate(c)).skipReason).toBe('invalid_effort_ratio');
  });
  it('keeps an identical policy context unchanged', async () => {
    const c = context();
    const before = JSON.stringify(c);
    await policy.evaluate(c);
    await policy.evaluate(c);
    expect(JSON.stringify(c)).toBe(before);
  });
  it('validates configuration and permits conservative overrides', () => {
    expect(
      () => new AdaptiveFeedbackCalibrationPolicy({ ewmaAlpha: NaN })
    ).toThrow();
    expect(
      () => new AdaptiveFeedbackCalibrationPolicy({ baseLearningRate: 0.5 })
    ).toThrow();
    expect(
      () => new AdaptiveFeedbackCalibrationPolicy({ fullConfidenceSamples: 3 })
    ).toThrow();
    expect(
      new AdaptiveFeedbackCalibrationPolicy({ baseLearningRate: 0.04 }).options
        .baseLearningRate
    ).toBe(0.04);
  });
});
