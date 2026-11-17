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
import { TaskStatus } from '../../../common/enums/task-status.enum';
import { TaskPriority } from '../../../common/enums/task-priority.enum';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty({ message: 'Task title is required' })
  @MaxLength(250)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus, {
    message: 'Status must be TODO, IN_PROGRESS, REVIEW, or COMPLETED',
  })
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority, {
    message: 'Priority must be LOW, MEDIUM, or HIGH',
  })
  priority?: TaskPriority;

  /**
   * Estimated cost in ETB. Stored as exact decimal string with 2 decimals.
   */
  @Transform(({ value }) => (typeof value === 'number' ? value.toFixed(2) : String(value)))
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Estimated cost must be a non-negative decimal with up to 2 decimal places (e.g. 45000.00)',
  })
  estimatedCost: string;

  @IsUUID('4', { message: 'projectId must be a valid UUID' })
  projectId: string;
}
