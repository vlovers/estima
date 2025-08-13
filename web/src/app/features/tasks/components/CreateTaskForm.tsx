import { useCreateTaskMutation } from '../hooks/tasks.hooks';
import { CreateTaskDto } from '../../../types';
import { useState } from 'react';

import {
  SegmentedControl,
  NumberInput,
  MultiSelect,
  TagsInput,
  TextInput,
  Textarea,
  Fieldset,
  Divider,
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
  generateManagerNote: false,
  generateRiskAnalysis: false,
  acceptanceCriteria: [],
  assumptions: [],
  constraints: [],
  testing: {
    unit: true,
    integration: false,
    e2e: false,
    unitCoverageTarget: 0,
    performance: false,
    security: false,
  },
  documentation: {
    userDocs: false,
    apiDocs: false,
    readme: false,
    changelog: false,
  },
  complexityTags: [],
  uiDesignComplexity: 'NONE',
  needsDataMigration: false,
  migrationComplexity: 'LOW',
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

  const handleNestedChange = (
    parent: 'testing' | 'documentation',
    field: string,
    value: any
  ) => {
    setFormValues((prev) => ({
      ...prev,
      [parent]: {
        ...(prev as any)[parent],
        [field]: value,
      },
    }));
  };

  const complexityTagOptions = [
    { value: 'new_infra', label: 'New Infra' },
    { value: 'legacy_code', label: 'Legacy Code' },
    { value: 'refactor', label: 'Refactor' },
    { value: 'migration', label: 'Migration' },
    { value: 'third_party_integration', label: '3rd-party Integration' },
    { value: 'concurrency', label: 'Concurrency' },
    { value: 'data_modeling', label: 'Data Modeling' },
    { value: 'ai_integration', label: 'AI Integration' },
    { value: 'security_hardening', label: 'Security Hardening' },
    { value: 'performance_critical', label: 'Performance Critical' },
  ];

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
              <TagsInput
                label="Tags"
                placeholder="e.g., security, frontend"
                value={formValues.tags}
                onChange={(value) => handleFormChange('tags', value)}
                clearable
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
              <Divider my="md" />
              <Fieldset legend="Structured inputs (optional)">
                <TagsInput
                  label="Acceptance Criteria"
                  placeholder="Add items"
                  value={formValues.acceptanceCriteria || []}
                  onChange={(value) =>
                    handleFormChange('acceptanceCriteria', value)
                  }
                  clearable
                />
                <TagsInput
                  label="Assumptions"
                  placeholder="Add items"
                  value={formValues.assumptions || []}
                  onChange={(value) => handleFormChange('assumptions', value)}
                  clearable
                />
                <TagsInput
                  label="Constraints"
                  placeholder="Add items"
                  value={formValues.constraints || []}
                  onChange={(value) => handleFormChange('constraints', value)}
                  clearable
                />

                <MultiSelect
                  label="Complexity Tags"
                  data={complexityTagOptions}
                  searchable
                  clearable
                  value={formValues.complexityTags || []}
                  onChange={(value) => handleFormChange('complexityTags', value)}
                />

                <Group grow>
                  <Select
                    label="UI Design Complexity"
                    data={['NONE', 'LOW', 'MEDIUM', 'HIGH']}
                    value={formValues.uiDesignComplexity}
                    onChange={(value) =>
                      handleFormChange('uiDesignComplexity', value)
                    }
                  />
                  <Switch
                    label="Needs Data Migration"
                    checked={!!formValues.needsDataMigration}
                    onChange={(e) =>
                      handleFormChange('needsDataMigration', e.currentTarget.checked)
                    }
                  />
                  <Select
                    label="Migration Complexity"
                    data={['LOW', 'MEDIUM', 'HIGH']}
                    value={formValues.migrationComplexity}
                    onChange={(value) =>
                      handleFormChange('migrationComplexity', value)
                    }
                    disabled={!formValues.needsDataMigration}
                  />
                </Group>

                <Divider my="sm" label="Testing" />
                <Group grow>
                  <Switch
                    label="Unit Tests"
                    checked={!!formValues.testing?.unit}
                    onChange={(e) =>
                      handleNestedChange('testing', 'unit', e.currentTarget.checked)
                    }
                  />
                  <NumberInput
                    label="Unit Coverage Target (%)"
                    min={0}
                    max={100}
                    value={formValues.testing?.unitCoverageTarget}
                    onChange={(value) =>
                      handleNestedChange('testing', 'unitCoverageTarget', value)
                    }
                  />
                </Group>
                <Group grow>
                  <Switch
                    label="Integration Tests"
                    checked={!!formValues.testing?.integration}
                    onChange={(e) =>
                      handleNestedChange(
                        'testing',
                        'integration',
                        e.currentTarget.checked
                      )
                    }
                  />
                  <Switch
                    label="E2E Tests"
                    checked={!!formValues.testing?.e2e}
                    onChange={(e) =>
                      handleNestedChange('testing', 'e2e', e.currentTarget.checked)
                    }
                  />
                </Group>
                <Group grow>
                  <Switch
                    label="Performance Testing"
                    checked={!!formValues.testing?.performance}
                    onChange={(e) =>
                      handleNestedChange(
                        'testing',
                        'performance',
                        e.currentTarget.checked
                      )
                    }
                  />
                  <Switch
                    label="Security Testing"
                    checked={!!formValues.testing?.security}
                    onChange={(e) =>
                      handleNestedChange('testing', 'security', e.currentTarget.checked)
                    }
                  />
                </Group>

                <Divider my="sm" label="Documentation" />
                <Group grow>
                  <Switch
                    label="User Docs"
                    checked={!!formValues.documentation?.userDocs}
                    onChange={(e) =>
                      handleNestedChange(
                        'documentation',
                        'userDocs',
                        e.currentTarget.checked
                      )
                    }
                  />
                  <Switch
                    label="API Docs"
                    checked={!!formValues.documentation?.apiDocs}
                    onChange={(e) =>
                      handleNestedChange(
                        'documentation',
                        'apiDocs',
                        e.currentTarget.checked
                      )
                    }
                  />
                </Group>
                <Group grow>
                  <Switch
                    label="README"
                    checked={!!formValues.documentation?.readme}
                    onChange={(e) =>
                      handleNestedChange('documentation', 'readme', e.currentTarget.checked)
                    }
                  />
                  <Switch
                    label="Changelog"
                    checked={!!formValues.documentation?.changelog}
                    onChange={(e) =>
                      handleNestedChange(
                        'documentation',
                        'changelog',
                        e.currentTarget.checked
                      )
                    }
                  />
                </Group>

                <Divider my="sm" />
                <Textarea
                  label="NFRs (use JSON tab for detailed entries)"
                  description="Tip: switch to JSON mode to provide an array of { category, requirement, target? }"
                  placeholder="Use JSON tab"
                  disabled
                />
                <Textarea
                  label="Integrations (use JSON tab for detailed entries)"
                  description="Tip: switch to JSON mode to provide an array of { name, type?, interaction, auth?, sandbox? }"
                  placeholder="Use JSON tab"
                  disabled
                />
              </Fieldset>
              <Group grow>
                <Switch
                  label="Generate Manager's Note"
                  checked={formValues.generateManagerNote}
                  onChange={(event) =>
                    handleFormChange(
                      'generateManagerNote',
                      event.currentTarget.checked
                    )
                  }
                />
                <Switch
                  label="Generate Risk Analysis"
                  checked={formValues.generateRiskAnalysis}
                  onChange={(event) =>
                    handleFormChange(
                      'generateRiskAnalysis',
                      event.currentTarget.checked
                    )
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
