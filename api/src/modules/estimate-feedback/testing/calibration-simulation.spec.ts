import { runCalibrationSimulations } from './calibration-simulation';

describe('Deterministic offline calibration backtest', () => {
  it('improves persistent matching bias, preserves stability and exposes adverse outcomes', async () => {
    const report = await runCalibrationSimulations();
    expect(await runCalibrationSimulations()).toEqual(report);
    const result = (prefix: string) =>
      report.results.find((row) => row.scenario.startsWith(prefix))!;
    for (const prefix of ['A ', 'B ', 'G ', 'H ', 'J ']) {
      expect(result(prefix).calibrated.mae).toBeLessThan(
        result(prefix).global.mae * 0.2
      );
      expect(result(prefix).calibrated.wape).toBeLessThan(
        result(prefix).global.wape
      );
    }
    expect(result('C ').calibrated.wape).toBeLessThan(0.03);
    expect(
      result('D ').maxCombinedMultiplicativeCorrection
    ).toBeLessThanOrEqual(1.05 + 1e-14);
    expect(result('E ').states[0].values).toEqual([1]);
    expect(result('E ').states[0].sampleCounts).toEqual([4]);
    expect(result('E ').states[0].totalWeights).toEqual([4]);
    expect(result('E ').states[0].ewmaLogErrors[0]).toBeGreaterThan(0);
    expect(result('F ').maxCumulativeMultiplicativeCorrection).toBeLessThan(
      1.05
    );
    expect(result('G ').states[0].totalWeights[0]).toBeCloseTo(24, 12);
    expect(result('H ').states[0].values[0]).toBeGreaterThan(1);
    expect(result('H ').states[1].values[0]).toBeLessThan(1);
    expect(result('I ').states[0].values).toEqual([2]);
    expect(result('J ').states).toEqual(result('A ').states);
    // Deliberately adverse hold-out; prevent negative results being silently omitted.
    expect(result('K ').calibrated.mae).toBeGreaterThan(
      result('K ').global.mae
    );
    expect(result('I ').calibrated.mae).toBeGreaterThan(
      result('I ').medianBaseline.mae
    );
    for (const row of report.results) {
      expect(row.maxCombinedMultiplicativeCorrection).toBeLessThanOrEqual(
        1.05 + 1e-14
      );
      expect(row.maxCoefficientMovement).toBeLessThanOrEqual(0.05 + 1e-14);
      for (const state of row.states) {
        expect(state.values.every((v) => v >= 0.5 && v <= 2)).toBe(true);
        expect(state.ewmaLogErrors.every(Number.isFinite)).toBe(true);
        expect(
          state.sampleCounts.every(
            (n) => n === row.trainObservations / row.states.length
          )
        ).toBe(true);
      }
    }
  });
});
