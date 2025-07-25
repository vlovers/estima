import { Body, Controller, Post, UseGuards, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectsService } from '../projects/projects.service';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { AiEstimatorService } from './ai-estimator.service';
import { EstimateDto } from './dto/estimate.dto';

@ApiTags('AI Estimator')
@Controller('ai-estimator')
export class AiEstimatorController {
  constructor(
    private readonly aiEstimatorService: AiEstimatorService,
    private readonly projectsService: ProjectsService
  ) {}

  @Post('estimate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get an AI-powered estimate for a task' })
  @ApiResponse({
    status: 201,
    description: 'AI estimate created successfully',
    type: EstimateDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async getEstimate(
    @Body() createTaskDto: CreateTaskDto,
    @Req() req
  ): Promise<EstimateDto> {
    const project = await this.projectsService.findOne(
      createTaskDto.projectId,
      req.user.userId
    );
    return this.aiEstimatorService.estimateTask(createTaskDto, project);
  }
}
