import { Estimate, Task } from '../types';

export function isHours(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
export function formatHours(value: unknown): string {
  return isHours(value)
    ? new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)
    : '—';
}
export function selectedEstimate(task: Task): Estimate | undefined {
  for (const source of ['final', 'ai_subtask_sum', 'ai', 'manual']) {
    const estimate = task.estimates?.find(
      (item) => item.source === source && isHours(item.finalEstimate)
    );
    if (estimate) return estimate;
  }
  return undefined;
}
export function manualHours(task: Task): number | undefined {
  const manual = task.estimates?.find(
    (estimate) => estimate.source === 'manual'
  );
  const values = [
    manual?.manualEstimate,
    manual?.finalEstimate,
    selectedEstimate(task)?.manualEstimate,
    task.manualEstimate,
  ];
  return values.find(isHours);
}
export function projectEffort(tasks: Task[] = []) {
  // A root's final/subtask-sum record already includes its children. Never sum sources or descendants again.
  const estimates = tasks
    .map(selectedEstimate)
    .filter((item): item is Estimate => !!item);
  return {
    estimatedTasks: estimates.length,
    hours: estimates.length
      ? estimates.reduce((sum, item) => sum + item.finalEstimate, 0)
      : undefined,
  };
}
export function estimateDetails(estimate?: Estimate) {
  const explanation = estimate?.explanation ?? '';
  const parsed = (pattern: RegExp) => {
    const match = explanation.match(pattern);
    return match ? Number(match[1]) : undefined;
  };
  const from = (value: unknown, pattern: RegExp) =>
    isHours(value) ? value : parsed(pattern);
  return {
    p10: from(estimate?.p10, /p10=([\d.]+)h/i),
    p50: from(estimate?.p50, /p50=([\d.]+)h/i),
    p90: from(estimate?.p90, /p90=([\d.]+)h/i),
    topDown: from(estimate?.topDown, /Top-down:\s*([\d.]+)h/i),
    bottomUp: from(estimate?.bottomUp, /Bottom-up:\s*([\d.]+)h/i),
    divergencePct: from(
      estimate?.divergencePct,
      /Divergence(?:\s*\(symmetric\))?\s*:?\s*([\d.]+)%/i
    ),
    logs:
      estimate?.logs ||
      (explanation.includes('Logs:')
        ? explanation.split('Logs:').slice(1).join('Logs:').trim()
        : undefined),
  };
}
