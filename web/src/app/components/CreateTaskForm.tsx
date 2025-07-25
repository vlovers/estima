import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  TextInput,
  Textarea,
  Button,
  Group,
  Paper,
  Title,
  Alert,
  Select,
  MultiSelect,
  Switch,
  NumberInput,
  JsonInput,
  SegmentedControl,
  Stack,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import { api } from '../services/authApiService';
import { notifications } from '@mantine/notifications';

// Types based on API
interface CreateTaskDto {
  title: string;
  description: string;
  projectId: string;
  experienceLevel: 'JUNIOR' | 'MIDDLE' | 'SENIOR';
  technology: string;
  tags: string[];
  useAiEstimate: boolean;
  breakdown: boolean;
  manualEstimate?: number;
}

const createTask = async (taskData: CreateTaskDto): Promise<any> => {
  const { data } = await api.post('/tasks', taskData);
  return data;
};

interface CreateTaskFormProps {
  projectId: string;
  onSuccess: () => void;
}

const initialValues: Omit<CreateTaskDto, 'projectId'> = {
  title: 'Build User Analytics Dashboard',
  description:
    'Create a comprehensive analytics dashboard that displays user behavior, revenue metrics, and engagement statistics. The dashboard should include charts, filters by date and user segments, export functionality, and real-time updates.',
  experienceLevel: 'SENIOR',
  technology: 'React, Node.js, PostgreSQL',
  tags: ['dashboard', 'analytics', 'frontend', 'backend'],
  useAiEstimate: true,
  breakdown: false,
  manualEstimate: 40,
};

export function CreateTaskForm({ projectId, onSuccess }: CreateTaskFormProps) {
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const queryClient = useQueryClient();

  const form = useForm<Omit<CreateTaskDto, 'projectId'>>({
    initialValues,
    validate: {
      title: (value) =>
        value.length < 3 ? 'Title must have at least 3 characters' : null,
      technology: (value) =>
        value.length === 0 ? 'Technology is required' : null,
    },
  });

  const createTaskMutation = useMutation<any, Error, CreateTaskDto>({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      notifications.show({
        title: 'Task Created',
        message: 'The new task has been successfully added to the project.',
        color: 'green',
      });
      onSuccess();
    },
    onError: (error) => {
      notifications.show({
        title: 'Creation Failed',
        message: `An error occurred: ${error.message}`,
        color: 'red',
      });
    },
  });

  const handleSubmit = (values: Omit<CreateTaskDto, 'projectId'>) => {
    createTaskMutation.mutate({ ...values, projectId });
  };

  return (
    <Paper withBorder shadow="md" p="md" radius="md" mt="lg" mb="xl">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <SegmentedControl
            value={mode}
            onChange={(value: 'form' | 'json') => setMode(value)}
            data={[
              { label: 'Form', value: 'form' },
              { label: 'JSON', value: 'json' },
            ]}
            fullWidth
          />

          {mode === 'form' ? (
            <>
              <TextInput
                withAsterisk
                label="Title"
                placeholder="Implement user authentication"
                {...form.getInputProps('title')}
              />
              <Textarea
                label="Description"
                placeholder="Detailed description of the task..."
                {...form.getInputProps('description')}
                minRows={4}
              />
              <TextInput
                withAsterisk
                label="Technology"
                placeholder="e.g., React, NestJS, Docker"
                {...form.getInputProps('technology')}
              />
              <Select
                withAsterisk
                label="Experience Level"
                data={['JUNIOR', 'MIDDLE', 'SENIOR']}
                {...form.getInputProps('experienceLevel')}
              />
              <MultiSelect
                label="Tags"
                data={form.values.tags}
                placeholder="e.g., security, frontend"
                searchable
                creatable
                getCreateLabel={(query) => `+ Create ${query}`}
                onCreate={(query) => {
                  const item = { value: query, label: query };
                  form.setFieldValue('tags', [...form.values.tags, query]);
                  return item;
                }}
                {...form.getInputProps('tags')}
              />
              <Group grow>
                <Switch
                  label="Use AI Estimate"
                  {...form.getInputProps('useAiEstimate', { type: 'checkbox' })}
                />
                <Switch
                  label="Breakdown Task"
                  {...form.getInputProps('breakdown', { type: 'checkbox' })}
                />
              </Group>
              <NumberInput
                label="Manual Estimate (hours)"
                placeholder="e.g., 40"
                disabled={form.values.useAiEstimate}
                {...form.getInputProps('manualEstimate')}
              />
            </>
          ) : (
            <JsonInput
              label="Task JSON"
              placeholder='{
                "title": "My Task",
                "description": "..."
              }'
              validationError="Invalid JSON"
              formatOnBlur
              autosize
              minRows={10}
              value={JSON.stringify(form.values, null, 2)}
              onChange={(jsonString) => {
                try {
                  const parsed = JSON.parse(jsonString);
                  form.setValues(parsed);
                } catch (e) {
                  // Invalid JSON, do nothing
                }
              }}
            />
          )}

          {createTaskMutation.isError && (
            <Alert color="red" title="Error">
              {createTaskMutation.error.message}
            </Alert>
          )}

          <Group position="right" mt="md">
            <Button type="submit" loading={createTaskMutation.isPending}>
              Create Task
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}
