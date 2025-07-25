import { TaskTree } from './TaskTree';
import { Text } from '@mantine/core';
import { Task } from '../../../types';

interface TaskListProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onFeedback: (task: Task) => void;
  onManualEstimate: (task: Task) => void;
}

export function TaskList({ tasks, ...rest }: TaskListProps) {
  if (!tasks || tasks.length === 0) {
    return <Text c="dimmed">No tasks found for the current filters.</Text>;
  }

  return <TaskTree tasks={tasks} {...rest} />;
}
