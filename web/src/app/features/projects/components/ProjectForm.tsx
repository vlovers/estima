import { useForm } from '@mantine/form';
import { Link } from 'react-router-dom';
import {
  NumberInput,
  TextInput,
  Textarea,
  Button,
  Select,
  Stack,
  Text,
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
  const editing = !!initialValues;
  const form = useForm<ProjectFormValues>({
    initialValues: {
      name: initialValues?.name || '',
      description: initialValues?.description || '',
      complexity: initialValues?.complexity || 'MEDIUM',
      overhead: initialValues?.overhead || 0,
    },
    validate: {
      name: (value) =>
        value.trim().length < 2
          ? 'Use at least 2 characters for the name.'
          : null,
      description: (value) =>
        value.trim().length < 10
          ? 'Add at least 10 characters of context.'
          : null,
      overhead: (value) => (value < 0 ? 'Overhead cannot be negative.' : null),
    },
  });
  return (
    <div className="surface form-surface">
      <form onSubmit={form.onSubmit(onSubmit)} aria-busy={isLoading}>
        <fieldset disabled={isLoading} className="form-fieldset">
          <Stack gap="lg">
            <TextInput
              label="Project name"
              placeholder="e.g. Customer portal"
              required
              {...form.getInputProps('name')}
            />
            <Textarea
              label="Description"
              description="What are you building, and what should it achieve?"
              placeholder="Describe the scope and the outcome you're working toward…"
              required
              minRows={4}
              autosize
              {...form.getInputProps('description')}
            />
            <div className="form-section">
              <Text fw={600} size="sm" mb="xs">
                Estimation context
              </Text>
              <Text size="xs" c="dimmed" mb="lg">
                These settings give your task estimates project-level context.
              </Text>
              <div className="form-grid">
                <Select
                  label="Project complexity"
                  allowDeselect={false}
                  data={[
                    { value: 'LOW', label: 'Low — focused scope' },
                    { value: 'MEDIUM', label: 'Medium — some moving parts' },
                    { value: 'HIGH', label: 'High — complex delivery' },
                  ]}
                  {...form.getInputProps('complexity')}
                />
                <NumberInput
                  label="Overhead (%)"
                  description="Allowance for coordination and delivery."
                  min={0}
                  {...form.getInputProps('overhead')}
                />
              </div>
            </div>
            <div className="form-footer">
              <Button variant="default" component={Link} to="/">
                Cancel
              </Button>
              <Button type="submit" loading={isLoading}>
                {editing ? 'Save project' : 'Create project'}
              </Button>
            </div>
          </Stack>
        </fieldset>
      </form>
    </div>
  );
}
