import { useCreateTaskMutation } from '../hooks/tasks.hooks';
import { CreateTaskDto } from '../../../types';
import { useState } from 'react';

import {
  SegmentedControl,
  NumberInput,
  MultiSelect,
  TextInput,
  Textarea,
  Switch,
  Button,
  Select,
  Stack,
  Group,
  Paper,
} from '@mantine/core';

const initialValues: Omit<CreateTaskDto, 'projectId'> = {
  title: '',
  description: '',
  technology: '',
  experienceLevel: 'MIDDLE',
  tags: [],
  useAiEstimate: true,
  breakdown: false,
  manualEstimate: 0,
};

interface CreateTaskFormProps {
  projectId: string;
  onSuccess: () => void;
}

export function CreateTaskForm({ projectId, onSuccess }: CreateTaskFormProps) {
  const [mode, setMode] = useState('form');
  const [jsonInput, setJsonInput] = useState(
    JSON.stringify(initialValues, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState(initialValues);

  const mutation = useCreateTaskMutation(onSuccess);

  const handleFormChange = (field: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (mode === 'form') {
      const taskData = { ...formValues, projectId };
      mutation.mutate(taskData);
    } else {
      try {
        const parsed = JSON.parse(jsonInput);
        const taskData = { ...parsed, projectId };
        mutation.mutate(taskData);
      } catch {
        setJsonError('Invalid JSON');
      }
    }
  };

  return (
    <Paper withBorder shadow="md" p="md" radius="md" mt="lg" mb="xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <Stack>
          <SegmentedControl
            value={mode}
            onChange={setMode}
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
                value={formValues.title}
                onChange={(event) =>
                  handleFormChange('title', event.currentTarget.value)
                }
              />
              <Textarea
                label="Description"
                placeholder="Enter task description"
                value={formValues.description}
                onChange={(event) =>
                  handleFormChange('description', event.currentTarget.value)
                }
                required
                autosize
                minRows={4}
              />
              <TextInput
                label="Technology"
                placeholder="e.g., React, NestJS, Docker"
                value={formValues.technology}
                onChange={(event) =>
                  handleFormChange('technology', event.currentTarget.value)
                }
              />
              <Select
                withAsterisk
                label="Experience Level"
                data={['JUNIOR', 'MIDDLE', 'SENIOR']}
                value={formValues.experienceLevel}
                onChange={(value) => handleFormChange('experienceLevel', value)}
              />
              <MultiSelect
                label="Tags"
                data={formValues.tags}
                placeholder="e.g., security, frontend"
                searchable
                creatable
                getCreateLabel={(query) => `+ Create ${query}`}
                onChange={(value) => handleFormChange('tags', value)}
                value={formValues.tags}
              />
              <Group grow>
                <Switch
                  label="Use AI Estimate"
                  checked={formValues.useAiEstimate}
                  onChange={(event) =>
                    handleFormChange(
                      'useAiEstimate',
                      event.currentTarget.checked
                    )
                  }
                />
                <Switch
                  label="Breakdown Task"
                  checked={formValues.breakdown}
                  onChange={(event) =>
                    handleFormChange('breakdown', event.currentTarget.checked)
                  }
                />
              </Group>
              <NumberInput
                label="Manual Estimate (hours)"
                placeholder="Enter manual estimate"
                value={formValues.manualEstimate}
                onChange={(value) => handleFormChange('manualEstimate', value)}
              />
            </>
          ) : (
            <Textarea
              label="Paste Task JSON"
              placeholder="Paste your JSON here"
              rows={10}
              autosize
              minRows={10}
              value={jsonInput}
              onChange={(event) => {
                const newJson = event.currentTarget.value;
                setJsonInput(newJson);
                try {
                  const parsed = JSON.parse(newJson);
                  setFormValues(parsed);
                  setJsonError(null);
                } catch {
                  setJsonError('Invalid JSON');
                }
              }}
              error={jsonError}
            />
          )}
          <Button type="submit" mt="md" loading={mutation.isPending}>
            Create Task
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
