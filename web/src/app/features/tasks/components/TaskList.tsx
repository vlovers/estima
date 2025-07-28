import { Collapse, Stack } from '@mantine/core';
import { TaskCard } from './TaskCard';
import { Text } from '@mantine/core';
import { Task } from '../../../types';

interface TaskListProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onFeedback: (task: Task) => void;
  onManualEstimate: (task: Task) => void;
  expandedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
}

export function TaskList({
  tasks,
  onEdit,
  onDelete,
  onManualEstimate,
  onFeedback,
  expandedTasks,
  onToggleTask,
}: TaskListProps) {
  if (!tasks || tasks.length === 0) {
    return <Text c="dimmed">No tasks found for the current filters.</Text>;
  }

  return (
    <Stack>
      {tasks.map((task) => {
        const isExpanded = expandedTasks.has(task.id);
        return (
          <div key={task.id}>
            <TaskCard
              task={task}
              onEdit={onEdit}
              onDelete={onDelete}
              onManualEstimate={onManualEstimate}
              onFeedback={onFeedback}
              isExpanded={isExpanded}
              onToggle={() => onToggleTask(task.id)}
            />
            {task.subtasks && task.subtasks.length > 0 && (
              <Collapse in={isExpanded}>
                <div style={{ marginLeft: '2rem', marginTop: '1rem' }}>
                  <TaskList
                    tasks={task.subtasks}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onManualEstimate={onManualEstimate}
                    onFeedback={onFeedback}
                    expandedTasks={expandedTasks}
                    onToggleTask={onToggleTask}
                  />
                </div>
              </Collapse>
            )}
          </div>
        );
      })}
    </Stack>
  );
}
