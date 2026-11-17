import { IsEnum, IsUUID } from 'class-validator';
import { MembershipRole } from '../../../common/enums/role.enum';

export class AddMemberDto {
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  userId: string;

  @IsEnum(MembershipRole, {
    message: 'Role must be either ADMIN or MEMBER',
  })
  role: MembershipRole;
}
