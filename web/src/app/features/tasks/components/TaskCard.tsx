import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { Estimate, Task } from '../../../types';
import { clarifyTask } from '../api/tasks.api';
import React from 'react';

import {
  CopyButton,
  ThemeIcon,
  ActionIcon,
  Accordion,
  Checkbox,
  TextInput,
  Collapse,
  Drawer,
  Tooltip,
  Button,
  Badge,
  Group,
  Menu,
  Stack,
  Paper,
  Code,
  Card,
  Title,
  Text,
  Box,
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
  IconMessageCircle2,
} from '@tabler/icons-react';

import { useDisclosure } from '@mantine/hooks';
import { FeedbackModal } from './FeedbackModal';

// --- Helper Components for the new design ---

function confidenceColor(conf?: number | null): string {
  if (typeof conf !== 'number') return 'gray';
  const pct = conf * 100;
  if (pct < 40) return 'red';
  if (pct < 70) return 'yellow';
  return 'green';
}

function computeSymmetricDivergence(
  topDown?: number,
  bottomUp?: number
): number | undefined {
  if (typeof topDown !== 'number' || typeof bottomUp !== 'number')
    return undefined;
  const td = topDown;
  const bu = bottomUp;
  if (td <= 0 && bu <= 0) return undefined;
  const denom = td + bu;
  if (denom <= 0) return undefined;
  return (200 * Math.abs(td - bu)) / denom;
}

function divergenceColor(div?: number): string {
  if (div == null) return 'gray';
  if (div < 20) return 'green';
  if (div < 50) return 'yellow';
  return 'red';
}

function formatHours(h?: number): string {
  if (typeof h !== 'number' || !isFinite(h)) return '-';
  return (Math.round(h * 10) / 10).toString() + 'h';
}

