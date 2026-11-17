import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { OrganizationMembership } from '../entities/organization-membership.entity';

export const CurrentMembership = createParamDecorator(
  (data: keyof OrganizationMembership | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const membership = request.membership as OrganizationMembership;

    if (!membership) {
      return null;
    }

    return data ? membership[data] : membership;
  },
);
