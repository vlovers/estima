import { useState } from 'react';
import {
  Accordion,
  ActionIcon,
  Badge,
  Button,
  CopyButton,
  Drawer,
  Group,
  Menu,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconArrowRight,
  IconChevronDown,
  IconCode,
  IconCopy,
  IconDots,
  IconPencil,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { Task } from '../../../types';
import {
  estimateDetails,
  formatHours,
  isHours,
  manualHours,
  selectedEstimate,
} from '../../../utils/estimation';

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
const sourceLabels = {
  final: 'Final estimate',
  ai: 'AI estimate',
  ai_subtask_sum: 'AI subtask total',
  manual: 'Manual estimate',
};
export function TaskCard({
  task,
  onEdit,
  onDelete,
  onFeedback,
  onManualEstimate,
  onClarify,
  isExpanded,
  onToggle,
}: TaskCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const estimate = selectedEstimate(task);
  const manual = manualHours(task);
  const details = estimateDetails(estimate);
  const pending = task.status === 'pending_clarification';
  const subtasks = task.subtasks ?? task.children ?? [];
  const confidence = estimate?.confidence;
  const hasConfidence =
    typeof confidence === 'number' &&
    Number.isFinite(confidence) &&
    confidence >= 0 &&
    confidence <= 1;
  const hasRange =
    isHours(details.p10) && isHours(details.p90) && details.p10 <= details.p90;
  const summary = [
    `Task: ${task.title}`,
    ...(estimate
      ? [
          `${sourceLabels[estimate.source]}: ${formatHours(
            estimate.finalEstimate
          )} hours`,
        ]
      : []),
    ...(hasRange
      ? [
          `P10–P90: ${formatHours(details.p10)}–${formatHours(
            details.p90
          )} hours`,
        ]
      : []),
    ...(hasConfidence
      ? [`Reported confidence: ${Math.round(confidence * 100)}%`]
      : []),
  ].join('\n');
  return (
    <article className="surface task-card">
      <div className="task-card-heading">
        <div>
          <h3 className="task-title">{task.title}</h3>
          <div className="task-metadata">
            {task.technology && (
              <span>
                <IconCode size={13} aria-hidden="true" />
                {task.technology}
              </span>
            )}
            {task.experienceLevel && (
              <span>
                <IconUser size={13} aria-hidden="true" />
                {task.experienceLevel === 'MIDDLE'
                  ? 'Mid-level'
                  : task.experienceLevel.charAt(0) +
                    task.experienceLevel.slice(1).toLowerCase()}
              </span>
            )}
            {task.tags?.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        </div>
        <Group gap="xs" wrap="nowrap">
          <Badge
            size="xs"
            color={pending ? 'orange' : estimate ? 'brand' : 'gray'}
            variant="light"
          >
            {pending ? 'Needs input' : estimate ? 'Estimated' : 'Not estimated'}
          </Badge>
          <Menu position="bottom-end" width={190}>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={`Actions for ${task.title}`}
              >
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconPencil size={15} />}
                onClick={() => onEdit(task)}
              >
                Edit task
              </Menu.Item>
              {onManualEstimate && (
                <Menu.Item onClick={() => onManualEstimate(task)}>
                  Set manual estimate
                </Menu.Item>
              )}
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={15} />}
                onClick={() => onDelete(task)}
              >
                Delete task
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </div>
      {task.description && (
        <p className="task-description">{task.description}</p>
      )}
      {pending && (
        <div className="option-box">
          <Group justify="space-between">
            <div>
              <Text size="sm" fw={600}>
                A little more context is needed
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {task.clarificationHistory?.filter((item) => !item.answer)
                  .length || 0}{' '}
                unanswered questions from the estimation service.
              </Text>
            </div>
            {onClarify && (
              <Button size="xs" variant="light" onClick={() => onClarify(task)}>
                Answer questions
              </Button>
            )}
          </Group>
        </div>
      )}
      {estimate ? (
        <div className="task-estimate">
          <div>
            <div className="estimate-value">
              {formatHours(estimate.finalEstimate)}
              <small>hours</small>
            </div>
            <div className="estimate-caption">
              {sourceLabels[estimate.source]}
            </div>
          </div>
          <Stack gap={7} align="flex-start">
            {hasRange && (
              <Text size="xs">
                P10–P90 range{' '}
                <Text span fw={600}>
                  {formatHours(details.p10)}–{formatHours(details.p90)} h
                </Text>
              </Text>
            )}
            {hasConfidence && (
              <Text size="xs" c="dimmed">
                Reported confidence {Math.round(confidence * 100)}%
              </Text>
            )}
            {estimate.source !== 'manual' && manual !== undefined && (
              <Text size="xs" c="dimmed">
                Manual reference {formatHours(manual)} h
              </Text>
            )}
          </Stack>
        </div>
      ) : (
        !pending && (
          <Text size="sm" c="dimmed">
            No estimate has been returned for this task.
          </Text>
        )
      )}
      <div className="task-footer">
        <div>
          {subtasks.length > 0 && onToggle && (
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={
                <IconChevronDown
                  size={14}
                  style={{
                    transform: isExpanded ? 'rotate(180deg)' : undefined,
                  }}
                />
              }
              aria-expanded={isExpanded}
              onClick={onToggle}
            >
              {subtasks.length} subtasks
            </Button>
          )}
        </div>
        <Group gap="xs">
          {onManualEstimate && (
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => onManualEstimate(task)}
            >
              Manual estimate
            </Button>
          )}
          {estimate && onFeedback && (
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => onFeedback(task)}
            >
              Feedback
            </Button>
          )}
          {estimate && (
            <Button
              variant="light"
              size="xs"
              rightSection={<IconArrowRight size={14} />}
              onClick={() => setDetailsOpen(true)}
            >
              View estimate
            </Button>
          )}
        </Group>
      </div>
      <Drawer
        opened={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        position="right"
        size="lg"
        title="Estimate details"
      >
        <Stack gap="xl">
          <div>
            <p className="page-eyebrow">
              {estimate ? sourceLabels[estimate.source] : 'Estimate'}
            </p>
            <Text fw={600}>{task.title}</Text>
            <div className="estimate-value" style={{ marginTop: 20 }}>
              {formatHours(estimate?.finalEstimate)}
              <small>hours</small>
            </div>
          </div>
          {(isHours(details.p10) ||
            isHours(details.p50) ||
            isHours(details.p90)) && (
            <section>
              <h3 className="section-title">Uncertainty range</h3>
              <Text size="xs" c="dimmed" mt={6} mb="md">
                Percentiles returned with this estimate.
              </Text>
              <div className="detail-grid">
                {(
                  [
                    ['P10', details.p10],
                    ['P50', details.p50],
                    ['P90', details.p90],
                  ] as const
                )
                  .filter(([, value]) => isHours(value))
                  .map(([label, value]) => (
                    <div className="detail-metric" key={label}>
                      <Text size="xs" c="dimmed">
                        {label}
                      </Text>
                      <Text fw={600} size="lg" mt={6}>
                        {formatHours(value)} h
                      </Text>
                    </div>
                  ))}
              </div>
            </section>
          )}
          <Group>
            {hasConfidence && (
              <Badge variant="light">
                Reported confidence {Math.round(confidence * 100)}%
              </Badge>
            )}
            {isHours(details.divergencePct) && (
              <Badge variant="outline" color="gray">
                Reported divergence {formatHours(details.divergencePct)}%
              </Badge>
            )}
          </Group>
          {(isHours(details.topDown) || isHours(details.bottomUp)) && (
            <Group>
              {isHours(details.topDown) && (
                <Text size="sm">
                  Top-down: {formatHours(details.topDown)} h
                </Text>
              )}
              {isHours(details.bottomUp) && (
                <Text size="sm">
                  Bottom-up: {formatHours(details.bottomUp)} h
                </Text>
              )}
            </Group>
          )}
          {estimate?.explanation && (
            <section>
              <Group justify="space-between" mb="sm">
                <h3 className="section-title">Explanation</h3>
                <CopyButton value={estimate.explanation}>
                  {({ copied, copy }) => (
                    <Button
                      variant="subtle"
                      size="xs"
                      leftSection={<IconCopy size={13} />}
                      onClick={copy}
                    >
                      {copied ? 'Copied' : 'Copy explanation'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
              <div className="explanation">{estimate.explanation}</div>
            </section>
          )}
          {estimate?.managerExplanation && (
            <section className="option-box">
              <h3 className="section-title">Manager’s note</h3>
              <p className="explanation">{estimate.managerExplanation}</p>
            </section>
          )}
          {!!task.riskAnalysis?.length && (
            <section>
              <h3 className="section-title">Risks & mitigations</h3>
              <Stack mt="md">
                {task.riskAnalysis.map((item, index) => (
                  <div className="option-box" key={index}>
                    <Text size="sm" fw={600}>
                      {item.risk}
                    </Text>
                    <Text size="sm" c="dimmed" mt={6}>
                      {item.mitigation}
                    </Text>
                  </div>
                ))}
              </Stack>
            </section>
          )}
          {details.logs && (
            <Accordion variant="default">
              <Accordion.Item value="logs">
                <Accordion.Control>Computation log</Accordion.Control>
                <Accordion.Panel>
                  <div className="explanation">{details.logs}</div>
                  <CopyButton value={details.logs}>
                    {({ copied, copy }) => (
                      <Button size="xs" variant="subtle" mt="sm" onClick={copy}>
                        {copied ? 'Copied' : 'Copy log'}
                      </Button>
                    )}
                  </CopyButton>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          )}
          <CopyButton value={summary}>
            {({ copied, copy }) => (
              <Button
                variant="default"
                leftSection={<IconCopy size={15} />}
                onClick={copy}
              >
                {copied ? 'Summary copied' : 'Copy summary'}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Drawer>
    </article>
  );
}