function extractDetailsFromEstimate(estimate?: Estimate | null) {
  if (!estimate) return {} as ReturnType<typeof parseEstimationDetails>;
  const parsed = parseEstimationDetails(estimate.explanation);
  const logsFromText = parsed.logs;
  const logsFromField =
    typeof estimate.logs === 'string' && estimate.logs.length > 0
      ? estimate.logs
          .split(/\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
  return {
    p10: estimate.p10 ?? parsed.p10,
    p50: estimate.p50 ?? parsed.p50,
    p90: estimate.p90 ?? parsed.p90,
    topDown: estimate.topDown ?? parsed.topDown,
    bottomUp: estimate.bottomUp ?? parsed.bottomUp,
    divergencePct: estimate.divergencePct ?? parsed.divergencePct,
    logs: logsFromField ?? logsFromText,
  } as ReturnType<typeof parseEstimationDetails>;
}

function buildEstimateSummary(task: Task, displayed?: Estimate | null): string {
  if (!displayed) return 'No estimate available';
  const details = extractDetailsFromEstimate(displayed);
  const div =
    typeof details.divergencePct === 'number'
      ? details.divergencePct
      : computeSymmetricDivergence(details.topDown, details.bottomUp);
  const lines: string[] = [];
  lines.push(`Task: ${task.title}`);
  lines.push(`Source: ${displayed.source}`);
  lines.push(
    `Final: ${formatHours(displayed.finalEstimate)} (confidence ${
      typeof displayed.confidence === 'number'
        ? Math.round(displayed.confidence * 100) + '%'
        : 'n/a'
    })`
  );
  if (details.p10 != null && details.p50 != null && details.p90 != null) {
    lines.push(
      `Range: p10=${formatHours(details.p10)}, p50=${formatHours(
        details.p50
      )}, p90=${formatHours(details.p90)}`
    );
  }
  if (details.topDown != null || details.bottomUp != null) {
    lines.push(
      `Top-down: ${formatHours(details.topDown)}; Bottom-up: ${formatHours(
        details.bottomUp
      )}`
    );
  }
  if (div != null) {
    lines.push(`Divergence (symmetric): ${Math.round(div)}%`);
  }
  if (displayed.managerExplanation)
    lines.push(`Manager note: ${displayed.managerExplanation}`);
  return lines.join('\n');
}

function parseEstimationDetails(explanation?: string | null): {
  p10?: number;
  p50?: number;
  p90?: number;
  divergencePct?: number;
  topDown?: number;
  bottomUp?: number;
  logs?: string[];
} {
  if (!explanation) return {};
  const pMatch = explanation.match(
    /p10=([0-9]+(?:\.[0-9]+)?)h, p50=([0-9]+(?:\.[0-9]+)?)h, p90=([0-9]+(?:\.[0-9]+)?)h/i
  );
  const dMatch =
    explanation.match(
      /Divergence\s*\(symmetric\)\s*:?\s*([0-9]+(?:\.[0-9]+)?)%/i
    ) || explanation.match(/Divergence\s*:?\s*([0-9]+(?:\.[0-9]+)?)%/i);
  const tdMatch = explanation.match(/Top-down:\s*([0-9]+(?:\.[0-9]+)?)h/i);
  const buMatch = explanation.match(/Bottom-up:\s*([0-9]+(?:\.[0-9]+)?)h/i);
  let logs: string[] | undefined;
  const logsIndex = explanation.indexOf('Logs:');
  if (logsIndex >= 0) {
    const after = explanation.slice(logsIndex + 5).trim();
    logs = after
      .split(/\n/)
      .map((l) => l.replace(/^[-•]\s?/, '').trim())
      .filter(Boolean);
  }
  return {
    p10: pMatch ? parseFloat(pMatch[1]) : undefined,
    p50: pMatch ? parseFloat(pMatch[2]) : undefined,
    p90: pMatch ? parseFloat(pMatch[3]) : undefined,
    divergencePct: dMatch ? parseFloat(dMatch[1]) : undefined,
    topDown: tdMatch ? parseFloat(tdMatch[1]) : undefined,
    bottomUp: buMatch ? parseFloat(buMatch[1]) : undefined,
    logs,
  };
}

// Removed the p10/p50/p90 diagram for a cleaner UI. We'll surface range info via badges + tooltips.

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
  title: React.ReactNode;
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
          <Box>{title}</Box>
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

function EstimateDisplay({
  estimate,
  label,
}: {
  estimate: Estimate;
  label: string;
}) {
  const details = parseEstimationDetails(estimate.explanation);
  const divergence =
    estimate.divergencePct ??
    computeSymmetricDivergence(details.topDown, details.bottomUp);
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Group gap="xs">
          <ThemeIcon variant="light" color="blue" size="lg">
            <IconBrain size={18} />
          </ThemeIcon>
          <Text fw={500} size="sm">
            {label}
          </Text>
        </Group>
        <Group align="baseline" gap="sm">
          <Tooltip
            label={estimate.explanation ?? ''}
            disabled={!estimate.explanation}
            withinPortal
          >
            <Text
              fz="xl"
              fw={700}
              style={{ cursor: estimate.explanation ? 'help' : 'default' }}
            >
              {estimate.finalEstimate}h
            </Text>
          </Tooltip>
          {typeof estimate.confidence === 'number' && (
            <Badge variant="light" color={confidenceColor(estimate.confidence)}>
              {Math.round(estimate.confidence * 100)}% conf
            </Badge>
          )}
          {estimate.manualEstimate != null && (
            <Text fz="sm" c="dimmed">
              / {estimate.manualEstimate}h manual
            </Text>
          )}
        </Group>
      </Group>
      {/* Clean badges instead of diagram */}
      <Group gap="xs">
        {details.p10 != null && details.p90 != null && (
          <Tooltip
            withinPortal
            label={`p10 ${formatHours(details.p10)} • p50 ${formatHours(
              details.p50
            )} • p90 ${formatHours(details.p90)}`}
          >
            <Badge variant="outline" color="gray">
              Range {formatHours(details.p10)}–{formatHours(details.p90)}
            </Badge>
          </Tooltip>
        )}
        {divergence != null && (
          <Tooltip withinPortal label={`Divergence: ${Math.round(divergence)}%`}>
            <Badge variant="light" color={divergenceColor(divergence)}>
              {Math.round(divergence)}% div
            </Badge>
          </Tooltip>
        )}
        {details.topDown != null && details.bottomUp != null && (
          <Tooltip withinPortal label="Top-down vs Bottom-up">
            <Badge variant="light" color="gray">
              TD {formatHours(details.topDown)} · BU {formatHours(details.bottomUp)}
            </Badge>
          </Tooltip>
        )}
      </Group>
    </Stack>
  );
}

