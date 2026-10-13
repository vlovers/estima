export interface LoginCredentials {
  password: string;
  email: string;
}

export type RegisterCredentials = LoginCredentials;

export interface User {
  id: string;
  email: string;
}

export interface Estimate {
  managerExplanation?: string;
  confidence: number | null;
  explanation: string | null;
  finalEstimate: number;
  manualEstimate?: number | null;
  source: 'ai' | 'manual' | 'ai_subtask_sum' | 'final';
  id: string;
  // Structured fields from backend (optional)
  p10?: number | null;
  p50?: number | null;
  p90?: number | null;
  topDown?: number | null;
  bottomUp?: number | null;
  divergencePct?: number | null; // 0..200
  logs?: string | null; // plain text lines separated by \n
}

export interface EstimateFeedback {
  actualHours: number;
  id: string;
}

export interface Clarification {
  question: string;
  answer: string;
}

export interface Task {
  feedbacks: EstimateFeedback[];
  experienceLevel: 'JUNIOR' | 'MIDDLE' | 'SENIOR';
  estimates: Estimate[];
  technology: string;
  description: string;
  children?: Task[];
  subtasks?: Task[];
  tags: string[];
  title: string;
  id: string;
  projectId?: string;
  riskAnalysis?: { risk: string; mitigation: string }[];
  // Align with backend enum values (lowercase strings)
  status: 'estimated' | 'pending_clarification';
  clarificationHistory?: Clarification[];
  manualEstimate?: number;
  useAiEstimate?: boolean;
  breakdown?: boolean;
  acceptanceCriteria?: string[];
  assumptions?: string[];
  constraints?: string[];
  nfrs?: NfrDto[];
  integrations?: IntegrationDto[];
  testing?: TestingDto;
  documentation?: DocumentationDto;
  complexityTags?: ComplexityTag[];
  uiDesignComplexity?: UiDesignComplexity;
  needsDataMigration?: boolean;
  migrationComplexity?: MigrationComplexity;
  generateManagerNote?: boolean;
  generateRiskAnalysis?: boolean;
}

export interface Project {
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  overhead: number;
  description: string;
  tasks: Task[];
  name: string;
  id: string;
}

export type NfrCategory =
  | 'performance'
  | 'reliability'
  | 'security'
  | 'scalability'
  | 'usability'
  | 'observability'
  | 'compliance'
  | 'maintainability'
  | 'cost';

export interface NfrDto {
  category: NfrCategory;
  requirement: string;
  target?: string;
}

export type IntegrationType = 'internal' | 'external' | 'third_party';
export type IntegrationInteraction = 'read' | 'write' | 'read_write';
export type IntegrationAuth = 'none' | 'api_key' | 'oauth' | 'saml' | 'basic';

export interface IntegrationDto {
  name: string;
  type?: IntegrationType;
  interaction: IntegrationInteraction;
  auth?: IntegrationAuth;
  sandbox?: boolean;
}

export interface TestingDto {
  unit?: boolean;
  integration?: boolean;
  e2e?: boolean;
  unitCoverageTarget?: number; // 0..100
  performance?: boolean;
  security?: boolean;
}

export interface DocumentationDto {
  userDocs?: boolean;
  apiDocs?: boolean;
  readme?: boolean;
  changelog?: boolean;
}

export type UiDesignComplexity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type MigrationComplexity = 'LOW' | 'MEDIUM' | 'HIGH';

export enum ComplexityTag {
  NEW_INFRA = 'new_infra',
  LEGACY_CODE = 'legacy_code',
  REFACTOR = 'refactor',
  MIGRATION = 'migration',
  THIRD_PARTY_INTEGRATION = 'third_party_integration',
  CONCURRENCY = 'concurrency',
  DATA_MODELING = 'data_modeling',
  AI_INTEGRATION = 'ai_integration',
  SECURITY_HARDENING = 'security_hardening',
  PERFORMANCE_CRITICAL = 'performance_critical',
}

export interface CreateTaskDto {
  experienceLevel: 'JUNIOR' | 'MIDDLE' | 'SENIOR';
  manualEstimate?: number;
  useAiEstimate: boolean;
  breakdown: boolean;
  technology: string;
  description: string;
  projectId: string;
  tags: string[];
  title: string;
  // Structured inputs (optional)
  acceptanceCriteria?: string[];
  assumptions?: string[];
  constraints?: string[];
  nfrs?: NfrDto[];
  integrations?: IntegrationDto[];
  testing?: TestingDto;
  documentation?: DocumentationDto;
  complexityTags?: ComplexityTag[];
  uiDesignComplexity?: UiDesignComplexity;
  needsDataMigration?: boolean;
  migrationComplexity?: MigrationComplexity;
  // Optional generation flags supported by backend
  generateManagerNote?: boolean;
  generateRiskAnalysis?: boolean;
}

export interface UpdateTaskDto {
  id?: string;
  experienceLevel?: 'JUNIOR' | 'MIDDLE' | 'SENIOR';
  manualEstimate?: number;
  useAiEstimate?: boolean;
  breakdown?: boolean;
  technology?: string;
  description?: string;
  tags?: string[];
  title?: string;
  acceptanceCriteria?: string[];
  assumptions?: string[];
  constraints?: string[];
  nfrs?: NfrDto[];
  integrations?: IntegrationDto[];
  testing?: TestingDto;
  documentation?: DocumentationDto;
  complexityTags?: ComplexityTag[];
  uiDesignComplexity?: UiDesignComplexity;
  needsDataMigration?: boolean;
  migrationComplexity?: MigrationComplexity;
  generateManagerNote?: boolean;
  generateRiskAnalysis?: boolean;
}

export interface CreateManualEstimateDto {
  taskId: string;
  hours: number;
}

export enum DeviationReason {
  UNFORESEEN_TECHNICAL_COMPLEXITY = 'UNFORESEEN_TECHNICAL_COMPLEXITY',
  SCOPE_CREEP = 'SCOPE_CREEP',
  INCORRECT_INITIAL_ASSUMPTIONS = 'INCORRECT_INITIAL_ASSUMPTIONS',
  ENVIRONMENT_OR_TOOLING_ISSUES = 'ENVIRONMENT_OR_TOOLING_ISSUES',
  EXTERNAL_DEPENDENCY_DELAY = 'EXTERNAL_DEPENDENCY_DELAY',
  ESTIMATE_WAS_ACCURATE = 'ESTIMATE_WAS_ACCURATE',
  OTHER = 'OTHER',
}

export interface CreateFeedbackDto {
  actualHours: number;
  taskId: string;
  rating?: number;
  comment?: string;
  reasonForDeviation?: DeviationReason;
  deviationComment?: string;
  missedComplexityTags?: string[];
}
