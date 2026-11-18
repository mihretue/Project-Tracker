import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Trim } from '../../../common/validation/trim';
import { MoneyInput, MONEY_PATTERN, moneyMessage } from '../../../common/validation/money';

export class CreateProjectDto {
  @ApiProperty({ example: 'Mobile Banking Platform', description: 'Project name' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Project name is required' })
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Core transaction processing engine', description: 'Project description' })
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Budget in ETB. Validated as numeric string to preserve 2-decimal precision.
   */
  @ApiProperty({
    example: '650000.00',
    description: 'Project budget in ETB (non-negative decimal string with up to 2 decimal places)',
  })
  @MoneyInput()
  @IsString()
  @Matches(MONEY_PATTERN, { message: moneyMessage('Budget') })
  budget: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'Organization UUID' })
  @IsUUID('4', { message: 'organizationId must be a valid UUID' })
  organizationId: string;
}
