import { api } from '../../../services/authApiService';
import { Project } from '../../../types';

export const fetchProjects = async (): Promise<Project[]> => {
  const { data } = await api.get('/projects');
  return data;
};

export const fetchProject = async (id: string): Promise<Project> => {
  const { data } = await api.get(`/projects/${id}?tree=true`);
  return data;
};

export const updateProject = async ({
  id,
  ...projectData
}: Partial<Project> & { id: string }): Promise<Project> => {
  const { data } = await api.patch(`/projects/${id}`, projectData);
  return data;
};
