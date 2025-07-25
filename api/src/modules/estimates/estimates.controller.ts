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
  create(@Body() createEstimateDto: CreateEstimateDto) {
    return this.estimatesService.create(createEstimateDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all estimates' })
  @ApiResponse({
    status: 200,
    description: 'List of all estimates',
    type: [Estimate],
  })
  findAll() {
    return this.estimatesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an estimate by ID' })
  @ApiResponse({ status: 200, description: 'Estimate details', type: Estimate })
  @ApiResponse({ status: 404, description: 'Estimate not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.estimatesService.findOne(id);
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
    @Body() updateEstimateDto: UpdateEstimateDto
  ) {
    return this.estimatesService.update(id, updateEstimateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an estimate' })
  @ApiResponse({ status: 200, description: 'Estimate deleted successfully' })
  @ApiResponse({ status: 404, description: 'Estimate not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.estimatesService.remove(id);
  }
}
