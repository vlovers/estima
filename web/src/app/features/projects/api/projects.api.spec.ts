import type { Mock } from 'vitest';
import { fetchProjects, fetchProject, updateProject } from './projects.api';
import { api } from '../../../services/authApiService';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Project } from '../../../types';

// Mock the api service
vi.mock('../../../services/authApiService', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('Projects API', () => {
  beforeEach(() => vi.clearAllMocks());
  it('should call api.get without params when fetchProjects is called', async () => {
    const mockResponse = { data: [] };
    (api.get as Mock).mockResolvedValue(mockResponse);

    await fetchProjects();

    expect(api.get).toHaveBeenCalledWith('/projects');
  });

  it('should call api.get with correct id when fetchProject is called', async () => {
    const projectId = 'proj-1';
    const mockResponse = { data: { id: projectId, name: 'Test Project' } };
    (api.get as Mock).mockResolvedValue(mockResponse);

    await fetchProject(projectId);

    expect(api.get).toHaveBeenCalledWith(`/projects/${projectId}`, {
      params: new URLSearchParams('tree=true'),
    });
  });

  it('should call api.patch with correct data when updateProject is called', async () => {
    const projectId = 'proj-1';
    const projectData: Partial<Project> = {
      name: 'Updated Name',
    };
    const mockResponse = { data: { ...projectData, id: projectId } };
    (api.patch as Mock).mockResolvedValue(mockResponse);

    await updateProject({ id: projectId, ...projectData });

    expect(api.patch).toHaveBeenCalledWith(
      `/projects/${projectId}`,
      projectData
    );
  });
});
