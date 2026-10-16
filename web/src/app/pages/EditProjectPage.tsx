import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProjectForm } from '../features/projects/components/ProjectForm';
import { useNavigate, useParams } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { api } from '../services/authApiService';
import { PageHeader } from '../components/PageHeader';
import { WorkspaceLoading, WorkspaceState } from '../components/WorkspaceState';

interface Project {
  id: string;
  name: string;
  description: string;
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  overhead: number;
}

interface UpdateProjectDto {
  name: string;
  description: string;
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  overhead: number;
}

const fetchProject = async (id: string): Promise<Project> => {
  const { data } = await api.get(`/projects/${id}`);
  return data;
};

const updateProject = async ({
  id,
  ...data
}: UpdateProjectDto & { id: string }): Promise<Project> => {
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

  const mutation = useMutation<
    Project,
    Error,
    UpdateProjectDto & { id: string }
  >({
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

  if (isLoading) return <WorkspaceLoading label="Loading project settings" />;
  if (isError)
    return (
      <WorkspaceState
        error
        title="Project could not be loaded"
        description={error.message}
      />
    );

  return (
    <div className="form-page">
      <PageHeader
        title="Project settings"
        description="Keep your scope and estimation context up to date."
      />
      <ProjectForm
        onSubmit={handleSubmit}
        isLoading={mutation.isPending}
        initialValues={{
          name: project?.name || '',
          description: project?.description || '',
          complexity: project?.complexity || 'MEDIUM',
          overhead: project?.overhead || 0,
        }}
      />
    </div>
  );
}
