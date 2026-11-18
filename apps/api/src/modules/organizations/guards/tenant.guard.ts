import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationMembership } from '../entities/organization-membership.entity';
import { MembershipRole } from '../../../common/enums/role.enum';
import { TENANT_ROLES_KEY } from '../decorators/tenant-roles.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepository: Repository<OrganizationMembership>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required');
    }

    // Resolve organization ID from route params, query, or body
    let organizationId: string | undefined =
      request.params?.organizationId ||
      request.params?.orgId;

    // For /organizations/:id endpoints
    if (!organizationId && request.params?.id && (request.baseUrl?.includes('organizations') || request.url?.includes('/organizations/'))) {
      organizationId = request.params.id;
    }

    // Fallback to query param or body
    if (!organizationId) {
      organizationId = request.query?.organizationId as string | undefined;
    }
    if (!organizationId && request.body && typeof request.body.organizationId === 'string') {
      organizationId = request.body.organizationId;
    }

    if (!organizationId) {
      throw new BadRequestException('Organization identifier could not be resolved from request');
    }

    // Reject malformed identifiers before they reach the database (an invalid uuid would
    // otherwise surface as an unhandled 500). Runs before the membership lookup, so it grants nothing.
    if (typeof organizationId !== 'string' || !isUUID(organizationId)) {
      throw new BadRequestException('Organization identifier must be a valid UUID');
    }

    // Verify membership in database for this specific user and organization
    const membership = await this.membershipRepository.findOne({
      where: {
        userId: user.id,
        organizationId,
      },
      relations: ['organization'],
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You are not an active member of this organization',
      );
    }

    // Check role restrictions if specified by @TenantRoles
    const requiredRoles = this.reflector.getAllAndOverride<MembershipRole[]>(
      TENANT_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles && requiredRoles.length > 0) {
      const hasRequiredRole = requiredRoles.includes(membership.role);
      if (!hasRequiredRole) {
        throw new ForbiddenException(
          `Access denied: Operation requires [${requiredRoles.join(', ')}] role privileges. Your role: ${membership.role}`,
        );
      }
    }

    // Attach verified membership and organizationId to request context
    request.membership = membership;
    request.organizationId = organizationId;

    return true;
  }
}
