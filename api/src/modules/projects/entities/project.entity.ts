import { Task } from '../../tasks/entities/task.entity';
import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProjectComplexity } from './project-complexity.enum';

@Entity({ name: 'projects' })
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: ProjectComplexity,
    default: ProjectComplexity.MEDIUM,
  })
  complexity: ProjectComplexity;

  @Column({ type: 'float', default: 0 })
  overhead: number; // Percentage

  @OneToMany(() => Task, (task) => task.project, { cascade: true })
  tasks: Task[];

  @ManyToOne(() => User, (user) => user.projects, { nullable: true })
  user: User;

  @Column({ nullable: true })
  userId: string;
}
