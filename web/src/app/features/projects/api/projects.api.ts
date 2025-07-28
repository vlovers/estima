import { api } from '../../../services/authApiService';
import { Project } from '../../../types';

export const fetchProjects = async (): Promise<Project[]> => {
  const response = await api.get('/projects');
  return response.data;
};

export const fetchProject = async (
  projectId: string,
  sortBy?: string,
  sortOrder?: string
): Promise<Project> => {
  const params = new URLSearchParams();
  if (sortBy) params.append('sortBy', sortBy);
  if (sortOrder) params.append('sortOrder', sortOrder);
  params.append('tree', 'true');

  const response = await api.get(`/projects/${projectId}`, { params });
  return response.data;
};

export const updateProject = async ({
  id,
  ...projectData
}: Partial<Project> & { id: string }): Promise<Project> => {
  const { data } = await api.patch(`/projects/${id}`, projectData);
  return data;
};
