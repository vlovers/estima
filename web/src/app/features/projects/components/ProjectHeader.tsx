import { IconSettings } from '@tabler/icons-react';
import { Project } from '../../../types';

import {
  ActionIcon,
  Button,
  Badge,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core';

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
    <Group justify="space-between">
      <Stack gap="xs">
        <Group>
          <Title order={2}>{project.name}</Title>
          <ActionIcon variant="subtle" onClick={onEditProjectClick}>
            <IconSettings size={20} />
          </ActionIcon>
        </Group>
        <Text c="dimmed">{project.description}</Text>
        <Group gap="sm">
          <Badge variant="outline">Complexity: {project.complexity}</Badge>
          <Badge variant="outline">Overhead: {project.overhead}%</Badge>
        </Group>
      </Stack>
      <Button onClick={onAddTaskClick}>Add Task</Button>
    </Group>
  );
}
