import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty({ message: 'Project name is required' })
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Budget in ETB. Validated as numeric string to preserve 2-decimal precision.
   */
  @Transform(({ value }) => (typeof value === 'number' ? value.toFixed(2) : String(value)))
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Budget must be a non-negative decimal with up to 2 decimal places (e.g. 150000.00)',
  })
  budget: string;

  @IsUUID('4', { message: 'organizationId must be a valid UUID' })
  organizationId: string;
}
