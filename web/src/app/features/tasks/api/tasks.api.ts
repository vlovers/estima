import { CreateTaskDto, Task, UpdateTaskDto } from '../../../types';
import { api } from '../../../services/authApiService';

export const createTask = async (taskData: CreateTaskDto): Promise<Task> => {
  const { data } = await api.post('/tasks', taskData);
  return data;
};

export const updateTask = async ({
  id,
  ...taskData
}: { id: string } & UpdateTaskDto): Promise<Task> => {
  const { data } = await api.patch(`/tasks/${id}`, taskData);
  return data;
};

export const deleteTask = async (id: string): Promise<void> => {
  await api.delete(`/tasks/${id}`);
};

export const createEstimateFeedback = async (feedbackData: {
  taskId: string;
  actualHours: number;
}): Promise<void> => {
  await api.post('/estimate-feedback', feedbackData);
};

export const createEstimate = async (estimateData: {
  taskId: string;
  finalEstimate: number;
  source: 'manual';
}): Promise<void> => {
  await api.post('/estimate', estimateData);
};
