import { describe, expect, it } from 'vitest';
import { Estimate, Task } from '../types';
import {
  estimateDetails,
  formatHours,
  manualHours,
  projectEffort,
  selectedEstimate,
} from './estimation';

const estimate = (
  source: Estimate['source'],
  hours: number,
  fields: Partial<Estimate> = {}
): Estimate => ({
  id: source,
  source,
  finalEstimate: hours,
  confidence: null,
  explanation: null,
  ...fields,
});
const task = (estimates: Estimate[], fields: Partial<Task> = {}): Task => ({
  id: 'task',
  title: 'A task',
  description: 'Task context',
  technology: 'React',
  experienceLevel: 'MIDDLE',
  tags: [],
  status: 'estimated',
  estimates,
  feedbacks: [],
  ...fields,
});

describe('faithful estimate presentation', () => {
  it('chooses one final record and never sums alternate sources or subtasks twice', () => {
    const parent = task(
      [
        estimate('ai', 12),
        estimate('ai_subtask_sum', 16),
        estimate('final', 20),
      ],
      { subtasks: [task([estimate('ai', 16)])] }
    );
    expect(selectedEstimate(parent)?.finalEstimate).toBe(20);
    expect(projectEffort([parent, task([estimate('final', 8)])])).toEqual({
      hours: 28,
      estimatedTasks: 2,
    });
  });
  it('does not turn absent or nonfinite data into a zero estimate', () => {
    expect(projectEffort([task([])])).toEqual({
      hours: undefined,
      estimatedTasks: 0,
    });
    expect(selectedEstimate(task([estimate('final', NaN)]))).toBeUndefined();
    expect(formatHours(null)).toBe('—');
    expect(formatHours(Infinity)).toBe('—');
    expect(formatHours(0)).toBe('0');
  });
  it('keeps a manual reference distinct from the displayed AI result', () => {
    const data = task([
      estimate('final', 20),
      estimate('manual', 14, { manualEstimate: 14 }),
    ]);
    expect(selectedEstimate(data)?.finalEstimate).toBe(20);
    expect(manualHours(data)).toBe(14);
    expect(selectedEstimate(task([estimate('manual', 14)]))?.source).toBe(
      'manual'
    );
  });
  it('uses actual structured API values or legacy explanation data, never invented ranges', () => {
    expect(estimateDetails(estimate('final', 20))).toMatchObject({
      p10: undefined,
      p50: undefined,
      p90: undefined,
      divergencePct: undefined,
    });
    const data = estimate('final', 20, {
      p10: 12,
      p50: 20,
      p90: 32,
      explanation:
        'Range: p10=10h, p50=18h, p90=30h\nTop-down: 25h\nBottom-up: 22h\nLogs:\nScope reviewed',
    });
    expect(estimateDetails(data)).toMatchObject({
      p10: 12,
      p50: 20,
      p90: 32,
      topDown: 25,
      bottomUp: 22,
      divergencePct: undefined,
      logs: 'Scope reviewed',
    });
  });
});
