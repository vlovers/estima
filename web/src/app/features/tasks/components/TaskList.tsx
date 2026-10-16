import { Collapse, Stack } from '@mantine/core';
import { TaskCard } from './TaskCard';
import { WorkspaceState } from '../../../components/WorkspaceState';
import { Task } from '../../../types';

interface TaskListProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onFeedback: (task: Task) => void;
  onManualEstimate: (task: Task) => void;
  onClarify?: (task: Task) => void;
  expandedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
}

export function TaskList({
  tasks,
  onEdit,
  onDelete,
  onManualEstimate,
  onClarify,
  onFeedback,
  expandedTasks,
  onToggleTask,
}: TaskListProps) {
  if (!tasks || tasks.length === 0) {
    return (
      <WorkspaceState
        title="No matching tasks"
        description="Try a different search or clear the filters to see more of the project."
      />
    );
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
              onClarify={onClarify}
              isExpanded={isExpanded}
              onToggle={() => onToggleTask(task.id)}
            />
            {task.subtasks && task.subtasks.length > 0 && (
              <Collapse in={isExpanded}>
                <div className="subtask-list">
                  <TaskList
                    tasks={task.subtasks}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onManualEstimate={onManualEstimate}
                    onFeedback={onFeedback}
                    onClarify={onClarify}
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
