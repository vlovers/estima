import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { Estimate, Task } from '../../../types';
import { clarifyTask } from '../api/tasks.api';

import {
  ThemeIcon,
  ActionIcon,
  Accordion,
  Checkbox,
  TextInput,
  Button,
  Badge,
  Group,
  Menu,
  Stack,
  Paper,
  Card,
  Text,
  Box,
  Title,
} from '@mantine/core';

import {
  IconChevronDown,
  IconAlertTriangle,
  IconDotsVertical,
  IconInfoCircle,
  IconPencil,
  IconTrash,
  IconBrain,
  IconCode,
  IconUser,
  IconTag,
} from '@tabler/icons-react';

// --- Helper Components for the new design ---

function MetadataItem({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Group gap="xs">
      <ThemeIcon size="sm" variant="light" color="gray">
        {icon}
      </ThemeIcon>
      <Text fz="xs" c="dimmed">
        {children}
      </Text>
    </Group>
  );
}

function Callout({
  icon,
  title,
  color,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      style={{ borderLeft: `3px solid var(--mantine-color-${color}-5)` }}
    >
      <Group align="flex-start">
        <ThemeIcon variant="light" color={color} size="lg" radius="md">
          {icon}
        </ThemeIcon>
        <Stack gap={0}>
          <Text fw={500} size="sm">
            {title}
          </Text>
          <Box>{children}</Box>
        </Stack>
      </Group>
    </Paper>
  );
}

function SubtaskItem({ task }: { task: Task }) {
  const aiEstimate = task.estimates?.find(
    (e) => e.source === 'ai' || e.source === 'ai_subtask_sum'
  );
  return (
    <Group
      justify="space-between"
      p="xs"
      style={{ borderRadius: 'var(--mantine-radius-sm)' }}
    >
      <Group>
        <Checkbox readOnly disabled />
        <Text fz="sm">{task.title}</Text>
      </Group>
      {aiEstimate && (
        <Badge variant="light" color="gray" size="sm">
          {aiEstimate.finalEstimate}h
        </Badge>
      )}
    </Group>
  );
}

function EstimateDisplay({ estimate }: { estimate: Estimate }) {
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Group gap="xs">
          <ThemeIcon variant="light" color="blue" size="lg">
            <IconBrain size={18} />
          </ThemeIcon>
          <Text fw={500} size="sm">
            Estimate
          </Text>
        </Group>
        <Group align="baseline" gap="xs">
          <Text fz="xl" fw={700}>
            {estimate.finalEstimate}h
          </Text>
          {estimate.manualEstimate != null && (
            <Text fz="sm" c="dimmed">
              / {estimate.manualEstimate}h manual
            </Text>
          )}
        </Group>
      </Group>
      {estimate.explanation && (
        <Text fz="xs" c="dimmed" pl={42}>
          {estimate.explanation}
        </Text>
      )}
    </Stack>
  );
}

