import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Task } from '../../tasks/entities/task.entity';

export enum EstimateSource {
  AI_SUBTASK_SUM = 'ai_subtask_sum',
  MANUAL = 'manual',
  FINAL = 'final',
  AI = 'ai',
}

@Entity({ name: 'estimates' })
export class Estimate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'float', default: 0 })
  finalEstimate: number;

  @Column({ type: 'float', nullable: true })
  manualEstimate: number;

  @Column({ type: 'float', nullable: true })
  confidence: number;

  @Column({ type: 'text', nullable: true })
  explanation: string;

  @Column({ type: 'text', nullable: true })
  managerExplanation: string;

  @Column({ type: 'float', nullable: true })
  p10?: number;

  @Column({ type: 'float', nullable: true })
  p50?: number;

  @Column({ type: 'float', nullable: true })
  p90?: number;

  @Column({ type: 'float', nullable: true })
  topDown?: number;

  @Column({ type: 'float', nullable: true })
  bottomUp?: number;

  @Column({ type: 'float', nullable: true })
  divergencePct?: number;

  @Column({ type: 'text', nullable: true })
  logs?: string;

  @Column({
    type: 'enum',
    enum: EstimateSource,
  })
  source: EstimateSource;

  @ManyToOne(() => Task, (task) => task.estimates, {
    onDelete: 'CASCADE',
  })
  task: Task;
}
