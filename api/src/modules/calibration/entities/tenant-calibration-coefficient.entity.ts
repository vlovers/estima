import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('tenant_calibration_coefficients')
@Index('IDX_tenant_calibration_coefficients_tenant', ['tenantUserId'])
@Index('IDX_tenant_calibration_coefficients_key', ['key'])
@Index(
  'UQ_tenant_calibration_coefficients_tenant_key',
  ['tenantUserId', 'key'],
  {
    unique: true,
  }
)
@Check(
  'CHK_tenant_calibration_coefficients_value_bounds',
  '"value" >= "minValue" AND "value" <= "maxValue"'
)
@Check(
  'CHK_tenant_calibration_coefficients_default_bounds',
  '"defaultValue" >= "minValue" AND "defaultValue" <= "maxValue"'
)
@Check(
  'CHK_tenant_calibration_coefficients_sample_count',
  '"eligibleSampleCount" >= 0'
)
@Check('CHK_tenant_calibration_coefficients_total_weight', '"totalWeight" >= 0')
@Check('CHK_tenant_calibration_coefficients_version', '"version" >= 1')
export class TenantCalibrationCoefficient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({
    name: 'tenantUserId',
    foreignKeyConstraintName: 'FK_tenant_calibration_coefficients_tenant_user',
  })
  tenantUser: User;

  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Column({ type: 'float' })
  value: number;

  @Column({ type: 'float' })
  defaultValue: number;

  @Column({ type: 'float' })
  minValue: number;

  @Column({ type: 'float' })
  maxValue: number;

  @Column({ type: 'int', default: 0 })
  eligibleSampleCount: number;

  @Column({ type: 'float', default: 0 })
  totalWeight: number;

  @Column({ type: 'float', default: 0 })
  ewmaLogError: number;

  @Column({ type: 'uuid', nullable: true })
  lastFeedbackId: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
