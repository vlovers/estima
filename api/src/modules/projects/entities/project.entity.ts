import { Task } from '../../tasks/entities/task.entity';
import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'projects' })
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @OneToMany(() => Task, (task) => task.project, { cascade: true })
  tasks: Task[];

  @ManyToOne(() => User, (user) => user.projects, { nullable: true })
  user: User;

  @Column({ nullable: true })
  userId: string;
}
