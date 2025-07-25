import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactNode } from 'react';

import * as taskApi from '../api/tasks.api';
import { CreateTaskDto, UpdateTaskDto } from '../../../types';
import {
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
} from './tasks.hooks';

// Mock the API module
vi.mock('../api/tasks.api', () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

// Create a wrapper component to provide the QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries for tests
      },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
};

describe('Task Hooks', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('useCreateTaskMutation should call createTask and return success', async () => {
    const newTask: CreateTaskDto = { title: 'New Test Task', projectId: '1' };
    const mockSuccessResponse = {
      id: 'task-123',
      ...newTask,
      status: 'TO_DO',
      tags: [],
      estimates: [],
      children: [],
    };
    const mockOnSuccess = vi.fn();

    // Setup the mock API function
    (taskApi.createTask as vi.Mock).mockResolvedValue(mockSuccessResponse);

    // Render the hook with the wrapper
    const { result } = renderHook(() => useCreateTaskMutation(mockOnSuccess), {
      wrapper: createWrapper(),
    });

    // Mutate
    result.current.mutate(newTask);

    // Wait for the mutation to complete and assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(taskApi.createTask).toHaveBeenCalledWith(newTask);
    expect(result.current.data).toEqual(mockSuccessResponse);
    expect(mockOnSuccess).toHaveBeenCalled();
  });

  it('useUpdateTaskMutation should call updateTask and return success', async () => {
    const taskUpdate: UpdateTaskDto = {
      id: 'task-1',
      title: 'Updated Task',
    };
    const mockOnSuccess = vi.fn();
    (taskApi.updateTask as vi.Mock).mockResolvedValue(taskUpdate);

    const { result } = renderHook(
      () => useUpdateTaskMutation('project-1', mockOnSuccess),
      {
        wrapper: createWrapper(),
      }
    );

    result.current.mutate(taskUpdate);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(taskApi.updateTask).toHaveBeenCalledWith(taskUpdate);
    expect(result.current.data).toEqual(taskUpdate);
    expect(mockOnSuccess).toHaveBeenCalled();
  });

  it('useDeleteTaskMutation should call deleteTask and return success', async () => {
    const taskId = 'task-to-delete';
    const mockOnSuccess = vi.fn();
    (taskApi.deleteTask as vi.Mock).mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useDeleteTaskMutation('project-1', mockOnSuccess),
      {
        wrapper: createWrapper(),
      }
    );

    result.current.mutate(taskId);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(taskApi.deleteTask).toHaveBeenCalledWith(taskId);
    expect(mockOnSuccess).toHaveBeenCalled();
  });
});
