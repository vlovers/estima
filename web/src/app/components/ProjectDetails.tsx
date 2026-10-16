import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDisclosure } from '@mantine/hooks';
import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import { Task, Clarification } from '../types';
import { useFetchProject } from '../features/projects/hooks/projects.hooks';
import { ProjectHeader } from '../features/projects/components/ProjectHeader';
import { ProjectStats } from '../features/projects/components/ProjectStats';
import { CreateTaskForm } from '../features/tasks/components/CreateTaskForm';
import { EditTaskForm } from '../features/tasks/components/EditTaskForm';
import { TaskList } from '../features/tasks/components/TaskList';
import { ManualEstimateForm } from '../features/tasks/components/ManualEstimateForm';
import { FeedbackForm } from '../features/tasks/components/FeedbackForm';
import { ClarificationModal } from '../features/tasks/components/ClarificationModal';
import {
  useCreateManualEstimateMutation,
  useCreateFeedbackMutation,
  useDeleteTaskMutation,
  useClarifyTaskMutation,
} from '../features/tasks/hooks/tasks.hooks';
import { WorkspaceLoading, WorkspaceState } from './WorkspaceState';

function flatten(tasks: Task[]): Task[] {
  return tasks.flatMap((task) => [
    task,
    ...flatten(task.subtasks ?? task.children ?? []),
  ]);
}
function filterTaskTree(
  tasks: Task[],
  search: string,
  tags: string[],
  status: string
): Task[] {
  return tasks.flatMap((task) => {
    const matches =
      `${task.title} ${task.description ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      tags.every((tag) => task.tags?.includes(tag)) &&
      (status === 'all' || task.status === status);
    const subtasks = filterTaskTree(
      task.subtasks ?? task.children ?? [],
      search,
      tags,
      status
    );
    return matches ? [task] : subtasks.length ? [{ ...task, subtasks }] : [];
  });
}
export function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [formOpened, form] = useDisclosure(false);
  const [editOpened, edit] = useDisclosure(false);
  const [deleteOpened, remove] = useDisclosure(false);
  const [feedbackOpened, feedback] = useDisclosure(false);
  const [manualOpened, manual] = useDisclosure(false);
  const [clarifyOpened, clarify] = useDisclosure(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState('all');
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const query = useFetchProject(id, sortField, sortOrder);
  const project = query.data;
  const tasks = useMemo(() => flatten(project?.tasks ?? []), [project]);
  const selected = tasks.find((task) => task.id === selectedId);
  const filtered = useMemo(
    () => filterTaskTree(project?.tasks ?? [], search, tags, status),
    [project, search, tags, status]
  );
  const allTags = [...new Set(tasks.flatMap((task) => task.tags ?? []))];
  const visibleExpanded =
    search || tags.length || status !== 'all'
      ? new Set(flatten(filtered).map((task) => task.id))
      : expanded;
  const deleteMutation = useDeleteTaskMutation(id);
  const feedbackMutation = useCreateFeedbackMutation(id);
  const manualMutation = useCreateManualEstimateMutation(id);
  const clarifyMutation = useClarifyTaskMutation(clarify.close);
  const select = (task: Task, open: () => void) => {
    setSelectedId(task.id);
    open();
  };
  const toggle = (taskId: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  const submitClarifications = (clarifications: Clarification[]) => {
    if (selected) clarifyMutation.mutate({ id: selected.id, clarifications });
  };
  if (query.isLoading) return <WorkspaceLoading label="Loading project" />;
  if (query.isError)
    return (
      <WorkspaceState
        error
        title="Project could not be loaded"
        description={query.error.message}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  if (!project)
    return (
      <WorkspaceState
        title="Project not found"
        description="Return to your projects to find the work you're looking for."
        action={
          <Button component={Link} to="/">
            All projects
          </Button>
        }
      />
    );
  return (
    <>
      <Link
        className="text-link"
        to="/"
        style={{ marginBottom: 24, color: 'var(--ui-muted)' }}
      >
        <IconArrowLeft size={14} />
        All projects
      </Link>
      <ProjectHeader
        project={project}
        onAddTaskClick={form.open}
        onEditProjectClick={() => navigate(`/projects/${project.id}/edit`)}
      />
      <ProjectStats project={project} />
      <Group justify="space-between" mb="lg">
        <h2 className="section-title">
          Tasks{' '}
          <Text span size="xs" c="dimmed" ml={6}>
            {project.tasks?.length ?? 0}
          </Text>
        </h2>
        <Text size="xs" c="dimmed">
          Scope, estimate, refine.
        </Text>
      </Group>
      {!!project.tasks?.length && (
        <>
          <div className="toolbar">
            <TextInput
              className="toolbar-search"
              aria-label="Search tasks"
              placeholder="Search tasks…"
              leftSection={<IconSearch size={16} />}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <div className="toolbar-controls">
              <Select
                aria-label="Filter task status"
                w={160}
                data={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'estimated', label: 'Estimated' },
                  { value: 'pending_clarification', label: 'Needs input' },
                ]}
                value={status}
                onChange={(value) => setStatus(value || 'all')}
              />
              <Select
                aria-label="Sort tasks by"
                w={150}
                data={[
                  { value: 'createdAt', label: 'Created date' },
                  { value: 'finalEstimate', label: 'AI estimate' },
                  { value: 'manualEstimate', label: 'Manual estimate' },
                ]}
                value={sortField}
                onChange={(value) => setSortField(value || 'createdAt')}
              />
              <ActionIcon
                variant="default"
                size="lg"
                aria-label={
                  sortOrder === 'ASC' ? 'Sort descending' : 'Sort ascending'
                }
                onClick={() =>
                  setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC')
                }
              >
                {sortOrder === 'ASC' ? (
                  <IconArrowUp size={16} />
                ) : (
                  <IconArrowDown size={16} />
                )}
              </ActionIcon>
            </div>
          </div>
          {allTags.length > 0 && (
            <MultiSelect
              aria-label="Filter tasks by tags"
              placeholder="Filter by tags"
              data={allTags}
              value={tags}
              onChange={setTags}
              clearable
              mb="lg"
              maw={340}
            />
          )}
        </>
      )}
      {project.tasks?.length ? (
        <TaskList
          tasks={filtered}
          onEdit={(task) => select(task, edit.open)}
          onDelete={(task) => select(task, remove.open)}
          onFeedback={(task) => select(task, feedback.open)}
          onManualEstimate={(task) => select(task, manual.open)}
          onClarify={(task) => select(task, clarify.open)}
          expandedTasks={visibleExpanded}
          onToggleTask={toggle}
        />
      ) : (
        <WorkspaceState
          title="Make the first task concrete"
          description="Describe a piece of work to explore its estimate, or add your own manual reference."
          action={
            <Button leftSection={<IconPlus size={16} />} onClick={form.open}>
              Add your first task
            </Button>
          }
        />
      )}
      <Drawer
        opened={formOpened}
        onClose={form.close}
        position="right"
        size={680}
        title="New task"
        closeOnClickOutside={false}
      >
        <CreateTaskForm
          projectId={project.id}
          onSuccess={form.close}
          onCancel={form.close}
        />
      </Drawer>
      <Modal
        opened={editOpened}
        onClose={edit.close}
        size={680}
        title="Edit task"
        closeOnClickOutside={false}
      >
        {selected && (
          <EditTaskForm
            task={selected}
            projectId={project.id}
            onSuccess={edit.close}
            onCancel={edit.close}
          />
        )}
      </Modal>
      <Modal
        opened={deleteOpened}
        onClose={() => {
          if (!deleteMutation.isPending) remove.close();
        }}
        title="Delete task?"
        size="sm"
      >
        <Stack>
          <Text size="sm">
            “{selected?.title}” will be permanently removed. This cannot be
            undone.
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              data-autofocus
              onClick={remove.close}
              disabled={deleteMutation.isPending}
            >
              Keep task
            </Button>
            <Button
              color="red"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (selected)
                  deleteMutation.mutate(selected.id, {
                    onSuccess: remove.close,
                  });
              }}
            >
              Delete task
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={feedbackOpened}
        onClose={feedback.close}
        title="Estimation feedback"
      >
        {selected && (
          <FeedbackForm
            taskId={selected.id}
            onSubmit={(values) =>
              feedbackMutation.mutate(values, { onSuccess: feedback.close })
            }
            isLoading={feedbackMutation.isPending}
          />
        )}
      </Modal>
      <Modal
        opened={manualOpened}
        onClose={manual.close}
        title="Set a manual estimate"
      >
        {selected && (
          <ManualEstimateForm
            taskId={selected.id}
            onSubmit={(values) =>
              manualMutation.mutate(values, { onSuccess: manual.close })
            }
            isLoading={manualMutation.isPending}
          />
        )}
      </Modal>
      <ClarificationModal
        opened={clarifyOpened}
        onClose={clarify.close}
        task={selected ?? null}
        onSubmit={submitClarifications}
        isLoading={clarifyMutation.isPending}
      />
    </>
  );
}
