import { IsEnum, IsOptional } from 'class-validator';

export enum SortField {
  CREATED_AT = 'createdAt',
  FINAL_ESTIMATE = 'finalEstimate',
  MANUAL_ESTIMATE = 'manualEstimate',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class SortProjectTasksDto {
  @IsOptional()
  @IsEnum(SortField)
  sortBy?: SortField = SortField.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;
}
