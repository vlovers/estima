import { ReactNode } from 'react';
import { Button, Skeleton, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle, IconFolder } from '@tabler/icons-react';

export function WorkspaceLoading({
  label = 'Loading workspace',
}: {
  label?: string;
}) {
  return (
    <Stack role="status" aria-label={label}>
      <Text size="sm" c="dimmed">
        {label}…
      </Text>
      <Skeleton height={36} width="40%" />
      <Skeleton height={140} radius="lg" />
      <Skeleton height={140} radius="lg" />
    </Stack>
  );
}
export function WorkspaceState({
  title,
  description,
  action,
  error = false,
  onRetry,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="surface empty-state" role={error ? 'alert' : undefined}>
      <span className="empty-icon" aria-hidden="true">
        {error ? <IconAlertCircle size={24} /> : <IconFolder size={24} />}
      </span>
      <Title order={2} size="lg">
        {title}
      </Title>
      <p>{description}</p>
      {onRetry ? (
        <Button variant="default" onClick={onRetry}>
          Try again
        </Button>
      ) : (
        action
      )}
    </div>
  );
}
