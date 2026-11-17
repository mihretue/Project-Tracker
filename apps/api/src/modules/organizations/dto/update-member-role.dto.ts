import { IsEnum } from 'class-validator';
import { MembershipRole } from '../../../common/enums/role.enum';

export class UpdateMemberRoleDto {
  @IsEnum(MembershipRole, {
    message: 'Role must be either ADMIN or MEMBER',
  })
  role: MembershipRole;
}
