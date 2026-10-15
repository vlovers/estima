import { SortProjectTasksDto, SortField } from './dto/sort-project-tasks.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Task } from '../tasks/entities/task.entity';
import { Project } from './entities/project.entity';
import { ProjectComplexity } from './entities/project-complexity.enum';
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

  async create(createProjectDto: CreateProjectDto, userId: string) {
    const project = this.projectRepository.create({
      name: createProjectDto.name,
      description: createProjectDto.description,
      // Ensure we never insert nulls for NOT NULL columns; honor defaults
      complexity: createProjectDto.complexity ?? ProjectComplexity.MEDIUM,
      overhead: createProjectDto.overhead ?? 0,
      userId,
    });
    const inserted = await this.projectRepository.insert(project);
    project.id = inserted.identifiers[0].id;
    return project;
  }

  findAll(userId: string) {
    return this.projectRepository.find({ where: { userId } });
  }

  async findOne(
    id: string,
    userId: string,
    tree?: boolean,
    sortDto?: SortProjectTasksDto
  ) {
    const qb = this.projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.tasks', 'task')
      .leftJoinAndSelect('task.estimates', 'estimate')
      .leftJoinAndSelect('task.feedbacks', 'feedback')
      .where('project.id = :id', { id })
      .andWhere('project.userId = :userId', { userId });

    if (tree) {
      qb.leftJoinAndSelect('task.parentTask', 'parentTask');
    }

    if (sortDto?.sortBy) {
      const { sortBy, sortOrder } = sortDto;
      let orderBy: string;

      if (sortBy === SortField.CREATED_AT) {
        orderBy = 'task.createdAt';
      } else if (sortBy === SortField.FINAL_ESTIMATE) {
        orderBy = 'estimate.finalEstimate';
      } else {
        orderBy = 'estimate.manualEstimate';
      }
      qb.orderBy(orderBy, sortOrder);
    }

    const project = await qb.getOne();

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
    const changes = {
      name: updateProjectDto.name,
      description: updateProjectDto.description,
      complexity: updateProjectDto.complexity,
      overhead: updateProjectDto.overhead,
    };
    if (Object.values(changes).some((value) => value !== undefined)) {
      const result = await this.projectRepository.update(
        { id, userId },
        changes
      );
      if (result.affected !== 1) {
        throw new NotFoundException(`Project with ID "${id}" not found`);
      }
    }
    return this.findOne(id, userId);
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
    const taskMap = new Map<string, Task & { subtasks: Task[] }>();
    const rootTasks: (Task & { subtasks: Task[] })[] = [];

    tasks.forEach((task) => {
      taskMap.set(task.id, { ...task, subtasks: [] });
    });

    tasks.forEach((task) => {
      if (task.parentTask) {
        const parent = taskMap.get(task.parentTask.id);
        const taskWithSubtasks = taskMap.get(task.id)!;
        if (parent) {
          parent.subtasks.push(taskWithSubtasks);
        }
      } else {
        rootTasks.push(taskMap.get(task.id)!);
      }
    });

    return rootTasks;
  }
}
