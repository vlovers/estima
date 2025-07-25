import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Repository } from 'typeorm';

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

  async findOne(id: string, userId: string) {
    const project = await this.projectRepository.findOne({
      where: { id, userId },
      relations: ['tasks', 'tasks.estimates'],
    });
    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    return project;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto, userId: string) {
    const project = await this.findOne(id, userId);
    if (project.userId !== userId) {
      throw new ForbiddenException(
        'You are not allowed to update this project'
      );
    }
    Object.assign(project, updateProjectDto);
    return this.projectRepository.save(project);
  }

  async remove(id: string, userId: string) {
    const project = await this.findOne(id, userId);
    if (project.userId !== userId) {
      throw new ForbiddenException(
        'You are not allowed to delete this project'
      );
    }
    await this.projectRepository.delete(id);
  }
}
