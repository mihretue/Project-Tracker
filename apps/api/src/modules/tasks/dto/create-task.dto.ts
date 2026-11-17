import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus } from '../../../common/enums/task-status.enum';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty({ message: 'Task title is required' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus, {
    message: 'Status must be TODO, IN_PROGRESS, REVIEW, or COMPLETED',
  })
  status?: TaskStatus;

  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Estimated cost must be a valid number with at most 2 decimal places' },
  )
  @Min(0, { message: 'Estimated cost cannot be negative' })
  estimatedCost: number;

  @IsUUID('4', { message: 'projectId must be a valid UUID' })
  projectId: string;
}
