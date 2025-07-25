import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ example: 'Project Alpha', description: 'Project name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'A project to do great things',
    description: 'Project description',
  })
  @IsString()
  @IsNotEmpty()
  description: string;
}
