import { IsEnum, IsOptional, IsUUID, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipRole } from '../../../common/enums/role.enum';

export class AddMemberDto {
  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'User UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  userId?: string;

  @ApiPropertyOptional({ example: 'colleague@example.com', description: 'User email if userId is unknown' })
  @IsOptional()
  @IsEmail({}, { message: 'Valid email required if userId is not provided' })
  email?: string;

  @ApiProperty({ enum: MembershipRole, example: MembershipRole.MEMBER, description: 'Role to assign (ADMIN or MEMBER)' })
  @IsEnum(MembershipRole, {
    message: 'Role must be either ADMIN or MEMBER',
  })
  role: MembershipRole;
}
