import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { AiEstimatorService } from './ai-estimator.service';
import { Body, Controller, Post } from '@nestjs/common';
import { EstimateDto } from './dto/estimate.dto';

@ApiTags('AI Estimator')
@Controller('ai-estimator')
export class AiEstimatorController {
  constructor(private readonly aiEstimatorService: AiEstimatorService) {}

  @Post('estimate')
  @ApiOperation({ summary: 'Get an AI-powered estimate for a task' })
  @ApiResponse({
    status: 201,
    description: 'AI estimate created successfully',
    type: EstimateDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  getEstimate(@Body() createTaskDto: CreateTaskDto): Promise<EstimateDto> {
    return this.aiEstimatorService.estimateTask(createTaskDto);
  }
}
