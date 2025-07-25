import { useForm } from '@mantine/form';
import {
  TextInput,
  Textarea,
  Button,
  Group,
  Paper,
  Title,
} from '@mantine/core';

interface ProjectFormValues {
  name: string;
  description: string;
}

interface ProjectFormProps {
  onSubmit: (values: ProjectFormValues) => void;
  initialValues?: ProjectFormValues;
  isLoading: boolean;
}

export function ProjectForm({
  onSubmit,
  initialValues,
  isLoading,
}: ProjectFormProps) {
  const form = useForm<ProjectFormValues>({
    initialValues: initialValues || { name: '', description: '' },
    validate: {
      name: (value) =>
        value.trim().length < 3
          ? 'Project name must include at least 3 characters'
          : null,
    },
  });

  return (
    <Paper withBorder shadow="md" p="lg" radius="md" mt="lg">
      <form onSubmit={form.onSubmit(onSubmit)}>
        <Title order={3} mb="lg">
          {initialValues ? 'Edit Project' : 'Create New Project'}
        </Title>
        <TextInput
          withAsterisk
          label="Project Name"
          placeholder="e.g., My Awesome Project"
          {...form.getInputProps('name')}
        />
        <Textarea
          label="Description"
          placeholder="A short description of the project"
          mt="md"
          {...form.getInputProps('description')}
        />
        <Group position="right" mt="xl">
          <Button type="submit" loading={isLoading}>
            {initialValues ? 'Save Changes' : 'Create Project'}
          </Button>
        </Group>
      </form>
    </Paper>
  );
}
