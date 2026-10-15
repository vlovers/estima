import 'reflect-metadata';
import {
  AdaptiveFeedbackCalibrationPolicy,
  ADAPTIVE_ALGORITHM_VERSION,
  DEFAULT_ADAPTIVE_CALIBRATION_OPTIONS,
} from '../adaptive-feedback-calibration-policy';
import { EstimateFeedback } from '../entities/estimate-feedback.entity';
import { TenantCalibrationCoefficient } from '../../calibration/entities/tenant-calibration-coefficient.entity';

export type Metrics = {
  mae: number;
  wape: number;
  meanSignedBias: number;
  medianAbsolutePercentageError: number;
  within20Percent: number;
  within30Percent: number;
};
type Observation = {
  id: string;
  tenant: string;
  baseHours: number;
  actualHours: number;
};
type Scenario = {
  name: string;
  trainCount: number;
  testCount: number;
  defaults: number[];
  ratio: (index: number, random: () => number, tenant: string) => number;
  tenants?: string[];
  repeats?: number;
};
export type SimulationResult = {
  scenario: string;
  trainObservations: number;
  testObservations: number;
  global: Metrics;
  calibrated: Metrics;
  medianBaseline: Metrics;
  maxCoefficientMovement: number;
  maxCombinedMultiplicativeCorrection: number;
  maxCumulativeMultiplicativeCorrection: number;
  states: {
    tenant: string;
    values: number[];
    sampleCounts: number[];
    totalWeights: number[];
    ewmaLogErrors: number[];
  }[];
};
const SEED = 340034;
const FACTOR_KEYS = [
  'experience.MIDDLE',
  'project.complexity.MEDIUM',
  'complexity.legacy_code',
  'complexity.refactor',
  'complexity.data_modeling',
];
const product = (values: number[]) => values.reduce((p, n) => p * n, 1);
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
export const metrics = (actual: number[], predicted: number[]): Metrics => {
  const errors = actual.map((a, i) => predicted[i] - a);
  const absolute = errors.map(Math.abs);
  const ape = absolute.map((e, i) => e / actual[i]);
  return {
    mae: absolute.reduce((s, n) => s + n, 0) / actual.length,
    wape:
      absolute.reduce((s, n) => s + n, 0) / actual.reduce((s, n) => s + n, 0),
    meanSignedBias: errors.reduce((s, n) => s + n, 0) / actual.length,
    medianAbsolutePercentageError: median(ape),
    within20Percent: ape.filter((n) => n <= 0.2).length / actual.length,
    within30Percent: ape.filter((n) => n <= 0.3).length / actual.length,
  };
};
const noisy = (ratio: number, random: () => number, width = 0.06) =>
  ratio * Math.exp((random() * 2 - 1) * width);
const scenarios: Scenario[] = [
  {
    name: 'A persistent underestimation',
    trainCount: 120,
    testCount: 60,
    defaults: [1],
    ratio: (_, r) => noisy(1.5, r),
  },
  {
    name: 'B persistent overestimation',
    trainCount: 120,
    testCount: 60,
    defaults: [1],
    ratio: (_, r) => noisy(0.65, r),
  },
  {
    name: 'C accurate estimates',
    trainCount: 120,
    testCount: 60,
    defaults: [1],
    ratio: (_, r) => noisy(1, r, 0.04),
  },
  {
    name: 'D extreme outliers',
    trainCount: 120,
    testCount: 60,
    defaults: [1],
    ratio: (i, r) =>
      i % 24 < 5 ? [0.05, 0.1, 5, 10, 100][i % 24] : noisy(1.1, r),
  },
  {
    name: 'E four warm-up samples',
    trainCount: 4,
    testCount: 60,
    defaults: [1],
    ratio: (_, r) => noisy(1.5, r),
  },
  {
    name: 'F alternating errors',
    trainCount: 120,
    testCount: 60,
    defaults: [1],
    ratio: (i) => (i % 2 ? 1 / 0.7 : 0.7),
  },
  {
    name: 'G five simultaneous factors',
    trainCount: 120,
    testCount: 60,
    defaults: [1, 1, 1.4, 1.2, 1.3],
    ratio: (_, r) => noisy(1.5, r),
  },
  {
    name: 'H opposite tenants',
    trainCount: 120,
    testCount: 60,
    defaults: [1],
    tenants: ['A', 'B'],
    ratio: (_, r, tenant) => noisy(tenant === 'A' ? 1.5 : 0.65, r),
  },
  {
    name: 'I bounds saturation',
    trainCount: 120,
    testCount: 60,
    defaults: [1],
    ratio: () => 10,
  },
  {
    name: 'J repeated feedback',
    trainCount: 120,
    testCount: 60,
    defaults: [1],
    repeats: 3,
    ratio: (_, r) => noisy(1.5, r),
  },
  {
    name: 'K held-out regime reversal',
    trainCount: 120,
    testCount: 60,
    defaults: [1],
    ratio: (i, r) => noisy(i < 120 ? 1.5 : 0.7, r),
  },
];

