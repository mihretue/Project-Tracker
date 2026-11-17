import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { TaskStatus } from '../../../common/enums/task-status.enum';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus, {
    message: 'Status must be TODO, IN_PROGRESS, REVIEW, or COMPLETED',
  })
  status?: TaskStatus;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'number' ? value.toFixed(2) : String(value)))
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Estimated cost must be a non-negative decimal with up to 2 decimal places',
  })
  estimatedCost?: string;
}
