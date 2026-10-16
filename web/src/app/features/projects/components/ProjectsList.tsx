import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IconArrowUpRight,
  IconDots,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import { api } from '../../../services/authApiService';
import { Project } from '../../../types';
import { useFetchProjects } from '../hooks/projects.hooks';
import { PageHeader } from '../../../components/PageHeader';
import {
  WorkspaceLoading,
  WorkspaceState,
} from '../../../components/WorkspaceState';

import { complexityColors, complexityLabels } from '../projectPresentation';

export function ProjectsList({ overview = false }: { overview?: boolean }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Project | null>(null);
  const [search, setSearch] = useState('');
  const [complexity, setComplexity] = useState('all');
  const query = useFetchProjects();
  const projects = query.data ?? [];
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setSelected(null);
      notifications.show({
        title: 'Project deleted',
        message: 'The project has been removed.',
        color: 'brand',
      });
    },
    onError: (error: Error) =>
      notifications.show({
        title: 'Could not delete project',
        message: error.message,
        color: 'red',
      }),
  });
  const filtered = projects.filter(
    (project) =>
      `${project.name} ${project.description}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (complexity === 'all' || project.complexity === complexity)
  );
  const create = (
    <Button
      component={Link}
      to="/projects/new"
      leftSection={<IconPlus size={16} />}
    >
      New project
    </Button>
  );
  return (
    <>
      <PageHeader
        title={overview ? 'Workspace overview' : 'Projects'}
        description={
          overview
            ? 'A clear starting point for the work ahead.'
            : 'Bring scope, tasks and estimates together in one place.'
        }
        action={create}
      />
      {query.isLoading ? (
        <WorkspaceLoading label="Loading projects" />
      ) : query.isError ? (
        <WorkspaceState
          error
          title="Projects could not be loaded"
          description={query.error.message}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <>
          {overview && projects.length > 0 && (
            <div className="summary-grid">
              {[
                ['Projects', projects.length, 'In your workspace'],
                [
                  'High complexity',
                  projects.filter((project) => project.complexity === 'HIGH')
                    .length,
                  'Projects with more moving parts',
                ],
                [
                  'Low complexity',
                  projects.filter((project) => project.complexity === 'LOW')
                    .length,
                  'Projects with a focused scope',
                ],
              ].map(([label, value, note]) => (
                <div className="surface summary-card" key={label}>
                  <div className="summary-label">{label}</div>
                  <div className="summary-value">{value}</div>
                  <div className="summary-footnote">{note}</div>
                </div>
              ))}
            </div>
          )}
          {projects.length > 0 ? (
            <>
              <div className="toolbar">
                <TextInput
                  className="toolbar-search"
                  aria-label="Search projects"
                  placeholder="Search projects…"
                  leftSection={<IconSearch size={16} />}
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                />
                <div className="toolbar-controls">
                  <Text size="xs" c="dimmed">
                    {filtered.length}{' '}
                    {filtered.length === 1 ? 'project' : 'projects'}
                  </Text>
                  <Select
                    aria-label="Filter project complexity"
                    value={complexity}
                    onChange={(value) => setComplexity(value || 'all')}
                    w={178}
                    data={[
                      { value: 'all', label: 'All complexity' },
                      ...Object.entries(complexityLabels).map(
                        ([value, label]) => ({ value, label })
                      ),
                    ]}
                  />
                </div>
              </div>
              {filtered.length ? (
                <div className="project-grid">
                  {filtered.map((project) => (
                    <article className="surface project-card" key={project.id}>
                      <div className="project-card-top">
                        <div className="project-monogram" aria-hidden="true">
                          {project.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((word) => word[0])
                            .join('')
                            .toUpperCase()}
                        </div>
                        <Menu position="bottom-end" width={190}>
                          <Menu.Target>
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              aria-label={`Actions for ${project.name}`}
                            >
                              <IconDots size={18} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              component={Link}
                              to={`/projects/${project.id}/edit`}
                              leftSection={<IconPencil size={15} />}
                            >
                              Edit project
                            </Menu.Item>
                            <Menu.Item
                              color="red"
                              leftSection={<IconTrash size={15} />}
                              onClick={() => setSelected(project)}
                            >
                              Delete project
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </div>
                      <Group gap="xs" mb="sm">
                        <Badge
                          size="xs"
                          variant="light"
                          color={complexityColors[project.complexity]}
                        >
                          {complexityLabels[project.complexity]}
                        </Badge>
                      </Group>
                      <h2 style={{ margin: 0, fontSize: '16px' }}>
                        <Link
                          className="project-title"
                          to={`/projects/${project.id}`}
                        >
                          {project.name}
                        </Link>
                      </h2>
                      <Text className="project-description" lineClamp={3}>
                        {project.description || 'No description provided.'}
                      </Text>
                      <div className="project-card-footer">
                        <Text size="xs" c="dimmed">
                          {project.overhead}% overhead
                        </Text>
                        <Link
                          className="text-link"
                          to={`/projects/${project.id}`}
                        >
                          Open project
                          <IconArrowUpRight size={14} />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <WorkspaceState
                  title="No matching projects"
                  description="Try another search or remove the complexity filter."
                  action={
                    <Button
                      variant="default"
                      onClick={() => {
                        setSearch('');
                        setComplexity('all');
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              )}
            </>
          ) : (
            <WorkspaceState
              title="Start with your first project"
              description="Give your work a home. Add a project, define its scope, then turn tasks into estimates."
              action={create}
            />
          )}
        </>
      )}
      <Modal
        opened={!!selected}
        onClose={() => {
          if (!remove.isPending) setSelected(null);
        }}
        title="Delete project?"
        size="sm"
      >
        <Stack>
          <Text size="sm">
            “{selected?.name}” and its tasks will be permanently removed. This
            cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              data-autofocus
              onClick={() => setSelected(null)}
              disabled={remove.isPending}
            >
              Keep project
            </Button>
            <Button
              color="red"
              loading={remove.isPending}
              onClick={() => {
                if (selected) remove.mutate(selected.id);
              }}
            >
              Delete project
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
