import { EstimateFeedback } from '../../estimate-feedback/entities/estimate-feedback.entity';
import { Estimate } from '../../estimates/entities/estimate.entity';
import { Project } from '../../projects/entities/project.entity';
import { ExperienceLevel } from './experience-level.enum';

import {
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToOne,
  Column,
  Entity,
} from 'typeorm';

export enum TaskStatus {
  TO_DO = 'TO_DO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
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

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.TO_DO,
  })
  status: TaskStatus;

  @ManyToOne(() => Project, (project) => project.tasks)
  project: Project;

  @OneToMany(() => Estimate, (estimate) => estimate.task)
  estimates: Estimate[];

  @ManyToOne(() => Task, (task) => task.subtasks, { nullable: true })
  parentTask: Task;

  @OneToMany(() => Task, (task) => task.parentTask)
  subtasks: Task[];

  @OneToMany(() => EstimateFeedback, (feedback) => feedback.task)
  feedbacks: EstimateFeedback[];
}
