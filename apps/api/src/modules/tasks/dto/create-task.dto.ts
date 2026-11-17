import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import { TaskPriority } from '../../../common/enums/task-priority.enum';

export class CreateTaskDto {
  @ApiProperty({ example: 'Implement biometric authentication', description: 'Task title' })
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
  @Transform(({ value }) => (typeof value === 'number' ? value.toFixed(2) : String(value)))
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Estimated cost must be a non-negative decimal with up to 2 decimal places (e.g. 45000.00)',
  })
  estimatedCost: string;

  @ApiProperty({ example: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', description: 'Project UUID' })
  @IsUUID('4', { message: 'projectId must be a valid UUID' })
  projectId: string;
}
