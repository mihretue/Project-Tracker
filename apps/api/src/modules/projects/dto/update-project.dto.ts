import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Trim } from '../../../common/validation/trim';
import { MoneyInput, MONEY_PATTERN, moneyMessage } from '../../../common/validation/money';

export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'Mobile Banking Platform v2', description: 'Updated project name' })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Project name must not be empty' })
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated project description', description: 'Updated project description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '750000.00', description: 'Updated budget in ETB' })
  @IsOptional()
  @MoneyInput()
  @IsString()
  @Matches(MONEY_PATTERN, { message: moneyMessage('Budget') })
  budget?: string;
}
