import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { Trim } from '../../../common/validation/trim';
import { MoneyInput, MONEY_PATTERN, moneyMessage } from '../../../common/validation/money';

export class UpdateTaskDto {
  @ApiPropertyOptional({ example: 'Updated task title', description: 'Updated title' })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Task title must not be empty' })
  @MaxLength(250)
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description', description: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TaskStatus, example: TaskStatus.IN_PROGRESS, description: 'Updated task status' })
  @IsOptional()
  @IsEnum(TaskStatus, {
    message: 'Status must be TODO, IN_PROGRESS, REVIEW, or COMPLETED',
  })
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskPriority, example: TaskPriority.HIGH, description: 'Updated task priority' })
  @IsOptional()
  @IsEnum(TaskPriority, {
    message: 'Priority must be LOW, MEDIUM, or HIGH',
  })
  priority?: TaskPriority;

  @ApiPropertyOptional({ example: '52000.00', description: 'Updated estimated cost in ETB' })
  @IsOptional()
  @MoneyInput()
  @IsString()
  @Matches(MONEY_PATTERN, { message: moneyMessage('Estimated cost') })
  estimatedCost?: string;
}
