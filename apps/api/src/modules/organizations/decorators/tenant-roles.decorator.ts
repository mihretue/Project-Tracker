import { SetMetadata, CustomDecorator } from '@nestjs/common';
import { MembershipRole } from '../../../common/enums/role.enum';

export const TENANT_ROLES_KEY = 'tenant_roles';
export const TenantRoles = (...roles: MembershipRole[]): CustomDecorator<string> =>
  SetMetadata(TENANT_ROLES_KEY, roles);
