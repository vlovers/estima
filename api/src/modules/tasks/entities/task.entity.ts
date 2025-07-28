import { EstimateFeedback } from '../../estimate-feedback/entities/estimate-feedback.entity';
import { Estimate } from '../../estimates/entities/estimate.entity';
import { Project } from '../../projects/entities/project.entity';
import { ExperienceLevel } from './experience-level.enum';

import {
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  Column,
  Entity,
} from 'typeorm';

export enum TaskStatus {
  PENDING_CLARIFICATION = 'pending_clarification',
  ESTIMATED = 'estimated',
}

@Entity({ name: 'tasks' })
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  technology: string;

  @Column({
    type: 'enum',
    enum: ExperienceLevel,
    nullable: true,
  })
  experienceLevel: ExperienceLevel;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true, default: [] })
  riskAnalysis: { risk: string; mitigation: string }[];

  @Column({ type: 'boolean', default: true })
  breakdown: boolean;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.ESTIMATED,
  })
  status: TaskStatus;

  @Column({ type: 'jsonb', nullable: true })
  clarificationHistory: { question: string; answer: string }[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Project, (project) => project.tasks, { onDelete: 'CASCADE' })
  project: Project;

  @OneToMany(() => Estimate, (estimate) => estimate.task, {
    cascade: true,
    eager: true,
  })
  estimates: Estimate[];

  @ManyToOne(() => Task, (task) => task.subtasks, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  parentTask: Task;

  @OneToMany(() => Task, (task) => task.parentTask, {
    cascade: true,
  })
  subtasks: Task[];

  @OneToMany(() => EstimateFeedback, (feedback) => feedback.task)
  feedbacks: EstimateFeedback[];
}
