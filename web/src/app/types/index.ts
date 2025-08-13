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
  experienceLevel: string;
  estimates: Estimate[];
  technology: string;
  description: string;
  children?: Task[];
  tags: string[];
  title: string;
  id: string;
  riskAnalysis?: { risk: string; mitigation: string }[];
  // Align with backend enum values (lowercase strings)
  status: 'estimated' | 'pending_clarification';
  clarificationHistory?: Clarification[];
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
export type ComplexityTag =
  | 'new_infra'
  | 'legacy_code'
  | 'refactor'
  | 'migration'
  | 'third_party_integration'
  | 'concurrency'
  | 'data_modeling'
  | 'ai_integration'
  | 'security_hardening'
  | 'performance_critical';

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
  experienceLevel?: 'JUNIOR' | 'MIDDLE' | 'SENIOR';
  technology?: string;
  description?: string;
  tags?: string[];
  title?: string;
}

export interface CreateFeedbackDto {
  actualHours: number;
  taskId: string;
}
