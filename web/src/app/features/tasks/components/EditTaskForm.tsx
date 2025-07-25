import { useUpdateTaskMutation } from '../hooks/tasks.hooks';
import { Task, UpdateTaskDto } from '../../../types';
import { useState } from 'react';

import {
  NumberInput,
  MultiSelect,
  TextInput,
  Textarea,
  Switch,
  Button,
  Select,
  Stack,
  Group,
} from '@mantine/core';

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
  const [formData, setFormData] = useState<Omit<UpdateTaskDto, 'id'>>({
    title: task.title,
    description: task.description || '',
    experienceLevel: task.experienceLevel as 'JUNIOR' | 'MIDDLE' | 'SENIOR',
    technology: task.technology || '',
    tags: task.tags || [],
    useAiEstimate: task.useAiEstimate || false,
    breakdown: task.breakdown || false,
    manualEstimate: task.manualEstimate || 0,
  });

  const updateMutation = useUpdateTaskMutation(projectId);

  const handleChange = (
    field: keyof typeof formData,
    value: (typeof formData)[keyof typeof formData]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateMutation.mutate(
      { id: task.id, ...formData },
      {
        onSuccess: () => {
          onSuccess();
        },
        onError: () => {
          // handle error
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        <TextInput
          withAsterisk
          label="Title"
          value={formData.title}
          onChange={(e) => handleChange('title', e.currentTarget.value)}
        />
        <Textarea
          label="Description"
          minRows={4}
          value={formData.description}
          onChange={(e) => handleChange('description', e.currentTarget.value)}
        />
        <TextInput
          withAsterisk
          label="Technology"
          value={formData.technology}
          onChange={(e) => handleChange('technology', e.currentTarget.value)}
        />
        <Select
          withAsterisk
          label="Experience Level"
          data={['JUNIOR', 'MIDDLE', 'SENIOR']}
          value={formData.experienceLevel}
          onChange={(value) =>
            handleChange(
              'experienceLevel',
              value as 'JUNIOR' | 'MIDDLE' | 'SENIOR'
            )
          }
        />
        <MultiSelect
          label="Tags"
          data={formData.tags}
          searchable
          creatable
          getCreateLabel={(query) => `+ Create ${query}`}
          value={formData.tags}
          onChange={(value) => handleChange('tags', value)}
        />
        <Group grow>
          <Switch
            label="Use AI Estimate"
            checked={formData.useAiEstimate}
            onChange={(e) =>
              handleChange('useAiEstimate', e.currentTarget.checked)
            }
          />
          <Switch
            label="Breakdown Task"
            checked={formData.breakdown}
            onChange={(e) => handleChange('breakdown', e.currentTarget.checked)}
          />
        </Group>
        <NumberInput
          label="Manual Estimate (hours)"
          disabled={formData.useAiEstimate}
          value={formData.manualEstimate}
          onChange={(value) => handleChange('manualEstimate', value || 0)}
        />
        <Group justify="flex-end" mt="md">
          <Button type="submit" loading={updateMutation.isPending}>
            Save Changes
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
