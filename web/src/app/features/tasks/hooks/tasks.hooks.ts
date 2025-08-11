import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UpdateTaskDto, Task, Clarification } from '../../../types';
import { notifications } from '@mantine/notifications';
import { AxiosError } from 'axios';

import {
  createEstimateFeedback,
  updateTask,
  createTask,
  deleteTask,
  clarifyTask,
} from '../api/tasks.api';

export const useCreateTaskMutation = (onSuccessCallback: () => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTask,
    onSuccess: (_data: Task | Task[]) => {
      void _data;
      queryClient.invalidateQueries({ queryKey: ['project'] });

      notifications.show({
        title: 'Task Created',
        message: 'The new task has been successfully created.',
        color: 'green',
      });
      onSuccessCallback();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof AxiosError
          ? error.response?.data?.message
          : 'Failed to create task.';
      notifications.show({
        title: 'Creation Failed',
        message,
        color: 'red',
      });
    },
  });
};

export const useDeleteTaskMutation = (
  _projectId: string | undefined,
  onSuccessCallback?: () => void
) => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', _projectId] });
      notifications.show({
        title: 'Task Deleted',
        message: 'The task has been successfully deleted.',
        color: 'green',
      });
      onSuccessCallback?.();
    },
    onError: (error) => {
      notifications.show({
        title: 'Deletion Failed',
        message: error.message,
        color: 'red',
      });
    },
  });
};

export const useUpdateTaskMutation = (
  _projectId: string,
  onSuccessCallback?: () => void
) => {
  const queryClient = useQueryClient();
  return useMutation<Task, Error, UpdateTaskDto>({
    mutationFn: updateTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', _projectId] });
      notifications.show({
        title: 'Task Updated',
        message: 'The task has been successfully updated.',
        color: 'green',
      });
      onSuccessCallback?.();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof AxiosError
          ? error.response?.data?.message
          : 'Failed to update task.';
      notifications.show({
        title: 'Update Failed',
        message,
        color: 'red',
      });
    },
  });
};

export const useCreateFeedbackMutation = (_projectId: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { taskId: string; actualHours: number }>({
    mutationFn: createEstimateFeedback,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', _projectId] });
      notifications.show({
        title: 'Feedback Submitted',
        message: 'Thank you! Your feedback will improve future estimates.',
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Feedback Submission Failed',
        message: error.message,
        color: 'red',
      });
    },
  });
};

export const useCreateManualEstimateMutation = (
  _projectId: string | undefined
) => {
  const queryClient = useQueryClient();
  return useMutation<Task, Error, { taskId: string; hours: number }>({
    mutationFn: (data) =>
      updateTask({ id: data.taskId, manualEstimate: data.hours }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', _projectId] });
      notifications.show({
        title: 'Success',
        message: 'Manual estimate saved successfully.',
        color: 'green',
      });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof AxiosError
          ? error.response?.data?.message
          : 'Failed to save manual estimate.';
      notifications.show({
        title: 'Error',
        message,
        color: 'red',
      });
    },
  });
};

export const useClarifyTaskMutation = (onSuccessCallback?: () => void) => {
  const queryClient = useQueryClient();
  return useMutation<
    Task,
    Error,
    { id: string; clarifications: Clarification[] }
  >({
    mutationFn: clarifyTask,
    onSuccess: (updatedTask) => {
      queryClient.invalidateQueries({ queryKey: ['project'] });

      if (updatedTask.status === 'estimated') {
        notifications.show({
          title: 'Task Clarified',
          message: 'The task has been updated with a new AI estimate.',
          color: 'green',
        });
        onSuccessCallback?.(); // This will close the modal
      } else {
        // AI has more questions, do not close the modal
        notifications.show({
          title: 'More Information Needed',
          message: 'The AI has additional questions based on your answers.',
          color: 'blue',
        });
      }
    },
    onError: (error: unknown) => {
      const message =
        error instanceof AxiosError
          ? error.response?.data?.message
          : 'Failed to clarify task.';
      notifications.show({
        title: 'Clarification Failed',
        message,
        color: 'red',
      });
    },
  });
};
