import { Task } from '../../tasks/entities/task.entity';

import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Column,
  Entity,
} from 'typeorm';

@Entity({ name: 'estimate_feedbacks' })
export class EstimateFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Task, (task) => task.feedbacks)
  task: Task;

  @Column({ type: 'float', nullable: true })
  actualHours: number;

  @Column({ type: 'float', nullable: true })
  userEstimate: number;

  @CreateDateColumn()
  createdAt: Date;
}
