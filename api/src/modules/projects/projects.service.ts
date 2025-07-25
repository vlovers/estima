import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Task } from '../tasks/entities/task.entity';
import { Project } from './entities/project.entity';
import { Repository } from 'typeorm';

import {
  ForbiddenException,
  NotFoundException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>
  ) {}

  create(createProjectDto: CreateProjectDto, userId: string) {
    const project = this.projectRepository.create({
      ...createProjectDto,
      userId,
    });
    return this.projectRepository.save(project);
  }

  findAll(userId: string) {
    return this.projectRepository.find({ where: { userId } });
  }

  async findOne(id: string, userId: string, tree?: boolean) {
    const relations = ['tasks', 'tasks.estimates', 'tasks.feedbacks'];
    if (tree) {
      relations.push('tasks.parentTask');
    }
    const project = await this.projectRepository.findOne({
      where: { id, userId },
      relations,
    });
    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }

    if (tree && project.tasks) {
      project.tasks = this.buildTaskTree(project.tasks);
    }

    return project;
  }

  async update(
    id: string,
    updateProjectDto: UpdateProjectDto,
    userId: string
  ): Promise<Project> {
    const project = await this.findOne(id, userId);
    if (project.userId !== userId) {
      throw new ForbiddenException(
        'You are not allowed to update this project'
      );
    }
    Object.assign(project, updateProjectDto);
    return this.projectRepository.save(project);
  }

  async remove(id: string, userId: string): Promise<void> {
    const project = await this.findOne(id, userId);
    if (project.userId !== userId) {
      throw new ForbiddenException(
        'You are not allowed to delete this project'
      );
    }
    await this.projectRepository.delete(id);
  }

  private buildTaskTree(tasks: Task[]): Task[] {
    const taskMap = new Map<string, Task & { children: Task[] }>();
    const roots: (Task & { children: Task[] })[] = [];

    tasks.forEach((task) => {
      taskMap.set(task.id, { ...task, children: [] });
    });

    tasks.forEach((task) => {
      const taskWithChildren = taskMap.get(task.id);
      if (task.parentTask && taskMap.has(task.parentTask.id)) {
        const parent = taskMap.get(task.parentTask.id);
        if (parent) {
          parent.children.push(taskWithChildren);
        }
      } else {
        roots.push(taskWithChildren);
      }
    });

    return roots;
  }
}
