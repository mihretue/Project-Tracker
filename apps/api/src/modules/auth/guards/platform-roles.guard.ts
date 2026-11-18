import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRole } from '../../../common/enums/platform-role.enum';
import { User } from '../../users/entities/user.entity';
import { PLATFORM_ROLES_KEY } from '../decorators/platform-roles.decorator';

interface AuthenticatedRequest {
  user?: User;
}

/**
 * Enforces platform-level roles. Must run after JwtAuthGuard: request.user is the
 * User row loaded from the database by JwtStrategy, so platformRole is never read
 * from the token or from client-supplied input.
 */
@Injectable()
export class PlatformRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<PlatformRole[] | undefined>(
      PLATFORM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Fail closed: the guard is useless without a declared requirement.
    if (!requiredRoles || requiredRoles.length === 0 || !requiredRoles.includes(user.platformRole)) {
      throw new ForbiddenException(
        'Access denied: this operation requires platform-level administrator privileges',
      );
    }

    return true;
  }
}
