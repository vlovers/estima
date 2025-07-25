import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { Project } from '../../../types';

import {
  updateProject,
  fetchProjects,
  fetchProject,
} from '../api/projects.api';

export const useFetchProjects = () => {
  return useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });
};

export const useFetchProject = (projectId: string | undefined) => {
  return useQuery<Project, Error>({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId!),
    enabled: !!projectId,
  });
};

export const useUpdateProjectMutation = (onSuccessCallback?: () => void) => {
  const queryClient = useQueryClient();

  return useMutation<Project, Error, Partial<Project> & { id: string }>({
    mutationFn: updateProject,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', data.id] });
      notifications.show({
        title: 'Project Updated',
        message: 'Your project settings have been saved.',
        color: 'green',
      });
      onSuccessCallback?.();
    },
    onError: (error) => {
      notifications.show({
        title: 'Update Failed',
        message: error.message,
        color: 'red',
      });
    },
  });
};
