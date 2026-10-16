import { ReactNode } from 'react';
import { Title } from '@mantine/core';

export function PageHeader({
  title,
  description,
  eyebrow = 'Workspace',
  action,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <p className="page-eyebrow">{eyebrow}</p>
        <Title order={1}>{title}</Title>
        {description && <p className="page-subtitle">{description}</p>}
      </div>
      {action}
    </div>
  );
}