function ClarificationForm({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: (clarifications: { question: string; answer: string }[]) =>
      // clarifyTask expects a single object argument: { id, clarifications }
      clarifyTask({ id: task.id, clarifications }),
    onSuccess: () => {
      // Refresh the project query so tasks re-fetch and questions disappear
      queryClient.invalidateQueries({ queryKey: ['project'] });
      try {
        localStorage.setItem(`clarify-open-${task.id}`, 'false');
      } catch {
        // Local storage may be unavailable; keep the UI functional.
      }
      setOpen(false);
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
  const count = questionsToAnswer.length;
  const [open, setOpen] = React.useState(true);
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(`clarify-open-${task.id}`);
      if (saved === 'true' || saved === 'false') {
        setOpen(saved === 'true');
      }
    } catch {
        // Local storage may be unavailable; keep the UI functional.
      }
  }, [task.id]);
  const toggleOpen = () => {
    setOpen((v) => {
      const nv = !v;
      try {
        localStorage.setItem(`clarify-open-${task.id}`, String(nv));
      } catch {
        // Local storage may be unavailable; keep the UI functional.
      }
      return nv;
    });
  };

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
      title={
        <Group gap={6} onClick={toggleOpen} style={{ cursor: 'pointer' }}>
          <Text fw={600} size="sm">
            Clarifying Questions
          </Text>
          <Badge variant="light" color="blue" size="sm">
            {count}
          </Badge>
          <IconChevronDown
            size={16}
            style={{
              transform: `rotate(${open ? 180 : 0}deg)`,
              transition: 'transform 150ms ease',
            }}
          />
        </Group>
      }
      color="blue"
    >
      {/* Always-visible description as before */}
      <Text c="dimmed" fz="sm" pt="xs">
        The AI needs more information. Please answer the questions below.
      </Text>
      {/* Inferred top missing aspects (use the first 3 questions as hints) */}
      {questionsToAnswer.length > 0 && (
        <Group gap={6} pt="xs" wrap="wrap">
          <Text fw={500} fz="xs">
            Missing (inferred):
          </Text>
          {questionsToAnswer.slice(0, 3).map((c, i) => (
            <Badge key={i} size="xs" variant="outline" color="blue">
              {c.question.replace(/\?+$/,'')}
            </Badge>
          ))}
        </Group>
      )}
      <Collapse in={open}>
        <form onSubmit={handleSubmit}>
          <Stack pt="xs">
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
      </Collapse>
    </Callout>
  );
}

