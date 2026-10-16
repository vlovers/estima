import { Project } from '../../types';

export const complexityColors: Record<Project['complexity'], string> = {
  LOW: 'brand',
  MEDIUM: 'blue',
  HIGH: 'orange',
};
export const complexityLabels: Record<Project['complexity'], string> = {
  LOW: 'Low complexity',
  MEDIUM: 'Medium complexity',
  HIGH: 'High complexity',
};
