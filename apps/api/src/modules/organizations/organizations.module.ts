import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationMembership } from './entities/organization-membership.entity';
import { User } from '../users/entities/user.entity';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { TenantGuard } from './guards/tenant.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Organization, OrganizationMembership, User])],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, TenantGuard],
  exports: [OrganizationsService, TenantGuard, TypeOrmModule],
})
export class OrganizationsModule {}
