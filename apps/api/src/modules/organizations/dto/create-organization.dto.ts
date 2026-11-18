import { IsNotEmpty, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Corporation', description: 'Organization display name' })
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

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-4a8b-9c0d-1e2f3a4b5c6d',
    description: 'UUID of an existing user who becomes the initial organization ADMIN',
  })
  @IsUUID('4', { message: 'initialAdminUserId must be a valid UUID' })
  initialAdminUserId: string;
}
