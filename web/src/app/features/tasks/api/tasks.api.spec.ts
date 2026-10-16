import type { Mock } from 'vitest';
import { createTask, updateTask, deleteTask } from './tasks.api';
import { CreateTaskDto, UpdateTaskDto } from '../../../types';
import { api } from '../../../services/authApiService';
import { describe, it, expect, vi } from 'vitest';

// Mock the api service
vi.mock('../../../services/authApiService', () => ({
  api: {
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('Tasks API', () => {
  it('should call api.post with correct data when createTask is called', async () => {
    const taskData: CreateTaskDto = {
      title: 'Test Task',
      description: 'Test Description',
      projectId: 'proj-1',
      technology: 'React',
      experienceLevel: 'JUNIOR',
      tags: ['test'],
      useAiEstimate: true,
      breakdown: false,
    };
    const mockResponse = { data: { ...taskData, id: 'task-1' } };
    (api.post as Mock).mockResolvedValue(mockResponse);

    await createTask(taskData);

    expect(api.post).toHaveBeenCalledWith('/tasks', taskData);
  });

  it('should call api.patch with correct data when updateTask is called', async () => {
    const taskId = 'task-1';
    const taskData: UpdateTaskDto = {
      title: 'Updated Title',
    };
    const mockResponse = { data: { ...taskData, id: taskId } };
    (api.patch as Mock).mockResolvedValue(mockResponse);

    await updateTask({ id: taskId, ...taskData });

    expect(api.patch).toHaveBeenCalledWith(`/tasks/${taskId}`, taskData);
  });

  it('should call api.delete with correct id when deleteTask is called', async () => {
    const taskId = 'task-1';
    (api.delete as Mock).mockResolvedValue({});

    await deleteTask(taskId);

    expect(api.delete).toHaveBeenCalledWith(`/tasks/${taskId}`);
  });
});