// --- Main TaskCard Component ---

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onFeedback?: (task: Task) => void;
  onManualEstimate?: (task: Task) => void;
  onClarify?: (task: Task) => void;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export function TaskCard({ task, onEdit, onDelete }: TaskCardProps) {
  const subtasks = task.subtasks || [];
  const hasSubtasks = subtasks.length > 0;
  const finalEstimate = task.estimates?.find((e) => e.source === 'final');
  const aiSubtaskSum = task.estimates?.find(
    (e) => e.source === 'ai_subtask_sum'
  );
  const aiEstimate = task.estimates?.find((e) => e.source === 'ai');
  const displayed = finalEstimate || aiSubtaskSum || aiEstimate || null;
  const managerNote = displayed?.managerExplanation;
  const details = extractDetailsFromEstimate(displayed);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [feedbackModalOpened, { open: openFeedback, close: closeFeedback }] =
    useDisclosure(false);

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
          {displayed && (
            <Group justify="space-between" align="flex-start">
              <EstimateDisplay
                estimate={displayed}
                label={
                  displayed.source === 'final'
                    ? 'Final estimate (p50)'
                    : displayed.source === 'ai_subtask_sum'
                    ? 'AI subtask sum'
                    : 'AI estimate'
                }
              />
              <Stack align="flex-end" gap={6}>
                <Group gap={6}>
                  <Badge
                    variant="outline"
                    color={displayed.source === 'final' ? 'blue' : 'gray'}
                  >
                    {displayed.source.toUpperCase()}
                  </Badge>
                  {(() => {
                    const shown =
                      typeof details?.divergencePct === 'number'
                        ? details.divergencePct
                        : computeSymmetricDivergence(
                            details?.topDown,
                            details?.bottomUp
                          );
                    if (shown == null) return null;
                    const color =
                      shown > 200 ? 'red' : shown > 100 ? 'yellow' : 'green';
                    return (
                      <Tooltip
                        withinPortal
                        label={`Symmetric divergence = 200 * |Top-down - Bottom-up| / (Top-down + Bottom-up)`}
                      >
                        <Badge variant="light" color={color}>
                          Divergence {Math.round(shown)}%
                        </Badge>
                      </Tooltip>
                    );
                  })()}
                </Group>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => setDetailsOpen(true)}
                >
                  Details
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  leftSection={<IconMessageCircle2 size={14} />}
                  onClick={openFeedback}
                >
                  Feedback
                </Button>
              </Stack>
            </Group>
          )}

          {managerNote && (
            <Callout
              icon={<IconInfoCircle size={18} />}
              title="Manager's Note"
              color="yellow"
            >
              <Stack gap="xs" pt="xs">
                <Text fz="xs">{managerNote}</Text>
              </Stack>
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
                  <Text>Subtasks ({subtasks.length})</Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap={0}>
                  {subtasks.map((subtask) => (
                    <SubtaskItem key={subtask.id} task={subtask} />
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        )}
      </Stack>

      <Drawer
        opened={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        position="right"
        size="lg"
        title="Estimate details"
      >
        <Stack>
          {details?.topDown != null && details?.bottomUp != null && (
            <Group>
              <Badge color="grape" variant="light">
                Top-down {details.topDown}h
              </Badge>
              <Badge color="teal" variant="light">
                Bottom-up {details.bottomUp}h
              </Badge>
            </Group>
          )}
          {details?.p10 != null &&
            details?.p50 != null &&
            details?.p90 != null && (
              <Tooltip
                withinPortal
                label={`p10 ${formatHours(details.p10)} • p50 ${formatHours(
                  details.p50
                )} • p90 ${formatHours(details.p90)}`}
              >
                <Badge variant="outline" color="gray">
                  Range {formatHours(details.p10)}–{formatHours(details.p90)}
                </Badge>
              </Tooltip>
            )}
          <Group>
            {typeof displayed?.confidence === 'number' && (
              <Badge
                color={confidenceColor(displayed?.confidence)}
                variant="light"
              >
                Confidence {Math.round((displayed?.confidence || 0) * 100)}%
              </Badge>
            )}
            {displayed?.manualEstimate != null &&
              (() => {
                const ai = displayed!.finalEstimate;
                const m = displayed!.manualEstimate!;
                const diff = m > 0 ? Math.round(((ai - m) / m) * 100) : 0;
                const color =
                  Math.abs(diff) > 50
                    ? 'red'
                    : Math.abs(diff) > 25
                    ? 'yellow'
                    : 'green';
                return (
                  <Badge color={color} variant="outline">
                    AI vs manual: {diff >= 0 ? '+' : ''}
                    {diff}%
                  </Badge>
                );
              })()}
          </Group>

          <Group justify="space-between" align="center">
            <Text fw={600}>Computation log</Text>
            <Group gap={6}>
              <CopyButton value={buildEstimateSummary(task, displayed)}>
                {({ copied, copy }) => (
                  <Button
                    size="xs"
                    variant="light"
                    onClick={copy}
                    leftSection={<IconInfoCircle size={14} />}
                  >
                    {' '}
                    {copied ? 'Copied' : 'Copy summary'}{' '}
                  </Button>
                )}
              </CopyButton>
              <CopyButton value={displayed?.explanation || ''}>
                {({ copied, copy }) => (
                  <Button
                    size="xs"
                    variant="light"
                    onClick={copy}
                    leftSection={<IconInfoCircle size={14} />}
                  >
                    {copied ? 'Copied' : 'Copy logs'}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Group>
          {details?.logs && details.logs.length > 0 ? (
            <Stack gap={4}>
              {details.logs.map((l, i) => (
                <Text key={i} fz="xs">
                  • {l}
                </Text>
              ))}
            </Stack>
          ) : (
            <Code block>{(displayed?.explanation || '').trim()}</Code>
          )}

          {managerNote && (
            <Callout
              icon={<IconInfoCircle size={18} />}
              title="Manager's Note"
              color="yellow"
            >
              <Text fz="sm">{managerNote}</Text>
            </Callout>
          )}
        </Stack>
      </Drawer>

      <FeedbackModal
        task={task}
        opened={feedbackModalOpened}
        onClose={closeFeedback}
      />
    </Card>
  );
}
