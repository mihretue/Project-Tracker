import { IsEnum, IsOptional, IsString, IsUUID, IsEmail } from 'class-validator';
import { MembershipRole } from '../../../common/enums/role.enum';

export class AddMemberDto {
  @IsOptional()
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  userId?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Valid email required if userId is not provided' })
  email?: string;

  @IsEnum(MembershipRole, {
    message: 'Role must be either ADMIN or MEMBER',
  })
  role: MembershipRole;
}
