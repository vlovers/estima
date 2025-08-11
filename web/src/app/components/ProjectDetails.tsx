import { ManualEstimateForm } from '../features/tasks/components/ManualEstimateForm';
import { ClarificationModal } from '../features/tasks/components/ClarificationModal';
import { CreateTaskForm } from '../features/tasks/components/CreateTaskForm';
import { IconSearch, IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { ProjectHeader } from '../features/projects/components/ProjectHeader';
import { FeedbackForm } from '../features/tasks/components/FeedbackForm';
import { useFetchProject } from '../features/projects/hooks/projects.hooks';
import { EditTaskForm } from '../features/tasks/components/EditTaskForm';
import { ProjectStats } from '../features/projects/components/ProjectStats';
import { TaskList } from '../features/tasks/components/TaskList';
import { useState, useMemo, useEffect } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { useParams } from 'react-router-dom';
import { Task, Clarification } from '../types';

import {
  useCreateManualEstimateMutation,
  useCreateFeedbackMutation,
  useDeleteTaskMutation,
  useClarifyTaskMutation,
} from '../features/tasks/hooks/tasks.hooks';

import {
  ActionIcon,
  TextInput,
  Collapse,
  Loader,
  Divider,
  Button,
  Select,
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
    const subtasks = (task.subtasks || [])
      .map(recursiveFilter)
      .filter(Boolean) as Task[];

    if (matches(task) || subtasks.length > 0) {
      return { ...task, subtasks };
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
  const [tagsFilter] = useState<string[]>([]);
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

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
  const [
    clarifyModalOpened,
    { open: openClarifyModal, close: closeClarifyModal },
  ] = useDisclosure(false);

  // Data Fetching
  const {
    data: project,
    isLoading,
    isError,
    error,
  } = useFetchProject(id!, sortField, sortOrder);

  useEffect(() => {
    if (project) {
      console.log('Data received from backend:', project);
    }
  }, [project]);

  // Mutations
  const deleteMutation = useDeleteTaskMutation(project?.id || '');
  const feedbackMutation = useCreateFeedbackMutation(project?.id || '');
  const manualEstimateMutation = useCreateManualEstimateMutation(
    project?.id || ''
  );
  const clarifyMutation = useClarifyTaskMutation(closeClarifyModal);

  // Derived State

  const filteredTasks = useMemo(() => {
    return filterTasks(project?.tasks || [], searchQuery, tagsFilter);
  }, [project, searchQuery, tagsFilter]);

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

  const handleClarifyClick = (task: Task) => {
    setSelectedTask(task);
    openClarifyModal();
  };

  const handleToggleTask = (taskId: string) => {
    setExpandedTasks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const handleDeleteConfirm = () => {
    if (selectedTask) {
      deleteMutation.mutate(selectedTask.id, {
        onSuccess: closeDeleteModal,
      });
    }
  };

  const handleClarifySubmit = (clarifications: Clarification[]) => {
    if (selectedTask) {
      clarifyMutation.mutate({ id: selectedTask.id, clarifications });
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
            <Group justify="space-between" mb="md">
              <TextInput
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                style={{ flex: 1 }}
                leftSection={<IconSearch size={16} />}
              />
              <Group>
                <Select
                  value={sortField}
                  onChange={(value) => setSortField(value || 'createdAt')}
                  data={[
                    { value: 'createdAt', label: 'Date' },
                    { value: 'finalEstimate', label: 'AI Estimate' },
                    { value: 'manualEstimate', label: 'Manual Estimate' },
                  ]}
                />
                <ActionIcon
                  variant="default"
                  onClick={() =>
                    setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC')
                  }
                  size="lg"
                >
                  {sortOrder === 'ASC' ? (
                    <IconArrowUp size={16} />
                  ) : (
                    <IconArrowDown size={16} />
                  )}
                </ActionIcon>
              </Group>
            </Group>
            <TaskList
              tasks={filteredTasks}
              onEdit={handleEditClick}
              onDelete={handleDeleteClick}
              onFeedback={handleFeedbackClick}
              onManualEstimate={handleManualEstimateClick}
              onClarify={handleClarifyClick}
              expandedTasks={expandedTasks}
              onToggleTask={handleToggleTask}
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

      <ClarificationModal
        opened={clarifyModalOpened}
        onClose={closeClarifyModal}
        task={selectedTask}
        onSubmit={handleClarifySubmit}
      />

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
