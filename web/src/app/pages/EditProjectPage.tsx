import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/authApiService';
import { useNavigate, useParams } from 'react-router-dom';
import { ProjectForm } from '../components/ProjectForm';
import { Loader, Alert } from '@mantine/core';
import { notifications } from '@mantine/notifications';

interface Project {
  id: string;
  name: string;
  description: string;
}

interface UpdateProjectDto {
  name: string;
  description: string;
}

const fetchProject = async (id: string): Promise<Project> => {
  const { data } = await api.get(`/projects/${id}`);
  return data;
};

const updateProject = async ({
  id,
  ...data
}: UpdateProjectDto & { id: string }) => {
  const { data: response } = await api.patch(`/projects/${id}`, data);
  return response;
};

export function EditProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: project,
    isLoading,
    isError,
    error,
  } = useQuery<Project, Error>({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id!),
    enabled: !!id,
  });

  const mutation = useMutation<any, Error, UpdateProjectDto & { id: string }>({
    mutationFn: updateProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      notifications.show({
        title: 'Project Updated',
        message: 'The project has been successfully updated.',
        color: 'green',
      });
      navigate('/');
    },
    onError: (error) => {
      notifications.show({
        title: 'Update Failed',
        message: `An error occurred: ${error.message}`,
        color: 'red',
      });
    },
  });

  const handleSubmit = (values: UpdateProjectDto) => {
    if (id) {
      mutation.mutate({ ...values, id });
    }
  };

  if (isLoading) return <Loader />;
  if (isError) return <Alert color="red">{error.message}</Alert>;

  return (
    <ProjectForm
      onSubmit={handleSubmit}
      isLoading={mutation.isPending}
      initialValues={{
        name: project?.name || '',
        description: project?.description || '',
      }}
    />
  );
}
