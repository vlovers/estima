import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Task } from '../../../types';
import { TaskForm } from './TaskForm';

afterEach(cleanup);
const task: Task = {
  id: 'task',
  title: 'Existing task',
  description: 'Keep the project context.',
  technology: 'React',
  experienceLevel: 'SENIOR',
  tags: ['scope'],
  status: 'estimated',
  estimates: [],
  feedbacks: [],
  acceptanceCriteria: ['Keyboard accessible'],
  nfrs: [
    {
      category: 'performance',
      requirement: 'Fast search',
      target: 'p95 under 300ms',
    },
  ],
  integrations: [
    { name: 'Identity service', interaction: 'read', auth: 'oauth' },
  ],
  testing: { unit: true, security: true },
  documentation: { apiDocs: true },
  breakdown: true,
};
function show(props: Partial<Parameters<typeof TaskForm>[0]> = {}) {
  const onSubmit = vi.fn();
  const view = render(
    <MantineProvider env="test">
      <TaskForm onSubmit={onSubmit} isPending={false} error={null} {...props} />
    </MantineProvider>
  );
  return { ...view, onSubmit };
}
describe('shared task editor', () => {
  it('progressively discloses optional scope instead of overwhelming the basic form', async () => {
    show();
    expect(screen.getByLabelText(/Task title/)).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: 'Acceptance criteria' })
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Scope & assumptions' })
    );
    expect(
      await screen.findByRole('textbox', { name: 'Acceptance criteria' })
    ).toBeVisible();
  });
  it('preserves structured fields while saving an edit without opening optional sections', () => {
    const { container, onSubmit } = show({ task });
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: task.title,
        acceptanceCriteria: task.acceptanceCriteria,
        nfrs: task.nfrs,
        integrations: task.integrations,
        testing: task.testing,
        documentation: task.documentation,
        breakdown: true,
      })
    );
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('id');
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('projectId');
  });
  it('validates missing essential scope and prevents repeated submission while saving', () => {
    const { container, onSubmit } = show();
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Add a title, description and technology'
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('announces an API error without discarding entered context', () => {
    show({ task, error: new Error('Service unavailable') });
    expect(screen.getByRole('alert')).toHaveTextContent('Service unavailable');
    expect(screen.getByLabelText(/Task title/)).toHaveValue('Existing task');
  });
  it('does not submit or enable a second save while a request is pending', () => {
    const { container, onSubmit } = show({ task, isPending: true });
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });
});
