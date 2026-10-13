import { useUpdateTaskMutation } from '../hooks/tasks.hooks';
import { Task, UpdateTaskDto } from '../../../types';
import { useEffect, useState } from 'react';

import {
  MultiSelect,
  TextInput,
  Textarea,
  Switch,
  Button,
  Select,
  Stack,
  Group,
  Accordion,
  TagsInput,
  Divider,
  NumberInput,
  Paper,
} from '@mantine/core';

interface EditTaskFormProps {
  task: Task;
  projectId: string;
  onSuccess: () => void;
}

export function EditTaskForm({ task, projectId, onSuccess }: EditTaskFormProps) {
  const [formValues, setFormValues] = useState<Partial<UpdateTaskDto>>({});

  useEffect(() => {
    if (task) {
      setFormValues({
        id: task.id,
        title: task.title,
        description: task.description,
        technology: task.technology,
        experienceLevel: task.experienceLevel,
        tags: task.tags || [],
        useAiEstimate: task.useAiEstimate ?? true,
        manualEstimate: task.manualEstimate,
        acceptanceCriteria: task.acceptanceCriteria || [],
        assumptions: task.assumptions || [],
        constraints: task.constraints || [],
        complexityTags: task.complexityTags || [],
        testing: task.testing || { unit: true, integration: false, e2e: false, unitCoverageTarget: 0, performance: false, security: false },
        documentation: task.documentation || { userDocs: false, apiDocs: false, readme: false, changelog: false },
        uiDesignComplexity: task.uiDesignComplexity || 'NONE',
        migrationComplexity: task.migrationComplexity || 'LOW',
        needsDataMigration: task.needsDataMigration || false,
        breakdown: task.breakdown || false,
        generateManagerNote: task.generateManagerNote || false,
        generateRiskAnalysis: task.generateRiskAnalysis || false,
      });
    }
  }, [task]);

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

  const updateMutation = useUpdateTaskMutation(projectId);

  const handleFormChange = (field: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleNestedChange = (
    parent: 'testing' | 'documentation',
    field: string,
    value: any
  ) => {
    setFormValues((prev: any) => ({
      ...prev,
      [parent]: {
        ...prev[parent],
        [field]: value,
      },
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formValues.id) return;

    updateMutation.mutate({ ...formValues, id: formValues.id }, {
      onSuccess: () => {
        onSuccess();
      },
    });
  };

  return (
    <Paper withBorder shadow="md" p="md" radius="md" mt="lg" mb="xl">
      <form onSubmit={handleSubmit}>
        <Stack>
          <Accordion defaultValue="main" variant="separated">
            <Accordion.Item value="main">
              <Accordion.Control>Main details</Accordion.Control>
              <Accordion.Panel>
                <Stack>
                  <TextInput
                    withAsterisk
                    label="Title"
                    value={formValues.title || ''}
                    onChange={(e) => handleFormChange('title', e.target.value)}
                  />
                  <Textarea
                    mt="sm"
                    label="Description"
                    value={formValues.description || ''}
                    onChange={(e) => handleFormChange('description', e.target.value)}
                    minRows={4}
                  />
                  <TextInput
                    mt="sm"
                    withAsterisk
                    label="Technology"
                    value={formValues.technology || ''}
                    onChange={(e) => handleFormChange('technology', e.target.value)}
                  />
                  <Select
                    mt="sm"
                    withAsterisk
                    label="Experience Level"
                    data={['JUNIOR', 'MIDDLE', 'SENIOR']}
                    value={formValues.experienceLevel || 'MIDDLE'}
                    onChange={(value) => handleFormChange('experienceLevel', value)}
                  />
                  <TagsInput
                    mt="sm"
                    label="Tags"
                    placeholder="e.g., security, frontend"
                    value={formValues.tags || []}
                    onChange={(value) => handleFormChange('tags', value)}
                    clearable
                  />
                  <Group grow mt="sm">
                    <Switch
                      label="Use AI Estimate"
                      checked={formValues.useAiEstimate ?? true}
                      onChange={(event) =>
                        handleFormChange(
                          'useAiEstimate',
                          event.currentTarget.checked
                        )
                      }
                    />
                    <Switch
                      label="Breakdown Task"
                      checked={formValues.breakdown ?? false}
                      onChange={(event) =>
                        handleFormChange('breakdown', event.currentTarget.checked)
                      }
                    />
                  </Group>
                  <NumberInput
                    mt="sm"
                    label="Manual Estimate (hours)"
                    placeholder="Enter manual estimate"
                    value={formValues.manualEstimate}
                    onChange={(value) => handleFormChange('manualEstimate', value)}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="advanced">
              <Accordion.Control>Structured inputs (optional)</Accordion.Control>
              <Accordion.Panel>
                <Stack>
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
                    mt="sm"
                    label="Assumptions"
                    placeholder="Add items"
                    value={formValues.assumptions || []}
                    onChange={(value) => handleFormChange('assumptions', value)}
                    clearable
                  />
                  <TagsInput
                    mt="sm"
                    label="Constraints"
                    placeholder="Add items"
                    value={formValues.constraints || []}
                    onChange={(value) => handleFormChange('constraints', value)}
                    clearable
                  />

                  <MultiSelect
                    mt="sm"
                    label="Complexity Tags"
                    data={complexityTagOptions}
                    searchable
                    clearable
                    value={formValues.complexityTags || []}
                    onChange={(value) => handleFormChange('complexityTags', value)}
                  />

                  <Group grow mt="sm">
                    <Select
                      label="UI Design Complexity"
                      data={['NONE', 'LOW', 'MEDIUM', 'HIGH']}
                      value={formValues.uiDesignComplexity || 'NONE'}
                      onChange={(value) =>
                        handleFormChange('uiDesignComplexity', value)
                      }
                    />
                    <Switch
                      label="Needs Data Migration"
                      checked={formValues.needsDataMigration || false}
                      onChange={(e) =>
                        handleFormChange('needsDataMigration', e.currentTarget.checked)
                      }
                    />
                    <Select
                      label="Data Migration Complexity"
                      data={['LOW', 'MEDIUM', 'HIGH']}
                      value={formValues.migrationComplexity || 'LOW'}
                      onChange={(value) =>
                        handleFormChange('migrationComplexity', value)
                      }
                      disabled={!formValues.needsDataMigration}
                    />
                  </Group>

                  <Divider my="sm" label="Testing" mt="md" />
                  <Group grow mt="sm">
                    <Switch
                      label="Unit Tests"
                      checked={formValues.testing?.unit || false}
                      onChange={(e) =>
                        handleNestedChange(
                          'testing',
                          'unit',
                          e.currentTarget.checked
                        )
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
                  <Group grow mt="sm">
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
                  <Group grow mt="sm">
                    <Switch
                      label="Performance Tests"
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
                      label="Security Tests"
                      checked={!!formValues.testing?.security}
                      onChange={(e) =>
                        handleNestedChange(
                          'testing',
                          'security',
                          e.currentTarget.checked
                        )
                      }
                    />
                  </Group>

                  <Divider my="sm" label="Documentation" mt="md" />
                  <Group grow mt="sm">
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
                  <Group grow mt="sm">
                    <Switch
                      label="README"
                      checked={!!formValues.documentation?.readme}
                      onChange={(e) =>
                        handleNestedChange(
                          'documentation',
                          'readme',
                          e.currentTarget.checked
                        )
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
                  <Divider my="sm" label="AI Generation" mt="md" />
                  <Group grow mt="sm">
                    <Switch
                      label="Generate Manager's Note"
                      checked={formValues.generateManagerNote ?? false}
                      onChange={(event) =>
                        handleFormChange(
                          'generateManagerNote',
                          event.currentTarget.checked
                        )
                      }
                    />
                    <Switch
                      label="Generate Risk Analysis"
                      checked={formValues.generateRiskAnalysis ?? false}
                      onChange={(event) =>
                        handleFormChange(
                          'generateRiskAnalysis',
                          event.currentTarget.checked
                        )
                      }
                    />
                  </Group>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          <Group justify="flex-end" mt="md">
            <Button type="submit" loading={updateMutation.isPending}>
              Save Changes
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}
