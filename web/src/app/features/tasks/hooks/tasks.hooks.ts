import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { UpdateTaskDto, Task } from '../../../types';
import { AxiosError } from 'axios';

import {
  createEstimateFeedback,
  createEstimate,
  updateTask,
  createTask,
  deleteTask,
} from '../api/tasks.api';

export const useCreateTaskMutation = (onSuccessCallback: () => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTask,
    onSuccess: (data: Task) => {
      queryClient.invalidateQueries({ queryKey: ['project', data.projectId] });
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
  projectId: string | undefined,
  onSuccessCallback?: () => void
) => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
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
  projectId: string,
  onSuccessCallback?: () => void
) => {
  const queryClient = useQueryClient();
  return useMutation<Task, Error, UpdateTaskDto>({
    mutationFn: updateTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
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

export const useCreateFeedbackMutation = (projectId: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { taskId: string; actualHours: number }>({
    mutationFn: createEstimateFeedback,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
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
  projectId: string | undefined
) => {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { taskId: string; finalEstimate: number; source: 'manual' }
  >({
    mutationFn: createEstimate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
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
