import { Grid, Card, Text, Group } from '@mantine/core';
import { Project } from '../../../types';

import { IconListNumbers, IconClock } from '@tabler/icons-react';

interface ProjectStatsProps {
  project: Project;
}

export function ProjectStats({ project }: ProjectStatsProps) {
  const totalTasks = project.tasks.length;
  const totalHours = project.tasks
    .flatMap((t) => t.estimates)
    .reduce((acc, est) => acc + (est.finalEstimate || 0), 0);

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
        <Card withBorder radius="md" p="sm">
          <Group>
            <IconListNumbers size={28} />
            <div>
              <Text c="dimmed" size="xs">
                Total Tasks
              </Text>
              <Text fw={700} size="xl">
                {totalTasks}
              </Text>
            </div>
          </Group>
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
        <Card withBorder radius="md" p="sm">
          <Group>
            <IconClock size={28} />
            <div>
              <Text c="dimmed" size="xs">
                Total Estimated Hours
              </Text>
              <Text fw={700} size="xl">
                {totalHours}
              </Text>
            </div>
          </Group>
        </Card>
      </Grid.Col>
    </Grid>
  );
}