async function runScenario(scenario: Scenario): Promise<SimulationResult> {
  let seed = SEED;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const tenants = scenario.tenants ?? ['A'];
  const train: Observation[] = [];
  const test: Observation[] = [];
  for (let i = 0; i < scenario.trainCount + scenario.testCount; i++) {
    for (const tenant of tenants) {
      const baseHours = (4 + random() * 36) * product(scenario.defaults);
      const observation = {
        id: `${tenant}-${i}`,
        tenant,
        baseHours,
        actualHours: baseHours * scenario.ratio(i, random, tenant),
      };
      (i < scenario.trainCount ? train : test).push(observation);
    }
  }
  const state = new Map(
    tenants.map((tenant) => [
      tenant,
      scenario.defaults.map((value, i) =>
        Object.assign(new TenantCalibrationCoefficient(), {
          tenantUserId: tenant,
          key: FACTOR_KEYS[i],
          value,
          defaultValue: value,
          minValue: 0.5,
          maxValue: 2,
          eligibleSampleCount: 0,
          totalWeight: 0,
          ewmaLogError: 0,
          version: 1,
        })
      ),
    ])
  );
  const policy = new AdaptiveFeedbackCalibrationPolicy();
  const processed = new Set<string>(); // Simulation ledger only; real exactly-once behavior is tested in PostgreSQL.
  let maxCoefficientMovement = 0;
  let maxCombinedMultiplicativeCorrection = 1;
  let maxCumulativeMultiplicativeCorrection = 1;
  const correction = (rows: TenantCalibrationCoefficient[]) =>
    product(rows.map((row) => row.value / row.defaultValue));
  for (const observation of train) {
    for (
      let repetition = 0;
      repetition < (scenario.repeats ?? 1);
      repetition++
    ) {
      if (processed.has(observation.id)) continue;
      const rows = state.get(observation.tenant)!;
      // Predict using previous state before observing this actual. Closed-loop training
      // avoids repeatedly learning against obsolete, uncalibrated synthetic estimates.
      const estimatedHoursSnapshot = observation.baseHours * correction(rows);
      const result = await policy.evaluate({
        tenantUserId: observation.tenant,
        targetCoefficientKeys: rows.map((row) => row.key),
        coefficients: rows,
        feedback: Object.assign(new EstimateFeedback(), {
          id: observation.id,
          actualHours: observation.actualHours,
          estimatedHoursSnapshot,
        }),
      });
      let combinedLog = 0;
      for (const mutation of result.mutations) {
        const row = rows.find((row) => row.key === mutation.coefficientKey)!;
        const delta = Math.log(mutation.newValue / row.value);
        combinedLog += delta;
        maxCoefficientMovement = Math.max(
          maxCoefficientMovement,
          Math.abs(Math.expm1(delta))
        );
        Object.assign(row, {
          value: mutation.newValue,
          eligibleSampleCount: mutation.newEligibleSampleCount,
          totalWeight: mutation.newTotalWeight,
          ewmaLogError: mutation.newEwmaLogError,
          version: row.version + 1,
        });
      }
      maxCombinedMultiplicativeCorrection = Math.max(
        maxCombinedMultiplicativeCorrection,
        Math.exp(Math.abs(combinedLog))
      );
      maxCumulativeMultiplicativeCorrection = Math.max(
        maxCumulativeMultiplicativeCorrection,
        Math.exp(Math.abs(Math.log(correction(rows))))
      );
      processed.add(observation.id);
    }
  }
  const medianCorrection = new Map(
    tenants.map((tenant) => [
      tenant,
      Math.max(
        0.35,
        Math.min(
          3,
          median(
            train
              .filter((o) => o.tenant === tenant)
              .slice(-30)
              .map((o) => o.actualHours / o.baseHours)
          )
        )
      ),
    ])
  );
  // Chronological frozen hold-out: no test actual is ever passed to evaluate().
  const actual = test.map((o) => o.actualHours);
  return {
    scenario: scenario.name,
    trainObservations: train.length,
    testObservations: test.length,
    global: metrics(
      actual,
      test.map((o) => o.baseHours)
    ),
    calibrated: metrics(
      actual,
      test.map((o) => o.baseHours * correction(state.get(o.tenant)!))
    ),
    medianBaseline: metrics(
      actual,
      test.map((o) => o.baseHours * medianCorrection.get(o.tenant)!)
    ),
    maxCoefficientMovement,
    maxCombinedMultiplicativeCorrection,
    maxCumulativeMultiplicativeCorrection,
    states: tenants.map((tenant) => {
      const rows = state.get(tenant)!;
      return {
        tenant,
        values: rows.map((row) => row.value),
        sampleCounts: rows.map((row) => row.eligibleSampleCount),
        totalWeights: rows.map((row) => row.totalWeight),
        ewmaLogErrors: rows.map((row) => row.ewmaLogError),
      };
    }),
  };
}
export const runCalibrationSimulations = async () => ({
  algorithmVersion: ADAPTIVE_ALGORITHM_VERSION,
  seed: SEED,
  options: DEFAULT_ADAPTIVE_CALIBRATION_OPTIONS,
  assumptions:
    'Synthetic hours; LCG seed resets for each scenario. 120 chronological closed-loop training observations and 60 frozen test observations per tenant (E: 4 training). Baselines use uncalibrated global predictions and the clipped median actual/global-prediction ratio of the last 30 training observations. Bias = prediction - actual, in hours. WAPE and percentage metrics are fractions. Movement = largest abs(new/old - 1); combined correction = largest exp(abs(sum(log(new/old)))) per feedback. Cumulative correction is measured relative to defaults. No real-world accuracy claim.',
  results: await Promise.all(scenarios.map(runScenario)),
});
if (require.main === module)
  runCalibrationSimulations()
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
