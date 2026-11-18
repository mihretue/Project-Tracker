import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from '../../../common/validation/trim';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Corporation', description: 'Organization display name' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Organization name is required' })
  @MaxLength(150)
  name: string;

  @ApiProperty({
    example: 'acme-corp',
    description: 'Unique URL-friendly slug (lowercase, numbers, hyphens)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Slug is required' })
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug: string;
}
