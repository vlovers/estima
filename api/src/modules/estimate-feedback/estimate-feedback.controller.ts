import { CreateEstimateFeedbackDto } from './dto/create-estimate-feedback.dto';
import { EstimateFeedbackService } from './estimate-feedback.service';
import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Estimate Feedback')
@Controller('estimate-feedback')
export class EstimateFeedbackController {
  constructor(private readonly feedbackService: EstimateFeedbackService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new feedback entry for a task' })
  create(@Body() dto: CreateEstimateFeedbackDto, @Request() req) {
    return this.feedbackService.create(dto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all feedback entries' })
  findAll(@Request() req) {
    return this.feedbackService.findAll(req.user.userId);
  }
}