function ClarificationForm({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: (clarifications: { question: string; answer: string }[]) =>
      clarifyTask(task.id, { clarifications }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: String(
          error.response?.data?.message || 'Failed to submit clarifications.'
        ),
        color: 'red',
      });
    },
  });

  const questionsToAnswer =
    task.clarificationHistory?.filter((c) => !c.answer) || [];

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const clarifications: { question: string; answer: string }[] = [];

    questionsToAnswer.forEach((c, index) => {
      const answer = formData.get(`question-${index}`) as string | null;
      // Only include non-empty answers
      if (answer && answer.trim() !== '') {
        clarifications.push({ question: c.question, answer });
      }
    });

    // Submit if at least one answer is provided.
    // The 'required' prop on inputs should enforce all are filled,
    // but this logic is more robust.
    if (clarifications.length > 0) {
      mutate(clarifications);
    }
  };

  if (questionsToAnswer.length === 0) return null;

  return (
    <Callout
      icon={<IconInfoCircle size={18} />}
      title="Clarifying Questions"
      color="blue"
    >
      <form onSubmit={handleSubmit}>
        <Stack pt="xs">
          <Text c="dimmed" fz="sm">
            The AI needs more information. Please answer the questions below.
          </Text>
          {questionsToAnswer.map((c, index) => (
            <TextInput
              key={index}
              label={c.question}
              name={`question-${index}`} // Use a safe, index-based name
              placeholder="Your answer"
              required
              size="xs"
            />
          ))}
          <Button type="submit" loading={isPending} size="xs" mt="xs">
            Submit Answers
          </Button>
        </Stack>
      </form>
    </Callout>
  );
}
// --- Main TaskCard Component ---

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskCard({ task, onEdit, onDelete }: TaskCardProps) {
  const hasSubtasks = task.subtasks && task.subtasks.length > 0;
  const aiEstimate = task.estimates?.find(
    (e) => e.source === 'ai' || e.source === 'ai_subtask_sum'
  );
  const managerNote = aiEstimate?.managerExplanation;

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        {/* --- Header --- */}
        <Group justify="space-between">
          <Title order={4}>{task.title}</Title>
          <Group>
            <Badge
              variant="light"
              color={
                task.status === 'pending_clarification' ? 'orange' : 'blue'
              }
            >
              {task.status.replace(/_/g, ' ').toLowerCase()}
            </Badge>
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray">
                  <IconDotsVertical size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  icon={<IconPencil size={14} />}
                  onClick={() => onEdit(task)}
                >
                  Edit Task
                </Menu.Item>
                <Menu.Item
                  icon={<IconTrash size={14} />}
                  color="red"
                  onClick={() => onDelete(task)}
                >
                  Delete Task
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        {/* --- Metadata --- */}
        <Group>
          {task.technology && (
            <MetadataItem icon={<IconCode size={14} />}>
              {task.technology}
            </MetadataItem>
          )}
          {task.experienceLevel && (
            <MetadataItem icon={<IconUser size={14} />}>
              {task.experienceLevel}
            </MetadataItem>
          )}
          {(task.tags || []).length > 0 && (
            <MetadataItem icon={<IconTag size={14} />}>
              {(task.tags || []).join(', ')}
            </MetadataItem>
          )}
        </Group>

        {task.description && <Text fz="sm">{task.description}</Text>}

        {task.status === 'pending_clarification' && (
          <ClarificationForm task={task} />
        )}

        {/* --- Estimates & Analysis --- */}
        <Stack gap="md">
          {aiEstimate && <EstimateDisplay estimate={aiEstimate} />}

          {managerNote && (
            <Callout
              icon={<IconInfoCircle size={18} />}
              title="Manager's Note"
              color="yellow"
            >
              <Text fz="xs">{managerNote}</Text>
            </Callout>
          )}

          {task.riskAnalysis && task.riskAnalysis.length > 0 && (
            <Callout
              icon={<IconAlertTriangle size={18} />}
              title="Risk Analysis"
              color="red"
            >
              <Stack gap="xs" pt="xs">
                {(task.riskAnalysis || []).map((r, i) => (
                  <div key={i}>
                    <Text fw={500} fz="xs">
                      {r.risk}
                    </Text>
                    <Text fz="xs" c="dimmed">
                      {r.mitigation}
                    </Text>
                  </div>
                ))}
              </Stack>
            </Callout>
          )}
        </Stack>

        {/* --- Subtasks --- */}
        {hasSubtasks && (
          <Accordion variant="separated" radius="md">
            <Accordion.Item value="subtasks">
              <Accordion.Control>
                <Group>
                  <IconChevronDown size={18} />
                  <Text>Subtasks ({task.subtasks.length})</Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap={0}>
                  {(task.subtasks || []).map((subtask) => (
                    <SubtaskItem key={subtask.id} task={subtask} />
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        )}
      </Stack>
    </Card>
  );
}
