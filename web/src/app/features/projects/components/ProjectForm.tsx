import { useForm } from '@mantine/form';

import {
  NumberInput,
  TextInput,
  Textarea,
  Button,
  Select,
  Group,
  Box,
} from '@mantine/core';

interface ProjectFormValues {
  name: string;
  description: string;
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  overhead: number;
}

interface ProjectFormProps {
  onSubmit: (values: ProjectFormValues) => void;
  isLoading: boolean;
  initialValues?: Partial<ProjectFormValues>;
}

export function ProjectForm({
  onSubmit,
  isLoading,
  initialValues,
}: ProjectFormProps) {
  const form = useForm<ProjectFormValues>({
    initialValues: {
      name: initialValues?.name || '',
      description: initialValues?.description || '',
      complexity: initialValues?.complexity || 'MEDIUM',
      overhead: initialValues?.overhead || 0,
    },

    validate: {
      name: (value) =>
        value.length < 2 ? 'Name must have at least 2 letters' : null,
      description: (value) =>
        value.length < 10 ? 'Description must have at least 10 letters' : null,
      overhead: (value) =>
        value < 0 ? 'Overhead must be a positive number' : null,
    },
  });

  return (
    <Box
      component="form"
      maw={400}
      mx="auto"
      onSubmit={form.onSubmit(onSubmit)}
    >
      <TextInput
        withAsterisk
        label="Name"
        placeholder="Project Name"
        {...form.getInputProps('name')}
      />
      <Textarea
        withAsterisk
        label="Description"
        placeholder="Project Description"
        {...form.getInputProps('description')}
        mt="md"
      />
      <Select
        withAsterisk
        label="Complexity"
        placeholder="Select complexity"
        data={['LOW', 'MEDIUM', 'HIGH']}
        {...form.getInputProps('complexity')}
        mt="md"
      />
      <NumberInput
        withAsterisk
        label="Overhead (in hours)"
        placeholder="Enter overhead"
        {...form.getInputProps('overhead')}
        mt="md"
        min={0}
      />
      <Group justify="flex-end" mt="md">
        <Button type="submit" loading={isLoading}>
          Submit
        </Button>
      </Group>
    </Box>
  );
}
