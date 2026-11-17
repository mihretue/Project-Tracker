import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty({ message: 'Project name is required' })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Budget must be a valid number with at most 2 decimal places' })
  @Min(0, { message: 'Budget cannot be negative' })
  budget: number;

  @IsUUID('4', { message: 'organizationId must be a valid UUID' })
  organizationId: string;
}
