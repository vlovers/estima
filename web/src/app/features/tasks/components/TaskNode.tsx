import { Collapse } from '@mantine/core';
import { TaskCard } from './TaskCard';
import { TaskTree } from './TaskTree';
import { Task } from '../../../types';
import { useState } from 'react';

interface TaskNodeProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onFeedback: (task: Task) => void;
  onManualEstimate: (task: Task) => void;
}

export function TaskNode({
  task,
  onEdit,
  onDelete,
  onFeedback,
  onManualEstimate,
}: TaskNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div>
      <TaskCard
        task={task}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggle={handleToggle}
        isExpanded={isExpanded}
        onFeedback={onFeedback}
        onManualEstimate={onManualEstimate}
      />
      {task.children && task.children.length > 0 && (
        <Collapse in={isExpanded}>
          <div
            style={{
              marginTop: '1rem',
              marginLeft: '2rem',
              borderLeft: '1px solid #e0e0e0',
              paddingLeft: '1rem',
            }}
          >
            <TaskTree
              tasks={task.children}
              onEdit={onEdit}
              onDelete={onDelete}
              onFeedback={onFeedback}
              onManualEstimate={onManualEstimate}
            />
          </div>
        </Collapse>
      )}
    </div>
  );
}
