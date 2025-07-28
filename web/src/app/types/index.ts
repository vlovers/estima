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
  source: 'ai' | 'manual';
  id: string;
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
  status: 'ESTIMATED' | 'PENDING_CLARIFICATION';
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
