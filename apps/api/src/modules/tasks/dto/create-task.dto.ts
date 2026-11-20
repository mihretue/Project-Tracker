import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { Trim } from '../../../common/validation/trim';
import { MoneyInput, MONEY_PATTERN, moneyMessage } from '../../../common/validation/money';

export class CreateTaskDto {
  @ApiProperty({ example: 'Implement biometric authentication', description: 'Task title' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Task title is required' })
  @MaxLength(250)
  title: string;

  @ApiPropertyOptional({ example: 'Fingerprint and Face ID support via WebAuthn', description: 'Task description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TaskStatus, example: TaskStatus.TODO, description: 'Task status' })
  @IsOptional()
  @IsEnum(TaskStatus, {
    message: 'Status must be TODO, IN_PROGRESS, REVIEW, or COMPLETED',
  })
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskPriority, example: TaskPriority.MEDIUM, description: 'Task priority (LOW, MEDIUM, HIGH)' })
  @IsOptional()
  @IsEnum(TaskPriority, {
    message: 'Priority must be LOW, MEDIUM, or HIGH',
  })
  priority?: TaskPriority;

  /**
   * Estimated cost in ETB. Stored as exact decimal string with 2 decimals.
   */
  @ApiProperty({
    example: '45000.00',
    description: 'Estimated task cost in ETB (decimal string with up to 2 decimal places)',
  })
  @MoneyInput()
  @IsString()
  @Matches(MONEY_PATTERN, { message: moneyMessage('Estimated cost') })
  estimatedCost: string;

  @ApiPropertyOptional({ example: 14, description: 'Planned duration in whole days (0 to 36500); omit if unknown' })
  @IsOptional()
  @IsInt({ message: 'Duration must be a whole number of days' })
  @Min(0, { message: 'Duration must not be negative' })
  @Max(36500, { message: 'Duration must be 36500 days or fewer' })
  durationDays?: number;

  @ApiProperty({ example: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', description: 'Project UUID' })
  @IsUUID('4', { message: 'projectId must be a valid UUID' })
  projectId: string;
}
