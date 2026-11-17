import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Number of items to retrieve (default: 10, max: 100)',
    default: 10,
    minimum: 1,
    maximum: 100,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'take must be an integer' })
  @Min(1, { message: 'take must be at least 1' })
  @Max(100, { message: 'take cannot exceed 100' })
  take?: number = 10;

  @ApiPropertyOptional({
    description: 'Number of items to skip for pagination (default: 0)',
    default: 0,
    minimum: 0,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'skip must be an integer' })
  @Min(0, { message: 'skip must be at least 0' })
  skip?: number = 0;
}

export interface PaginatedResponse<T> {
  items: T[];
  count: number;
  take: number;
  skip: number;
}
