import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TextInput,
  Textarea,
  Button,
  Group,
  Paper,
  Select,
  MultiSelect,
  Switch,
  NumberInput,
  JsonInput,
  SegmentedControl,
  Stack,
  Alert,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import { Task } from './ProjectDetails'; // Re-using the Task type
import { notifications } from '@mantine/notifications';
import { api } from '../services/authApiService';

// Types based on API
interface UpdateTaskDto {
  title?: string;
  description?: string;
  experienceLevel?: 'JUNIOR' | 'MIDDLE' | 'SENIOR';
  technology?: string;
  tags?: string[];
  useAiEstimate?: boolean;
  breakdown?: boolean;
  manualEstimate?: number;
}

const updateTask = async ({
  id,
  ...taskData
}: { id: string } & UpdateTaskDto): Promise<any> => {
  const { data } = await api.patch(`/tasks/${id}`, taskData);
  return data;
};

interface EditTaskFormProps {
  task: Task;
  projectId: string;
  onSuccess: () => void;
}

export function EditTaskForm({
  task,
  projectId,
  onSuccess,
}: EditTaskFormProps) {
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const queryClient = useQueryClient();

  const form = useForm<UpdateTaskDto>({
    initialValues: {
      title: task.title,
      description: task.description,
      experienceLevel: task.experienceLevel as any,
      technology: task.technology,
      tags: task.tags,
      // These fields might not exist on the task object from the API yet, so provide defaults
      useAiEstimate: false,
      breakdown: false,
      manualEstimate: 0,
    },
    validate: {
      title: (value) =>
        value && value.length < 3
          ? 'Title must have at least 3 characters'
          : null,
      technology: (value) =>
        value && value.length === 0 ? 'Technology is required' : null,
    },
  });

  const updateMutation = useMutation<
    any,
    Error,
    { id: string } & UpdateTaskDto
  >({
    mutationFn: updateTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      notifications.show({
        title: 'Task Updated',
        message: 'The task has been successfully updated.',
        color: 'green',
      });
      onSuccess();
    },
    onError: (error) => {
      notifications.show({
        title: 'Update Failed',
        message: `An error occurred: ${error.message}`,
        color: 'red',
      });
    },
  });

  const handleSubmit = (values: UpdateTaskDto) => {
    updateMutation.mutate({ ...values, id: task.id });
  };

  return (
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
              {...form.getInputProps('title')}
            />
            <Textarea
              label="Description"
              minRows={4}
              {...form.getInputProps('description')}
            />
            <TextInput
              withAsterisk
              label="Technology"
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
              data={form.values.tags || []}
              searchable
              creatable
              getCreateLabel={(query) => `+ Create ${query}`}
              onCreate={(query) => {
                const item = { value: query, label: query };
                form.setFieldValue('tags', [
                  ...(form.values.tags || []),
                  query,
                ]);
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
              disabled={form.values.useAiEstimate}
              {...form.getInputProps('manualEstimate')}
            />
          </>
        ) : (
          <JsonInput
            label="Task JSON"
            validationError="Invalid JSON"
            formatOnBlur
            autosize
            minRows={10}
            value={JSON.stringify(form.values, null, 2)}
            onChange={(jsonString) => {
              try {
                const parsed = JSON.parse(jsonString);
                form.setValues(parsed);
              } catch (e) {}
            }}
          />
        )}

        {updateMutation.isError && (
          <Alert color="red" title="Error">
            {updateMutation.error.message}
          </Alert>
        )}

        <Group position="right" mt="md">
          <Button type="submit" loading={updateMutation.isPending}>
            Save Changes
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
