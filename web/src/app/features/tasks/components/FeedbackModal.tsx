import { Modal } from '@mantine/core';
import { Task } from '../../../types';
import { FeedbackForm } from './FeedbackForm';
import { useCreateFeedbackMutation } from '../hooks/tasks.hooks';
import { CreateFeedbackDto } from '../../../types';

interface FeedbackModalProps {
  task: Task;
  opened: boolean;
  onClose: () => void;
}

export function FeedbackModal({ task, opened, onClose }: FeedbackModalProps) {
  const mutation = useCreateFeedbackMutation(task.projectId);

  const handleSubmit = (data: Omit<CreateFeedbackDto, 'taskId'>) => {
    mutation.mutate({ ...data, taskId: task.id }, {
      onSuccess: () => {
        onClose();
      }
    });
  };

  return (
    <Modal opened={opened} onClose={onClose} title={`Feedback for "${task.title}"`}>
      <FeedbackForm
        taskId={task.id}
        onSubmit={handleSubmit}
        isLoading={mutation.isPending}
      />
    </Modal>
  );
}
