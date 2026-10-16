import {
  NumberInput,
  Button,
  Group,
  Stack,
  Rating,
  Textarea,
  Select,
  MultiSelect,
  Title,
  Divider,
  Text,
} from '@mantine/core';
import {
  CreateFeedbackDto,
  DeviationReason,
  ComplexityTag,
} from '../../../types';
import { useForm } from '@mantine/form';
import { useId } from 'react';

interface FeedbackFormProps {
  taskId: string;
  onSubmit: (data: CreateFeedbackDto) => void;
  isLoading: boolean;
}

const deviationReasonOptions = Object.entries(DeviationReason).map(
  ([label, value]) => ({
    label: label
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase()),
    value,
  })
);

const complexityTagOptions = Object.values(ComplexityTag);

export function FeedbackForm({
  taskId,
  onSubmit,
  isLoading,
}: FeedbackFormProps) {
  const ratingId = useId();
  const form = useForm<Omit<CreateFeedbackDto, 'taskId'>>({
    initialValues: {
      actualHours: 0,
      rating: 0,
      comment: '',
      reasonForDeviation: undefined,
      deviationComment: '',
      missedComplexityTags: [],
    },
    validate: {
      actualHours: (value) =>
        value <= 0 ? 'Actual hours must be positive' : null,
      rating: (value) => (value === 0 ? 'Please provide a rating' : null),
      reasonForDeviation: (value, values) =>
        values.actualHours > 0 && !value
          ? 'Please select a reason for the deviation'
          : null,
    },
  });

  const handleSubmit = (values: Omit<CreateFeedbackDto, 'taskId'>) => {
    onSubmit({ ...values, taskId });
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="lg">
        <Title order={4}>Submit Feedback</Title>

        <NumberInput
          label="Actual Hours Spent"
          description="How long did this task actually take?"
          {...form.getInputProps('actualHours')}
          min={0.1}
          step={0.25}
          required
        />

        <Stack gap={2}>
          <Title order={5} id={ratingId}>
            Accuracy rating
          </Title>
          <Rating
            aria-labelledby={ratingId}
            getSymbolLabel={(value) => `${value} out of 5`}
            {...form.getInputProps('rating')}
          />
          {form.errors.rating && (
            <Text size="xs" c="red" role="alert">
              {form.errors.rating}
            </Text>
          )}
        </Stack>

        <Textarea
          label="General Comment (Optional)"
          placeholder="Any general thoughts on the task..."
          {...form.getInputProps('comment')}
        />

        <Divider label="Deviation Analysis" labelPosition="center" />

        <Select
          label="Primary Reason for Deviation"
          placeholder="Why was the estimate different from the actual time?"
          data={deviationReasonOptions}
          {...form.getInputProps('reasonForDeviation')}
          required
        />

        <Textarea
          label="Deviation Comment (Optional)"
          placeholder="e.g., 'The legacy module had no tests and was tightly coupled.'"
          {...form.getInputProps('deviationComment')}
        />

        <MultiSelect
          label="Missed Complexity Factors (Optional)"
          placeholder="Select any factors not included in the original estimate"
          data={complexityTagOptions}
          {...form.getInputProps('missedComplexityTags')}
          searchable
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
