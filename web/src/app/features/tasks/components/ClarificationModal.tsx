import { Modal, Button, Stack, Text, Textarea } from '@mantine/core';
import { Clarification, Task } from '../../../types';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';

interface ClarificationModalProps {
  opened: boolean;
  onClose: () => void;
  task: Task | null;
  onSubmit: (clarifications: Clarification[]) => void;
}

export function ClarificationModal({
  opened,
  onClose,
  task,
  onSubmit,
}: ClarificationModalProps) {
  const form = useForm({
    initialValues: {
      clarifications: task?.clarificationHistory || [],
    },
  });

  useEffect(() => {
    if (task) {
      form.setValues({
        clarifications: task.clarificationHistory || [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  if (!task) return null;

  const handleSubmit = (values: { clarifications: Clarification[] }) => {
    onSubmit(values.clarifications);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Provide Clarifications">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <Text>
            The AI needs more details to provide an accurate estimate. Please
            answer the following questions:
          </Text>
          {form.values.clarifications.map((field, index) => (
            <Stack key={index}>
              <Text fw={500}>{field.question}</Text>
              <Textarea
                placeholder="Your answer..."
                {...form.getInputProps(`clarifications.${index}.answer`)}
                disabled={!!field.answer} // Disable if already answered
              />
            </Stack>
          ))}
          <Button type="submit" mt="md">
            Submit Answers
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
