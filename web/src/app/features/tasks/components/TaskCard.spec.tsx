import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Task } from '../../../types';
import { TaskCard } from './TaskCard';

afterEach(cleanup);
const base: Task = {
  id: 'task',
  title: 'Scope a feature',
  description: 'Build a useful thing.',
  technology: 'React',
  experienceLevel: 'MIDDLE',
  tags: [],
  estimates: [],
  feedbacks: [],
  status: 'estimated',
};
function show(task: Task) {
  const onManualEstimate = vi.fn();
  render(
    <MantineProvider env="test">
      <TaskCard
        task={task}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onManualEstimate={onManualEstimate}
      />
    </MantineProvider>
  );
  return { onManualEstimate };
}
describe('estimate result presentation', () => {
  it('does not invent hours, confidence or uncertainty when the API has not returned them', () => {
    show(base);
    expect(
      screen.getByText('No estimate has been returned for this task.')
    ).toBeVisible();
    expect(screen.queryByText(/Reported confidence|P10|P90/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'View estimate' })).toBeNull();
  });
  it('keeps a manual estimate action available even when AI data is absent', () => {
    const { onManualEstimate } = show(base);
    fireEvent.click(screen.getByRole('button', { name: 'Manual estimate' }));
    expect(onManualEstimate).toHaveBeenCalledWith(base);
  });
  it('renders a genuine zero confidence and uses structured range values', () => {
    show({
      ...base,
      estimates: [
        {
          id: 'final',
          source: 'final',
          finalEstimate: 8,
          confidence: 0,
          explanation: null,
          p10: 4,
          p50: 8,
          p90: 16,
        },
      ],
    });
    expect(screen.getByText('Reported confidence 0%')).toBeVisible();
    expect(screen.getByText('4–16 h')).toBeVisible();
  });
});
