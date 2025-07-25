import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconSearch, IconPencil, IconTrash } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { api } from '../../../services/authApiService';
import { useState, useEffect } from 'react';
import { Project } from '../../../types';

import {
  SimpleGrid,
  ActionIcon,
  TextInput,
  Loader,
  Button,
  Badge,
  Group,
  Modal,
  Stack,
  Text,
  Alert,
  Card,
  Title,
} from '@mantine/core';

// API functions
const fetchProjects = async (): Promise<Project[]> => {
  const { data } = await api.get('/projects');
  return data;
};

const deleteProject = async (id: string): Promise<void> => {
  await api.delete(`/projects/${id}`);
};

const complexityColors: Record<Project['complexity'], string> = {
  LOW: 'green',
  MEDIUM: 'yellow',
  HIGH: 'red',
};

export function ProjectsList() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState('');

  const {
    data: projects,
    error,
    isLoading,
    isSuccess,
  } = useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  useEffect(() => {
    if (isSuccess && projects && projects.length === 0) {
      navigate('/projects/new');
    }
  }, [isSuccess, projects, navigate]);

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeleteModalOpened(false);
      notifications.show({
        title: 'Project Deleted',
        message: 'The project has been successfully deleted.',
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Deletion Failed',
        message: error.message,
        color: 'red',
      });
    },
  });

  const openDeleteModal = (id: string) => {
    setSelectedProjectId(id);
    setDeleteModalOpened(true);
  };

  const handleDelete = () => {
    if (selectedProjectId) {
      deleteMutation.mutate(selectedProjectId);
    }
  };

  const filteredProjects = projects?.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return <Loader />;
  }

  if (error) {
    return (
      <Alert title="Error" color="red">
        Failed to load projects: {error.message}
      </Alert>
    );
  }

  return (
    <div>
      <Group justify="space-between" mb="xl">
        <Title order={2}>Projects</Title>
        <Button component={Link} to="/projects/new">
          Create Project
        </Button>
      </Group>

      <TextInput
        placeholder="Search projects..."
        mb="xl"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.currentTarget.value)}
        rightSection={<IconSearch size={14} />}
      />

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
        {filteredProjects?.map((project) => (
          <Card
            shadow="sm"
            p="lg"
            radius="md"
            withBorder
            key={project.id}
            component={Link}
            to={`/projects/${project.id}`}
            style={{ textDecoration: 'none' }}
          >
            <Stack justify="space-between" h="100%">
              <div>
                <Group justify="space-between" mb="xs">
                  <Title order={4}>{project.name}</Title>
                  <Badge color={complexityColors[project.complexity]}>
                    {project.complexity}
                  </Badge>
                </Group>

                <Text size="sm" c="dimmed" lineClamp={3}>
                  {project.description}
                </Text>
              </div>

              <div>
                <Group mt="md" grow>
                  <Stack gap={0} align="center">
                    <Text size="lg" fw={700}>
                      {project.tasks?.length || 0}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Tasks
                    </Text>
                  </Stack>
                  <Stack gap={0} align="center">
                    <Text size="lg" fw={700}>
                      {project.overhead}%
                    </Text>
                    <Text size="xs" c="dimmed">
                      Overhead
                    </Text>
                  </Stack>
                </Group>

                <Group justify="flex-end" mt="md">
                  <ActionIcon
                    variant="light"
                    component={Link}
                    to={`/projects/${project.id}/edit`}
                    onClick={(e) => e.preventDefault()}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="light"
                    color="red"
                    onClick={(e) => {
                      e.preventDefault();
                      openDeleteModal(project.id);
                    }}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </div>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>

      <Modal
        opened={deleteModalOpened}
        onClose={() => setDeleteModalOpened(false)}
        title="Confirm Deletion"
      >
        <Text>Are you sure you want to delete this project?</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setDeleteModalOpened(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={handleDelete}
            loading={deleteMutation.isPending}
          >
            Delete
          </Button>
        </Group>
      </Modal>
    </div>
  );
}
