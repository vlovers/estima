import { ManualEstimateForm } from '../features/tasks/components/ManualEstimateForm';
import { CreateTaskForm } from '../features/tasks/components/CreateTaskForm';
import { ProjectHeader } from '../features/projects/components/ProjectHeader';
import { FeedbackForm } from '../features/tasks/components/FeedbackForm';
import { EditTaskForm } from '../features/tasks/components/EditTaskForm';
import { useFetchProject } from '../features/projects/hooks/projects.hooks';
import { ProjectStats } from '../features/projects/components/ProjectStats';
import { TaskFilters } from '../features/tasks/components/TaskFilters';
import { TaskList } from '../features/tasks/components/TaskList';
import { useDisclosure } from '@mantine/hooks';
import { useParams } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { Task } from '../types';

import {
  useCreateManualEstimateMutation,
  useCreateFeedbackMutation,
  useDeleteTaskMutation,
} from '../features/tasks/hooks/tasks.hooks';

import {
  Collapse,
  Loader,
  Divider,
  Button,
  Modal,
  Group,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';

// Helper function to filter tasks based on search, and tags
const filterTasks = (
  tasks: Task[],
  searchQuery: string,
  tagsFilter: string[]
): Task[] => {
  const lowercasedQuery = searchQuery.toLowerCase();

  const matches = (task: Task) => {
    const searchMatch =
      task.title.toLowerCase().includes(lowercasedQuery) ||
      task.description.toLowerCase().includes(lowercasedQuery);
    const tagsMatch =
      tagsFilter.length === 0 ||
      tagsFilter.every((tag) => task.tags.includes(tag));
    return searchMatch && tagsMatch;
  };

  const recursiveFilter = (task: Task): Task | null => {
    const children = (task.children || [])
      .map(recursiveFilter)
      .filter(Boolean) as Task[];

    if (matches(task) || children.length > 0) {
      return { ...task, children };
    }

    return null;
  };

  return tasks.map(recursiveFilter).filter(Boolean) as Task[];
};

export function ProjectDetails() {
  const { id } = useParams<{ id: string }>();

  // State Management
  const [activeTab, setActiveTab] = useState('tasks');
  const [formOpened, { toggle: toggleForm }] = useDisclosure(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);

  // Modals State
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] =
    useDisclosure(false);
  const [
    deleteModalOpened,
    { open: openDeleteModal, close: closeDeleteModal },
  ] = useDisclosure(false);
  const [
    feedbackModalOpened,
    { open: openFeedbackModal, close: closeFeedbackModal },
  ] = useDisclosure(false);
  const [
    manualEstimateModalOpened,
    { open: openManualEstimateModal, close: closeManualEstimateModal },
  ] = useDisclosure(false);

  // Data Fetching
  const { data: project, isLoading, isError, error } = useFetchProject(id!);

  // Mutations
  const deleteMutation = useDeleteTaskMutation(project?.id || '');
  const feedbackMutation = useCreateFeedbackMutation(project?.id || '');
  const manualEstimateMutation = useCreateManualEstimateMutation(
    project?.id || ''
  );

  // Memoized Data
  const allTags = useMemo(() => {
    if (!project?.tasks) return [];
    const tags = new Set<string>();
    project.tasks.forEach((task) => task.tags.forEach((tag) => tags.add(tag)));
    return Array.from(tags);
  }, [project?.tasks]);

  const filteredTasks = useMemo(() => {
    if (!project?.tasks) return [];
    return filterTasks(project.tasks, searchQuery, tagsFilter);
  }, [project?.tasks, searchQuery, tagsFilter]);

  // Handlers
  const handleEditClick = (task: Task) => {
    setSelectedTask(task);
    openEditModal();
  };

  const handleDeleteClick = (task: Task) => {
    setSelectedTask(task);
    openDeleteModal();
  };

  const handleFeedbackClick = (task: Task) => {
    setSelectedTask(task);
    openFeedbackModal();
  };

  const handleManualEstimateClick = (task: Task) => {
    setSelectedTask(task);
    openManualEstimateModal();
  };

  const handleDeleteConfirm = () => {
    if (selectedTask) {
      deleteMutation.mutate(selectedTask.id, {
        onSuccess: closeDeleteModal,
      });
    }
  };

  if (isLoading) return <Loader />;
  if (isError) return <Text c="red">Error: {error.message}</Text>;
  if (!project) return <Text>Project not found.</Text>;

  return (
    <Stack>
      <ProjectHeader project={project} onAddTaskClick={toggleForm} />

      <Divider my="md" />

      <Collapse in={formOpened}>
        <CreateTaskForm projectId={project.id} onSuccess={toggleForm} />
      </Collapse>

      <Title order={3} mt="xl">
        Project Stats
      </Title>
      <ProjectStats project={project} />

      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value || 'tasks')}
      >
        <Tabs.List>
          <Tabs.Tab value="tasks">Tasks</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="tasks" pt="xs">
          <Stack>
            <TaskFilters
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              tagsFilter={tagsFilter}
              setTagsFilter={setTagsFilter}
              allTags={allTags}
            />
            <TaskList
              tasks={filteredTasks}
              onEdit={handleEditClick}
              onDelete={handleDeleteClick}
              onFeedback={handleFeedbackClick}
              onManualEstimate={handleManualEstimateClick}
            />
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {/* Modals */}
      <Modal
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
        title="Confirm Deletion"
        size="sm"
      >
        <Text size="sm">
          Are you sure you want to delete this task? This action cannot be
          undone.
        </Text>
        <Group justify="flex-end" mt="xl">
          <Button variant="default" onClick={closeDeleteModal}>
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
        onClose={closeEditModal}
        title="Edit Task"
        size="lg"
      >
        {selectedTask && (
          <EditTaskForm task={selectedTask} onSuccess={closeEditModal} />
        )}
      </Modal>

      <Modal
        opened={feedbackModalOpened}
        onClose={closeFeedbackModal}
        title="Add Feedback"
      >
        {selectedTask && (
          <FeedbackForm
            taskId={selectedTask.id}
            onSubmit={(data) =>
              feedbackMutation.mutate(data, { onSuccess: closeFeedbackModal })
            }
            isLoading={feedbackMutation.isPending}
          />
        )}
      </Modal>

      <Modal
        opened={manualEstimateModalOpened}
        onClose={closeManualEstimateModal}
        title="Set Manual Estimate"
      >
        {selectedTask && (
          <ManualEstimateForm
            taskId={selectedTask.id}
            onSubmit={(data) =>
              manualEstimateMutation.mutate(data, {
                onSuccess: closeManualEstimateModal,
              })
            }
            isLoading={manualEstimateMutation.isPending}
          />
        )}
      </Modal>
    </Stack>
  );
}
