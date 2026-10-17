import { FormEvent, useState } from 'react';
import {
  Accordion,
  ActionIcon,
  Alert,
  Button,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import {
  ComplexityTag,
  CreateTaskDto,
  IntegrationAuth,
  IntegrationInteraction,
  IntegrationType,
  NfrCategory,
  Task,
} from '../../../types';
import { errorMessage } from '../../../utils/errors';
import { manualHours } from '../../../utils/estimation';

type TaskDraft = Omit<CreateTaskDto, 'projectId' | 'manualEstimate'> & {
  manualEstimate: number | '';
};
export type TaskFormSubmission = Omit<CreateTaskDto, 'projectId'>;
function initialTaskDraft(task?: Task): TaskDraft {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    technology: task?.technology ?? '',
    experienceLevel: task?.experienceLevel ?? 'MIDDLE',
    tags: task?.tags ?? [],
    useAiEstimate: task?.useAiEstimate ?? true,
    breakdown: task?.breakdown ?? false,
    manualEstimate: (task ? manualHours(task) : undefined) ?? '',
    acceptanceCriteria: task?.acceptanceCriteria ?? [],
    assumptions: task?.assumptions ?? [],
    constraints: task?.constraints ?? [],
    complexityTags: task?.complexityTags ?? [],
    nfrs: task?.nfrs ?? [],
    integrations: task?.integrations ?? [],
    testing: task?.testing ?? {
      unit: true,
      integration: false,
      e2e: false,
      unitCoverageTarget: 0,
      performance: false,
      security: false,
    },
    documentation: task?.documentation ?? {
      userDocs: false,
      apiDocs: false,
      readme: false,
      changelog: false,
    },
    uiDesignComplexity: task?.uiDesignComplexity ?? 'NONE',
    needsDataMigration: task?.needsDataMigration ?? false,
    migrationComplexity: task?.migrationComplexity ?? 'LOW',
    generateManagerNote: task?.generateManagerNote ?? false,
    generateRiskAnalysis: task?.generateRiskAnalysis ?? false,
  };
}
interface TaskFormProps {
  task?: Task;
  onSubmit: (values: TaskFormSubmission) => void;
  onCancel?: () => void;
  isPending: boolean;
  error: unknown;
}
export function TaskForm({
  task,
  onSubmit,
  onCancel,
  isPending,
  error,
}: TaskFormProps) {
  const [values, setValues] = useState(() => initialTaskDraft(task));
  const [validation, setValidation] = useState('');
  const [sections, setSections] = useState<string[]>([]);
  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    if (
      ![values.title, values.description, values.technology].every((value) =>
        value.trim()
      )
    ) {
      setValidation('Add a title, description and technology before saving.');
      return;
    }
    if (!task && !values.useAiEstimate && values.manualEstimate === '') {
      setValidation('Add a positive manual estimate or enable AI estimation.');
      return;
    }
    if (
      values.manualEstimate !== '' &&
      (!Number.isFinite(values.manualEstimate) || values.manualEstimate <= 0)
    ) {
      setValidation('The manual estimate must be greater than zero.');
      return;
    }
    if (
      values.nfrs?.some((item) => !item.requirement.trim()) ||
      values.integrations?.some((item) => !item.name.trim())
    ) {
      setValidation('Complete or remove empty requirements and integrations.');
      setSections((previous) => [...new Set([...previous, 'technical'])]);
      return;
    }
    setValidation('');
    const { manualEstimate, ...rest } = values;
    if (task && task.nfrs === undefined && !rest.nfrs?.length) delete rest.nfrs;
    if (task && task.integrations === undefined && !rest.integrations?.length)
      delete rest.integrations;
    onSubmit({ ...rest, ...(manualEstimate !== '' ? { manualEstimate } : {}) });
  };
  return (
    <form onSubmit={submit} aria-busy={isPending}>
      <fieldset className="form-fieldset" disabled={isPending}>
        <Stack gap="lg">
          <Text size="sm" c="dimmed">
            {task
              ? 'Update the scope and context for this task.'
              : 'Start with the essentials. Add more context when it matters.'}
          </Text>
          {(!!error || !!validation) && (
            <Alert color="red" role="alert" title="Task could not be saved">
              {validation || errorMessage(error, 'Please try again.')}
            </Alert>
          )}
          <TextInput
            label="Task title"
            placeholder="e.g. Build the customer onboarding flow"
            required
            value={values.title}
            onChange={(event) => set('title', event.currentTarget.value)}
          />
          <Textarea
            label="Description"
            description="Describe the outcome, scope and any important details."
            placeholder="What needs to happen? What does done look like?"
            required
            autosize
            minRows={4}
            maxRows={10}
            value={values.description}
            onChange={(event) => set('description', event.currentTarget.value)}
          />
          <div className="form-grid">
            <TextInput
              label="Technology"
              placeholder="e.g. React, NestJS, PostgreSQL"
              required
              value={values.technology}
              onChange={(event) => set('technology', event.currentTarget.value)}
            />
            <Select
              label="Experience level"
              allowDeselect={false}
              data={[
                { value: 'JUNIOR', label: 'Junior' },
                { value: 'MIDDLE', label: 'Mid-level' },
                { value: 'SENIOR', label: 'Senior' },
              ]}
              value={values.experienceLevel}
              onChange={(value) => {
                if (value)
                  set('experienceLevel', value as TaskDraft['experienceLevel']);
              }}
            />
          </div>
          <TagsInput
            label="Tags"
            placeholder="Add a tag and press Enter"
            value={values.tags}
            onChange={(value) => set('tags', value)}
            clearable
          />
          <div className="option-box">
            <Stack gap="md">
              <Switch
                label="Use AI estimate"
                checked={values.useAiEstimate}
                onChange={(event) =>
                  set('useAiEstimate', event.currentTarget.checked)
                }
              />
              <Switch
                label="Break down into subtasks"
                description="Request a more detailed view of the work."
                checked={values.breakdown}
                onChange={(event) =>
                  set('breakdown', event.currentTarget.checked)
                }
              />
              <NumberInput
                label="Manual estimate (hours)"
                description={
                  !task && !values.useAiEstimate
                    ? 'Required when AI estimation is off.'
                    : 'Optional. Keep your own estimate alongside the AI result.'
                }
                required={!task && !values.useAiEstimate}
                placeholder="e.g. 8"
                min={0.1}
                step={0.5}
                decimalScale={2}
                value={values.manualEstimate}
                onChange={(value) =>
                  set('manualEstimate', typeof value === 'number' ? value : '')
                }
              />
            </Stack>
          </div>
          <div className="form-section">
            <Text size="sm" fw={600}>
              Additional context
            </Text>
            <Text size="xs" c="dimmed" mt={4} mb="sm">
              Optional details to make the scope more specific.
            </Text>
            <Accordion
              multiple
              variant="default"
              value={sections}
              onChange={setSections}
            >
              <Accordion.Item value="scope">
                <Accordion.Control>Scope & assumptions</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="lg" pt="sm">
                    {(
                      [
                        ['acceptanceCriteria', 'Acceptance criteria'],
                        ['assumptions', 'Assumptions'],
                        ['constraints', 'Constraints'],
                      ] as const
                    ).map(([key, label]) => (
                      <TagsInput
                        key={key}
                        label={label}
                        placeholder="Add an item and press Enter"
                        value={values[key]}
                        onChange={(value) => set(key, value)}
                        clearable
                      />
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item value="technical">
                <Accordion.Control>Technical complexity</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="lg" pt="sm">
                    <MultiSelect
                      label="Complexity factors"
                      data={Object.values(ComplexityTag).map((value) => ({
                        value,
                        label: value.replace(/_/g, ' '),
                      }))}
                      value={values.complexityTags}
                      onChange={(value) =>
                        set('complexityTags', value as ComplexityTag[])
                      }
                      searchable
                      clearable
                    />
                    <Select
                      label="UI design complexity"
                      data={['NONE', 'LOW', 'MEDIUM', 'HIGH']}
                      allowDeselect={false}
                      value={values.uiDesignComplexity}
                      onChange={(value) =>
                        set(
                          'uiDesignComplexity',
                          value as TaskDraft['uiDesignComplexity']
                        )
                      }
                    />
                    <Switch
                      label="Needs data migration"
                      checked={values.needsDataMigration}
                      onChange={(event) =>
                        set('needsDataMigration', event.currentTarget.checked)
                      }
                    />
                    {values.needsDataMigration && (
                      <Select
                        label="Data migration complexity"
                        data={['LOW', 'MEDIUM', 'HIGH']}
                        allowDeselect={false}
                        value={values.migrationComplexity}
                        onChange={(value) =>
                          set(
                            'migrationComplexity',
                            value as TaskDraft['migrationComplexity']
                          )
                        }
                      />
                    )}
                    <Text fw={600} size="sm">
                      Non-functional requirements
                    </Text>
                    {values.nfrs?.map((nfr, index) => (
                      <Stack className="option-box" key={index}>
                        <Group justify="space-between">
                          <Text size="xs">Requirement {index + 1}</Text>
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            aria-label={`Remove requirement ${index + 1}`}
                            onClick={() =>
                              set(
                                'nfrs',
                                values.nfrs?.filter((_, i) => i !== index)
                              )
                            }
                          >
                            <IconTrash size={15} />
                          </ActionIcon>
                        </Group>
                        <Select
                          label={`Requirement ${index + 1} category`}
                          data={[
                            'performance',
                            'security',
                            'scalability',
                            'reliability',
                            'usability',
                            'maintainability',
                            'observability',
                            'compliance',
                            'cost',
                          ]}
                          value={nfr.category}
                          allowDeselect={false}
                          onChange={(value) =>
                            set(
                              'nfrs',
                              values.nfrs?.map((item, i) =>
                                i === index
                                  ? { ...item, category: value as NfrCategory }
                                  : item
                              )
                            )
                          }
                        />
                        <TextInput
                          label={`Requirement ${index + 1} description`}
                          value={nfr.requirement}
                          onChange={(event) =>
                            set(
                              'nfrs',
                              values.nfrs?.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      requirement: event.currentTarget.value,
                                    }
                                  : item
                              )
                            )
                          }
                        />
                        <TextInput
                          label={`Requirement ${index + 1} target (optional)`}
                          value={nfr.target ?? ''}
                          onChange={(event) =>
                            set(
                              'nfrs',
                              values.nfrs?.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      target: event.currentTarget.value,
                                    }
                                  : item
                              )
                            )
                          }
                        />
                      </Stack>
                    ))}
                    <Button
                      variant="default"
                      size="xs"
                      leftSection={<IconPlus size={14} />}
                      onClick={() =>
                        set('nfrs', [
                          ...(values.nfrs ?? []),
                          { category: 'performance', requirement: '' },
                        ])
                      }
                    >
                      Add requirement
                    </Button>
                    <Text fw={600} size="sm">
                      Integrations
                    </Text>
                    {values.integrations?.map((integration, index) => (
                      <Stack className="option-box" key={index}>
                        <Group justify="space-between">
                          <Text size="xs">Integration {index + 1}</Text>
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            aria-label={`Remove integration ${index + 1}`}
                            onClick={() =>
                              set(
                                'integrations',
                                values.integrations?.filter(
                                  (_, i) => i !== index
                                )
                              )
                            }
                          >
                            <IconTrash size={15} />
                          </ActionIcon>
                        </Group>
                        <TextInput
                          label={`Integration ${index + 1} name`}
                          value={integration.name}
                          onChange={(event) =>
                            set(
                              'integrations',
                              values.integrations?.map((item, i) =>
                                i === index
                                  ? { ...item, name: event.currentTarget.value }
                                  : item
                              )
                            )
                          }
                        />
                        <div className="form-grid">
                          <Select
                            label={`Integration ${index + 1} type`}
                            data={['internal', 'external', 'third_party']}
                            value={integration.type ?? 'third_party'}
                            allowDeselect={false}
                            onChange={(value) =>
                              set(
                                'integrations',
                                values.integrations?.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        type: value as IntegrationType,
                                      }
                                    : item
                                )
                              )
                            }
                          />
                          <Select
                            label={`Integration ${index + 1} interaction`}
                            data={['read', 'write', 'read_write']}
                            value={integration.interaction}
                            allowDeselect={false}
                            onChange={(value) =>
                              set(
                                'integrations',
                                values.integrations?.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        interaction:
                                          value as IntegrationInteraction,
                                      }
                                    : item
                                )
                              )
                            }
                          />
                        </div>
                        <Select
                          label={`Integration ${index + 1} authentication`}
                          data={['none', 'api_key', 'oauth', 'saml', 'basic']}
                          value={integration.auth ?? 'none'}
                          allowDeselect={false}
                          onChange={(value) =>
                            set(
                              'integrations',
                              values.integrations?.map((item, i) =>
                                i === index
                                  ? { ...item, auth: value as IntegrationAuth }
                                  : item
                              )
                            )
                          }
                        />
                        <Switch
                          label={`Sandbox available for integration ${
                            index + 1
                          }`}
                          checked={integration.sandbox ?? false}
                          onChange={(event) =>
                            set(
                              'integrations',
                              values.integrations?.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      sandbox: event.currentTarget.checked,
                                    }
                                  : item
                              )
                            )
                          }
                        />
                      </Stack>
                    ))}
                    <Button
                      variant="default"
                      size="xs"
                      leftSection={<IconPlus size={14} />}
                      onClick={() =>
                        set('integrations', [
                          ...(values.integrations ?? []),
                          { name: '', interaction: 'read_write' },
                        ])
                      }
                    >
                      Add integration
                    </Button>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item value="quality">
                <Accordion.Control>Testing & documentation</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="lg" pt="sm">
                    <Text size="xs" c="dimmed">
                      Include the delivery work that belongs in your estimate.
                    </Text>
                    <div className="form-grid">
                      {(
                        [
                          ['unit', 'Unit tests'],
                          ['integration', 'Integration tests'],
                          ['e2e', 'End-to-end tests'],
                          ['performance', 'Performance tests'],
                          ['security', 'Security tests'],
                        ] as const
                      ).map(([key, label]) => (
                        <Switch
                          key={key}
                          label={label}
                          checked={values.testing?.[key] ?? false}
                          onChange={(event) =>
                            set('testing', {
                              ...values.testing,
                              [key]: event.currentTarget.checked,
                            })
                          }
                        />
                      ))}
                    </div>
                    <NumberInput
                      label="Unit coverage target (%)"
                      min={0}
                      max={100}
                      value={values.testing?.unitCoverageTarget ?? 0}
                      onChange={(value) =>
                        set('testing', {
                          ...values.testing,
                          unitCoverageTarget:
                            typeof value === 'number' ? value : 0,
                        })
                      }
                    />
                    <Text fw={600} size="sm">
                      Documentation
                    </Text>
                    <div className="form-grid">
                      {(
                        [
                          ['userDocs', 'User documentation'],
                          ['apiDocs', 'API documentation'],
                          ['readme', 'README'],
                          ['changelog', 'Changelog'],
                        ] as const
                      ).map(([key, label]) => (
                        <Switch
                          key={key}
                          label={label}
                          checked={values.documentation?.[key] ?? false}
                          onChange={(event) =>
                            set('documentation', {
                              ...values.documentation,
                              [key]: event.currentTarget.checked,
                            })
                          }
                        />
                      ))}
                    </div>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item value="outputs">
                <Accordion.Control>AI explanation options</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="lg" pt="sm">
                    <Text size="xs" c="dimmed">
                      Request additional context. Generated content is shown
                      only when returned.
                    </Text>
                    <Switch
                      label="Generate manager's note"
                      checked={values.generateManagerNote}
                      onChange={(event) =>
                        set('generateManagerNote', event.currentTarget.checked)
                      }
                    />
                    <Switch
                      label="Generate risk analysis"
                      checked={values.generateRiskAnalysis}
                      onChange={(event) =>
                        set('generateRiskAnalysis', event.currentTarget.checked)
                      }
                    />
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </div>
          {isPending && (
            <Text role="status" size="sm" c="dimmed">
              Saving your task. Estimation may take a moment…
            </Text>
          )}
          <div className="form-footer">
            {onCancel && (
              <Button variant="default" onClick={onCancel} disabled={isPending}>
                Cancel
              </Button>
            )}
            <Button type="submit" loading={isPending}>
              {task ? 'Save changes' : 'Create task'}
            </Button>
          </div>
        </Stack>
      </fieldset>
    </form>
  );
}
