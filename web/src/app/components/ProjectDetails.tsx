import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  Loader,
  Alert,
  Title,
  Paper,
  Text,
  Card,
  SimpleGrid,
  Badge,
  Group,
  Button,
  Collapse,
  ActionIcon,
  Menu,
  Modal,
  TextInput,
  SegmentedControl,
  MultiSelect,
  Stack,
  Grid,
} from '@mantine/core';
import { CreateTaskForm } from './CreateTaskForm';
import { useMemo, useState } from 'react';
import {
  IconPencil,
  IconTrash,
  IconSearch,
  IconDotsVertical,
  IconListNumbers,
  IconLoader,
  IconCircleCheck,
  IconClock,
} from '@tabler/icons-react';
import { EditTaskForm } from './EditTaskForm';
import { notifications } from '@mantine/notifications';
import { api } from '../services/authApiService';

// Enums and Types
export enum TaskStatus {
  TO_DO = 'TO_DO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

interface Estimate {
  id: string;
  finalEstimate: number;
  explanation: string | null;
}

interface Task {
  id: string;
  title: string;
  description: string;
  technology: string;
  experienceLevel: string;
  tags: string[];
  status: TaskStatus;
  estimates: Estimate[];
}

interface Project {
  id: string;
  name: string;
  description: string;
  tasks: Task[];
}

// API Functions
const fetchProject = async (id: string): Promise<Project> => {
  const { data } = await api.get(`/projects/${id}`);
  return data;
};

const deleteTask = async (id: string): Promise<void> => {
  await api.delete(`/tasks/${id}`);
};

const updateTaskStatus = async ({
  id,
  status,
}: {
  id: string;
  status: TaskStatus;
}): Promise<Task> => {
  const { data } = await api.patch(`/tasks/${id}`, { status });
  return data;
};

const statusColors: Record<TaskStatus, string> = {
  [TaskStatus.TO_DO]: 'gray',
  [TaskStatus.IN_PROGRESS]: 'blue',
  [TaskStatus.DONE]: 'green',
};

export function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [formOpened, setFormOpened] = useState(false);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | TaskStatus>('ALL');
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);

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

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setDeleteModalOpened(false);
      notifications.show({
        title: 'Task Deleted',
        message: 'The task has been successfully deleted.',
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

  const statusMutation = useMutation<
    Task,
    Error,
    { id: string; status: TaskStatus }
  >({
    mutationFn: updateTaskStatus,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      notifications.show({
        title: 'Status Updated',
        message: `Task "${data.title}" is now ${data.status.replace(
          '_',
          ' '
        )}. `,
        color: 'blue',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Status Update Failed',
        message: error.message,
        color: 'red',
      });
    },
  });

  const openDeleteModal = (task: Task) => {
    setSelectedTask(task);
    setDeleteModalOpened(true);
  };

  const openEditModal = (task: Task) => {
    setSelectedTask(task);
    setEditModalOpened(true);
  };

  const handleDeleteConfirm = () => {
    if (selectedTask) {
      deleteMutation.mutate(selectedTask.id);
    }
  };

  const allTags = useMemo(() => {
    if (!project?.tasks) return [];
    const tagsSet = new Set<string>();
    project.tasks.forEach((task) =>
      task.tags.forEach((tag) => tagsSet.add(tag))
    );
    return Array.from(tagsSet);
  }, [project?.tasks]);

  const filteredTasks = useMemo(() => {
    if (!project?.tasks) return [];
    return project.tasks.filter((task) => {
      const searchMatch = task.title
        .toLowerCase()
        .includes(taskSearchQuery.toLowerCase());
      const statusMatch =
        statusFilter === 'ALL' || task.status === statusFilter;
      const tagsMatch =
        tagsFilter.length === 0 ||
        tagsFilter.every((tag) => task.tags.includes(tag));
      return searchMatch && statusMatch && tagsMatch;
    });
  }, [project?.tasks, taskSearchQuery, statusFilter, tagsFilter]);

  const stats = useMemo(() => {
    if (!project) {
      return {
        totalTasks: 0,
        todoTasks: 0,
        inProgressTasks: 0,
        doneTasks: 0,
        totalHours: 0,
      };
    }
    const totalTasks = project.tasks.length;
    const todoTasks = project.tasks.filter(
      (t) => t.status === TaskStatus.TO_DO
    ).length;
    const inProgressTasks = project.tasks.filter(
      (t) => t.status === TaskStatus.IN_PROGRESS
    ).length;
    const doneTasks = project.tasks.filter(
      (t) => t.status === TaskStatus.DONE
    ).length;
    const totalHours = project.tasks
      .flatMap((t) => t.estimates)
      .reduce((acc, est) => acc + (est.finalEstimate || 0), 0);

    return { totalTasks, todoTasks, inProgressTasks, doneTasks, totalHours };
  }, [project]);

  if (isLoading) return <Loader />;
  if (isError)
    return (
      <Alert color="red" title="Error">
        {error.message}
      </Alert>
    );
  if (!project)
    return (
      <Alert color="yellow" title="Not Found">
        Project not found.
      </Alert>
    );

  return (
    <Stack>
      <Card withBorder radius="md" p="lg">
        <Group justify="space-between">
          <div>
            <Title order={2}>{project.name}</Title>
            <Text mt="sm" c="dimmed">
              {project.description}
            </Text>
          </div>
          <Button onClick={() => setFormOpened((o) => !o)}>Add New Task</Button>
        </Group>
      </Card>

      <Collapse in={formOpened}>
        <CreateTaskForm
          projectId={project.id}
          onSuccess={() => setFormOpened(false)}
        />
      </Collapse>

      <Title order={3} mt="xl">
        Project Stats
      </Title>
      <Grid>
        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card withBorder radius="md" p="sm">
            <Group>
              <IconListNumbers size={28} />
              <div>
                <Text c="dimmed" size="xs">
                  Total Tasks
                </Text>
                <Text fw={700} size="xl">
                  {stats.totalTasks}
                </Text>
              </div>
            </Group>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6, lg: 2 }}>
          <Card withBorder radius="md" p="sm">
            <Group>
              <IconLoader size={28} />
              <div>
                <Text c="dimmed" size="xs">
                  To Do
                </Text>
                <Text fw={700} size="xl">
                  {stats.todoTasks}
                </Text>
              </div>
            </Group>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6, lg: 2 }}>
          <Card withBorder radius="md" p="sm">
            <Group>
              <IconLoader size={28} color="blue" />
              <div>
                <Text c="dimmed" size="xs">
                  In Progress
                </Text>
                <Text fw={700} size="xl">
                  {stats.inProgressTasks}
                </Text>
              </div>
            </Group>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6, lg: 2 }}>
          <Card withBorder radius="md" p="sm">
            <Group>
              <IconCircleCheck size={28} color="green" />
              <div>
                <Text c="dimmed" size="xs">
                  Done
                </Text>
                <Text fw={700} size="xl">
                  {stats.doneTasks}
                </Text>
              </div>
            </Group>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card withBorder radius="md" p="sm">
            <Group>
              <IconClock size={28} />
              <div>
                <Text c="dimmed" size="xs">
                  Total Hours
                </Text>
                <Text fw={700} size="xl">
                  {stats.totalHours}
                </Text>
              </div>
            </Group>
          </Card>
        </Grid.Col>
      </Grid>

      <Title order={3} mt="xl" mb="md">
        Tasks
      </Title>

      <Paper p="md" withBorder mb="lg" radius="md">
        <Stack>
          <TextInput
            placeholder="Search tasks by title..."
            leftSection={<IconSearch size={14} />}
            value={taskSearchQuery}
            onChange={(e) => setTaskSearchQuery(e.currentTarget.value)}
          />
          <Group grow>
            <SegmentedControl
              value={statusFilter}
              onChange={setStatusFilter}
              data={[
                { label: 'All', value: 'ALL' },
                { label: 'To Do', value: TaskStatus.TO_DO },
                { label: 'In Progress', value: TaskStatus.IN_PROGRESS },
                { label: 'Done', value: TaskStatus.DONE },
              ]}
            />
            <MultiSelect
              data={allTags}
              value={tagsFilter}
              onChange={setTagsFilter}
              placeholder="Filter by tags"
              clearable
            />
          </Group>
        </Stack>
      </Paper>

      <SimpleGrid
        cols={3}
        spacing="lg"
        breakpoints={[{ maxWidth: 'sm', cols: 1 }]}
      >
        {filteredTasks.map((task) => (
          <Card shadow="sm" p="lg" radius="md" withBorder key={task.id}>
            <Group position="apart" mb="xs">
              <Title order={4}>{task.title}</Title>
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <Badge
                    color={statusColors[task.status]}
                    style={{ cursor: 'pointer' }}
                  >
                    {task.status.replace('_', ' ')}
                  </Badge>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Change Status</Menu.Label>
                  {Object.values(TaskStatus).map((status) => (
                    <Menu.Item
                      key={status}
                      onClick={() =>
                        statusMutation.mutate({ id: task.id, status })
                      }
                    >
                      {status.replace('_', ' ')}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </Group>

            <Group position="apart" mt="xs">
              <Badge
                color={
                  task.experienceLevel === 'SENIOR'
                    ? 'red'
                    : task.experienceLevel === 'MIDDLE'
                    ? 'yellow'
                    : 'green'
                }
              >
                {task.experienceLevel}
              </Badge>
              <Group spacing="xs">
                <ActionIcon
                  variant="default"
                  size="sm"
                  onClick={() => openEditModal(task)}
                >
                  <IconPencil size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="default"
                  color="red"
                  size="sm"
                  onClick={() => openDeleteModal(task)}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Group>

            <Text size="sm" c="dimmed" mt="md">
              {task.description}
            </Text>

            <Text size="sm" fw={500} mt="md">
              Technology:
            </Text>
            <Text size="sm">{task.technology}</Text>

            <Text size="sm" fw={500} mt="md">
              Tags:
            </Text>
            <Group mt="xs">
              {task.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </Group>

            <Text size="sm" fw={500} mt="md">
              AI Estimates:
            </Text>
            <Group mt="xs">
              {task.estimates.map((est) => (
                <Badge key={est.id} variant="light">
                  {est.finalEstimate} hours
                </Badge>
              ))}
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      <Modal
        opened={deleteModalOpened}
        onClose={() => setDeleteModalOpened(false)}
        title="Confirm Deletion"
        size="sm"
      >
        <Text size="sm">
          Are you sure you want to delete this task? This action cannot be
          undone.
        </Text>
        <Group position="right" mt="xl">
          <Button variant="default" onClick={() => setDeleteModalOpened(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={handleDeleteConfirm}
            loading={deleteMutation.isPending}
          >
            Delete Task
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={editModalOpened}
        onClose={() => setEditModalOpened(false)}
        title="Edit Task"
      >
        {selectedTask && (
          <EditTaskForm
            task={selectedTask}
            projectId={project.id}
            onSuccess={() => setEditModalOpened(false)}
          />
        )}
      </Modal>
    </Stack>
  );
}
