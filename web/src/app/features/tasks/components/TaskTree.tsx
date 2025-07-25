import { TaskNode } from './TaskNode';
import { Stack } from '@mantine/core';
import { Task } from '../../../types';

interface TaskTreeProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onFeedback: (task: Task) => void;
  onManualEstimate: (task: Task) => void;
}

export function TaskTree({ tasks, ...rest }: TaskTreeProps) {
  if (!tasks || tasks.length === 0) {
    return null;
  }

  return (
    <Stack gap="md">
      {tasks.map((task) => (
        <TaskNode key={task.id} task={task} {...rest} />
      ))}
    </Stack>
  );
}
