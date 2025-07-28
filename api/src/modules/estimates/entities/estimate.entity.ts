import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
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

  @Column({ nullable: true })
  explanation: string;

  @Column({
    type: 'enum',
    enum: EstimateSource,
  })
  source: EstimateSource;

  @ManyToOne(() => Task, (task) => task.estimates, {
    onDelete: 'CASCADE',
  })
  task: Task;

  @ManyToOne(() => User, (user) => user.estimates, {
    nullable: true,
    eager: true,
  })
  user: User;
}
