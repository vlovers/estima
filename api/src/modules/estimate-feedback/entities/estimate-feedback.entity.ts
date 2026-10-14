import { Estimate } from '../../estimates/entities/estimate.entity';
import { Task } from '../../tasks/entities/task.entity';

import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  JoinColumn,
  ManyToOne,
  Column,
  Entity,
  Index,
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

export enum FeedbackProcessingStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  SKIPPED = 'skipped',
  FAILED = 'failed',
}

@Entity({ name: 'estimate_feedbacks' })
@Index(
  'IDX_estimate_feedbacks_task_idempotency_key',
  ['taskId', 'idempotencyKey'],
  {
    unique: true,
    where: '"idempotencyKey" IS NOT NULL',
  }
)
@Index('IDX_estimate_feedbacks_estimate_id', ['estimateId'])
@Index('IDX_estimate_feedbacks_processing_status', ['processingStatus'])
export class EstimateFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  taskId: string;

  @ManyToOne(() => Task, (task) => task.feedbacks, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({
    name: 'taskId',
    foreignKeyConstraintName: 'FK_48723ec5670bf40c50262e7bc1c',
  })
  task: Task;

  @Column({ type: 'uuid', nullable: true })
  estimateId: string | null;

  @ManyToOne(() => Estimate, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({
    name: 'estimateId',
    foreignKeyConstraintName: 'FK_estimate_feedbacks_estimate',
  })
  estimate: Estimate | null;

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

  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'float', nullable: true })
  estimatedHoursSnapshot: number | null;

  @Column({
    type: 'enum',
    enum: FeedbackProcessingStatus,
    default: FeedbackProcessingStatus.PENDING,
  })
  processingStatus: FeedbackProcessingStatus;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  processingError: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  algorithmVersion: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
