import { Title, Text, Paper } from '@mantine/core';

export function DashboardPage() {
  return (
    <Paper p="md" shadow="sm">
      <Title order={2} mb="md">
        Dashboard
      </Title>
      <Text>Analytics and key project metrics will be displayed here.</Text>
    </Paper>
  );
}
