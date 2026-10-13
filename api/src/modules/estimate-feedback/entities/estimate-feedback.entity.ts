import { Task } from '../../tasks/entities/task.entity';

import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Column,
  Entity,
  UpdateDateColumn,
} from 'typeorm';

export enum DeviationReason {
  UNFORESEEN_TECHNICAL_COMPLEXITY = 'UNFORESEEN_TECHNICAL_COMPLEXITY',
  SCOPE_CREEP = 'SCOPE_CREEP',
  INCORRECT_INITIAL_ASSUMPTIONS = 'INCORRECT_INITIAL_ASSUMPTIONS',
  ENVIRONMENT_OR_TOOLING_ISSUES = 'ENVIRONMENT_OR_TOOLING_ISSUES',
  EXTERNAL_DEPENDENCY_DELAY = 'EXTERNAL_DEPENDENCY_DELAY',
  ESTIMATE_WAS_ACCURATE = 'ESTIMATE_WAS_ACCURATE',
  OTHER = 'OTHER',
}

@Entity({ name: 'estimate_feedbacks' })
export class EstimateFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Task, (task) => task.feedbacks, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  task: Task;

  @Column({ type: 'float' })
  actualHours: number;

  @Column({ type: 'float', nullable: true })
  userEstimate: number;

  @Column({ type: 'int', nullable: true })
  rating: number; // 1-5

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({
    type: 'enum',
    enum: DeviationReason,
    nullable: true,
  })
  reasonForDeviation: DeviationReason;

  @Column({
    type: 'simple-array',
    nullable: true,
    comment: 'Complexity tags that were missed during initial estimation.',
  })
  missedComplexityTags: string[];

  @Column({ type: 'text', nullable: true })
  deviationComment: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
