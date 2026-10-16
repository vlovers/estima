import { Badge, Button, Group } from '@mantine/core';
import { IconPlus, IconSettings } from '@tabler/icons-react';
import { Project } from '../../../types';
import { PageHeader } from '../../../components/PageHeader';
import { complexityColors, complexityLabels } from '../projectPresentation';

interface ProjectHeaderProps {
  project: Project;
  onAddTaskClick: () => void;
  onEditProjectClick: () => void;
}
export function ProjectHeader({
  project,
  onAddTaskClick,
  onEditProjectClick,
}: ProjectHeaderProps) {
  return (
    <>
      <PageHeader
        eyebrow="Project workspace"
        title={project.name}
        description={project.description}
        action={
          <Group gap="sm">
            <Button
              variant="default"
              leftSection={<IconSettings size={16} />}
              onClick={onEditProjectClick}
            >
              Settings
            </Button>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={onAddTaskClick}
            >
              Add task
            </Button>
          </Group>
        }
      />
      <Group gap="sm" mb="xl">
        <Badge variant="light" color={complexityColors[project.complexity]}>
          {complexityLabels[project.complexity]}
        </Badge>
        <Badge variant="outline" color="gray">
          {project.overhead}% project overhead
        </Badge>
      </Group>
    </>
  );
}
