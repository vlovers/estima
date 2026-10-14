import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EstimateFeedback } from '../../estimate-feedback/entities/estimate-feedback.entity';
import { User } from '../../users/entities/user.entity';

@Entity('coefficient_change_events')
@Index('IDX_coefficient_change_events_tenant', ['tenantUserId'])
@Index('IDX_coefficient_change_events_coefficient_key', ['coefficientKey'])
@Index('IDX_coefficient_change_events_feedback', ['feedbackId'])
@Index(
  'UQ_coefficient_change_events_feedback_key',
  ['feedbackId', 'coefficientKey'],
  {
    unique: true,
  }
)
export class CoefficientChangeEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({
    name: 'tenantUserId',
    foreignKeyConstraintName: 'FK_coefficient_change_events_tenant_user',
  })
  tenantUser: User;

  @Column({ type: 'uuid' })
  feedbackId: string;

  @ManyToOne(() => EstimateFeedback, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({
    name: 'feedbackId',
    foreignKeyConstraintName: 'FK_coefficient_change_events_feedback',
  })
  feedback: EstimateFeedback;

  @Column({ type: 'varchar', length: 255 })
  coefficientKey: string;

  @Column({ type: 'float' })
  oldValue: number;

  @Column({ type: 'float' })
  newValue: number;

  @Column({ type: 'float', nullable: true })
  defaultValue: number | null;

  @Column({ type: 'float', nullable: true })
  correctionFactor: number | null;

  @Column({ type: 'float', nullable: true })
  clampedCorrectionFactor: number | null;

  @Column({ type: 'int', nullable: true })
  sampleCountBefore: number | null;

  @Column({ type: 'int', nullable: true })
  sampleCountAfter: number | null;

  @Column({ type: 'float', nullable: true })
  weight: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 32 })
  algorithmVersion: string;

  @Column({ type: 'jsonb', nullable: true })
  changeMetadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
