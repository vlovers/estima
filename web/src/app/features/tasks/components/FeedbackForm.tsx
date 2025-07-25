import { NumberInput, Button, Group, Stack } from '@mantine/core';
import { CreateFeedbackDto } from '../../../types';
import { useForm } from '@mantine/form';

interface FeedbackFormProps {
  taskId: string;
  onSubmit: (data: CreateFeedbackDto) => void;
  isLoading: boolean;
}

export function FeedbackForm({
  taskId,
  onSubmit,
  isLoading,
}: FeedbackFormProps) {
  const form = useForm({
    initialValues: {
      actualHours: 0,
    },
    validate: {
      actualHours: (value) =>
        value <= 0 ? 'Actual hours must be positive' : null,
    },
  });

  const handleSubmit = (values: { actualHours: number }) => {
    onSubmit({ ...values, taskId });
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack>
        <NumberInput
          label="Actual Hours"
          placeholder="Enter the actual hours spent on the task"
          {...form.getInputProps('actualHours')}
          min={0.1}
          step={0.5}
          required
        />
        <Group justify="flex-end" mt="md">
          <Button type="submit" loading={isLoading}>
            Submit Feedback
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
