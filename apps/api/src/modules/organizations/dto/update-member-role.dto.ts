import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MembershipRole } from '../../../common/enums/role.enum';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: MembershipRole, example: MembershipRole.ADMIN, description: 'New role for member' })
  @IsEnum(MembershipRole, {
    message: 'Role must be either ADMIN or MEMBER',
  })
  role: MembershipRole;
}
