import { CreateEstimateDto } from './create-estimate.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateEstimateDto extends PartialType(CreateEstimateDto) {}
