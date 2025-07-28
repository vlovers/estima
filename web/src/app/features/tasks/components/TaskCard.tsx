import { Task } from '../../../types';

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
  const estimate = task.estimates?.[0];

  const confidence = estimate?.confidence;

  const getConfidenceColor = (value: number) => {
    if (value > 0.8) return 'green';
    if (value > 0.6) return 'yellow';
    return 'red';
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack>
        <Card.Section withBorder inheritPadding py="xs">
          <Group justify="space-between">
            <Group>
              {task.subtasks && task.subtasks.length > 0 && (
                <ActionIcon onClick={onToggle} size="sm" variant="transparent">
                  {isExpanded ? (
                    <IconChevronDown size={16} />
                  ) : (
                    <IconChevronRight size={16} />
                  )}
                </ActionIcon>
              )}
              <Text fw={500}>{task.title}</Text>
            </Group>
            <Group gap="xs">
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray">
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
          </Group>
        </Card.Section>

        {task.description && (
          <Text size="sm" c="dimmed" mt="xs">
            {task.description}
          </Text>
        )}

        <Group my="sm">
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

        <Group justify="space-between" mt="sm">
          <Stack gap={0}>
            {estimate?.finalEstimate != null && (
              <Text size="sm" c="dimmed">
                AI Estimate: {estimate.finalEstimate.toFixed(1)} hours
              </Text>
            )}
            {estimate?.manualEstimate != null && (
              <Text size="sm" c="dimmed">
                Manual Estimate: {estimate.manualEstimate.toFixed(1)} hours
              </Text>
            )}
          </Stack>
          {confidence !== undefined && (
            <Badge color={getConfidenceColor(confidence)} variant="light">
              Confidence: {(confidence * 100).toFixed(0)}%
            </Badge>
          )}
        </Group>

        <Group justify="flex-end" mt="xs">
          {/*<ActionIcon*/}
          {/*  variant="subtle"*/}
          {/*  color="gray"*/}
          {/*  onClick={() => onManualEstimate(task)}*/}
          {/*  title="Set Manual Estimate"*/}
          {/*>*/}
          {/*  <IconPencil size={16} />*/}
          {/*</ActionIcon>*/}

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
