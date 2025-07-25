import { Task } from '../../../types';
import { useMemo } from 'react';

import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Card,
  Menu,
  Stack,
  Text,
} from '@mantine/core';

import {
  IconMessageCircle2,
  IconChevronDown,
  IconChevronRight,
  IconDotsVertical,
  IconPencil,
  IconTrash,
} from '@tabler/icons-react';

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggle: () => void;
  isExpanded: boolean;
  onFeedback: (task: Task) => void;
  onManualEstimate: (task: Task) => void;
}

export function TaskCard({
  task,
  onEdit,
  onDelete,
  onToggle,
  isExpanded,
  onFeedback,
  onManualEstimate,
}: TaskCardProps) {
  const totalEstimate = useMemo(() => {
    const manualEstimate = task.estimates.find((e) => e.source === 'manual');
    if (manualEstimate) return manualEstimate.finalEstimate;
    return task.estimates.reduce(
      (acc, est) => acc + (est.finalEstimate || 0),
      0
    );
  }, [task.estimates]);

  const estimateSource = useMemo(() => {
    return task.estimates.some((e) => e.source === 'manual') ? 'Manual' : 'AI';
  }, [task.estimates]);

  const confidence = useMemo(() => {
    if (task.estimates.length === 0) return null;
    const avgConfidence =
      task.estimates.reduce((acc, est) => acc + (est.confidence || 0), 0) /
      task.estimates.length;
    return avgConfidence;
  }, [task.estimates]);

  const getConfidenceColor = (value: number | null) => {
    if (value === null) return 'gray';
    if (value > 0.8) return 'green';
    if (value > 0.6) return 'yellow';
    return 'red';
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack>
        <Group justify="space-between">
          <Group>
            {task.children && task.children.length > 0 && (
              <ActionIcon onClick={onToggle} size="sm">
                {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
              </ActionIcon>
            )}
            <Text fw={500}>{task.title}</Text>
          </Group>
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon variant="subtle">
                <IconDotsVertical size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Actions</Menu.Label>
              <Menu.Item
                leftSection={<IconPencil size={14} />}
                onClick={() => onEdit(task)}
              >
                Edit Task
              </Menu.Item>
              <Menu.Item
                leftSection={<IconTrash size={14} />}
                color="red"
                onClick={() => onDelete(task)}
              >
                Delete Task
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        <Text size="sm" c="dimmed">
          {task.description}
        </Text>

        <Group>
          {task.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </Group>

        <Group justify="space-between">
          <Text size="sm">Technology: {task.technology}</Text>
          <Text size="sm">Experience: {task.experienceLevel}</Text>
        </Group>

        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Estimate: {totalEstimate} hours ({estimateSource})
          </Text>
          {estimateSource === 'AI' && confidence !== null && (
            <Badge color={getConfidenceColor(confidence)} variant="light">
              Confidence: {(confidence * 100).toFixed(0)}%
            </Badge>
          )}
        </Group>

        <Group justify="space-between" mt="xs">
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => onManualEstimate(task)}
            title="Set Manual Estimate"
          >
            <IconPencil size={16} />
          </ActionIcon>

          {task.feedbacks && task.feedbacks.length > 0 ? (
            <Text size="xs" c="dimmed">
              Actual: {task.feedbacks[0].actualHours} hours
            </Text>
          ) : (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconMessageCircle2 size={14} />}
              onClick={() => onFeedback(task)}
            >
              Add Feedback
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
