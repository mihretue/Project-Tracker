import { SetMetadata, CustomDecorator } from '@nestjs/common';
import { PlatformRole } from '../../../common/enums/platform-role.enum';

export const PLATFORM_ROLES_KEY = 'platform_roles';

/** Restricts a route to users holding one of the given platform-level roles. */
export const PlatformRoles = (...roles: PlatformRole[]): CustomDecorator<string> =>
  SetMetadata(PLATFORM_ROLES_KEY, roles);
