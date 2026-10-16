import { useUpdateTaskMutation } from '../hooks/tasks.hooks';
import { Task } from '../../../types';
import { TaskForm } from './TaskForm';

interface EditTaskFormProps {
  task: Task;
  projectId: string;
  onSuccess: () => void;
  onCancel?: () => void;
}
export function EditTaskForm({
  task,
  projectId,
  onSuccess,
  onCancel,
}: EditTaskFormProps) {
  const mutation = useUpdateTaskMutation(projectId);
  return (
    <TaskForm
      key={task.id}
      task={task}
      onSubmit={(values) =>
        mutation.mutate({ ...values, id: task.id }, { onSuccess })
      }
      isPending={mutation.isPending}
      error={mutation.error}
      onCancel={onCancel}
    />
  );
}
