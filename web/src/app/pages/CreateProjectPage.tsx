import { ProjectForm } from '../features/projects/components/ProjectForm';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/authApiService';
import { Project } from '../types';
import { PageHeader } from '../components/PageHeader';

interface CreateProjectDto {
  name: string;
  description: string;
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  overhead: number;
}

const createProject = async (
  projectData: CreateProjectDto
): Promise<Project> => {
  const { data } = await api.post('/projects', projectData);
  return data;
};

export function CreateProjectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation<Project, Error, CreateProjectDto>({
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
    <div className="form-page">
      <PageHeader
        title="New project"
        description="Start with a clear scope. You can add tasks and estimates next."
      />
      <ProjectForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
