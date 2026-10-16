import type { Mock } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as projectsApi from '../api/projects.api';
import { ReactNode } from 'react';

import {
  useUpdateProjectMutation,
  useFetchProjects,
  useFetchProject,
} from './projects.hooks';

// Mock the API module
vi.mock('../api/projects.api', () => ({
  fetchProjects: vi.fn(),
  fetchProject: vi.fn(),
  updateProject: vi.fn(),
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

describe('Project Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useFetchProjects should fetch projects and return data', async () => {
    const mockProjects = [
      { id: '1', name: 'Project 1' },
      { id: '2', name: 'Project 2' },
    ];
    (projectsApi.fetchProjects as Mock).mockResolvedValue(mockProjects);

    const { result } = renderHook(() => useFetchProjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(projectsApi.fetchProjects).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockProjects);
  });

  it('useFetchProject should fetch a single project and return data', async () => {
    const mockProject = { id: '1', name: 'Project 1' };
    (projectsApi.fetchProject as Mock).mockResolvedValue(mockProject);

    const { result } = renderHook(() => useFetchProject('1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(projectsApi.fetchProject).toHaveBeenCalledWith(
      '1',
      undefined,
      undefined
    );
    expect(result.current.data).toEqual(mockProject);
  });

  it('useUpdateProjectMutation should call updateProject and return success', async () => {
    const mockProjectUpdate = { id: '1', name: 'Updated Project' };
    const mockOnSuccess = vi.fn();
    (projectsApi.updateProject as Mock).mockResolvedValue(mockProjectUpdate);

    const { result } = renderHook(
      () => useUpdateProjectMutation(mockOnSuccess),
      {
        wrapper: createWrapper(),
      }
    );

    result.current.mutate(mockProjectUpdate);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(projectsApi.updateProject).toHaveBeenCalledWith(mockProjectUpdate);
    expect(mockOnSuccess).toHaveBeenCalled();
  });
});
