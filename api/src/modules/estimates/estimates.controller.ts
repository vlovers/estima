import { AddManagerExplanationDto } from './dto/add-manager-explanation.dto';
import { UpdateEstimateDto } from './dto/update-estimate.dto';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { EstimatesService } from './estimates.service';
import { Estimate } from './entities/estimate.entity';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  ParseUUIDPipe,
  Controller,
  Delete,
  Param,
  Patch,
  Request,
  Body,
  Post,
  Get,
} from '@nestjs/common';

@ApiTags('Estimates')
@ApiBearerAuth()
@Controller('estimates')
export class EstimatesController {
  constructor(private readonly estimatesService: EstimatesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new estimate' })
  @ApiResponse({
    status: 201,
    description: 'Estimate created successfully',
    type: Estimate,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  create(@Body() createEstimateDto: CreateEstimateDto, @Request() req) {
    return this.estimatesService.create(createEstimateDto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all estimates' })
  @ApiResponse({
    status: 200,
    description: 'List of all estimates',
    type: [Estimate],
  })
  findAll(@Request() req) {
    return this.estimatesService.findAll(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an estimate by ID' })
  @ApiResponse({ status: 200, description: 'Estimate details', type: Estimate })
  @ApiResponse({ status: 404, description: 'Estimate not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.estimatesService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an estimate' })
  @ApiResponse({
    status: 200,
    description: 'Estimate updated successfully',
    type: Estimate,
  })
  @ApiResponse({ status: 404, description: 'Estimate not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEstimateDto: UpdateEstimateDto,
    @Request() req
  ) {
    return this.estimatesService.update(id, updateEstimateDto, req.user.userId);
  }

  @Patch(':id/manager-explanation')
  @ApiOperation({ summary: "Add a manager's explanation to an estimate" })
  @ApiResponse({ status: 200, description: 'Explanation added successfully' })
  @ApiResponse({ status: 404, description: 'Estimate not found' })
  addManagerExplanation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() addManagerExplanationDto: AddManagerExplanationDto,
    @Request() req
  ) {
    return this.estimatesService.addManagerExplanation(
      id,
      addManagerExplanationDto.explanation,
      req.user.userId
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an estimate' })
  @ApiResponse({ status: 200, description: 'Estimate deleted successfully' })
  @ApiResponse({ status: 404, description: 'Estimate not found' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.estimatesService.remove(id, req.user.userId);
  }
}
