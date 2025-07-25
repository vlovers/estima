import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ProjectForm } from '../components/ProjectForm';
import { notifications } from '@mantine/notifications';
import { api } from '../services/authApiService';

interface CreateProjectDto {
  name: string;
  description: string;
}

const createProject = async (projectData: CreateProjectDto): Promise<any> => {
  const { data } = await api.post('/projects', projectData);
  return data;
};

export function CreateProjectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation<any, Error, CreateProjectDto>({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      notifications.show({
        title: 'Project Created',
        message: 'Your new project has been successfully created.',
        color: 'green',
      });
      navigate('/');
    },
    onError: (error) => {
      notifications.show({
        title: 'Creation Failed',
        message: `An error occurred: ${error.message}`,
        color: 'red',
      });
    },
  });

  const handleSubmit = (values: CreateProjectDto) => {
    mutation.mutate(values);
  };

  return (
    <ProjectForm
      onSubmit={handleSubmit}
      isLoading={mutation.isPending}
      formTitle="Create New Project"
      submitButtonText="Create Project"
    />
  );
}
