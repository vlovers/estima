import { useCreateTaskMutation } from '../hooks/tasks.hooks';
import { TaskForm } from './TaskForm';

interface CreateTaskFormProps {
  projectId: string;
  onSuccess: () => void;
  onCancel?: () => void;
}
export function CreateTaskForm({
  projectId,
  onSuccess,
  onCancel,
}: CreateTaskFormProps) {
  const mutation = useCreateTaskMutation(onSuccess);
  return (
    <TaskForm
      onSubmit={(values) => mutation.mutate({ ...values, projectId })}
      isPending={mutation.isPending}
      error={mutation.error}
      onCancel={onCancel}
    />
  );
}
