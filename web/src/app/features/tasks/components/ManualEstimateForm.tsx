import { NumberInput, Button, Group, Stack } from '@mantine/core';
import { CreateManualEstimateDto } from '../../../types';
import { useForm } from '@mantine/form';

interface ManualEstimateFormProps {
  taskId: string;
  onSubmit: (data: CreateManualEstimateDto) => void;
  isLoading: boolean;
}

export function ManualEstimateForm({
  taskId,
  onSubmit,
  isLoading,
}: ManualEstimateFormProps) {
  const form = useForm({
    initialValues: {
      hours: 0,
    },
    validate: {
      hours: (value) => (value <= 0 ? 'Estimate must be positive' : null),
    },
  });

  const handleSubmit = (values: { hours: number }) => {
    onSubmit({ ...values, taskId });
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack>
        <NumberInput
          label="Manual Estimate (hours)"
          placeholder="Enter your estimate in hours"
          {...form.getInputProps('hours')}
          min={0.1}
          step={0.5}
          required
        />
        <Group justify="flex-end" mt="md">
          <Button type="submit" loading={isLoading}>
            Set Estimate
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
