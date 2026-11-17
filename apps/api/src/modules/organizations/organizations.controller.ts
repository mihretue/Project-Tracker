import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  OrganizationsService,
  UserOrganizationView,
  MemberView,
} from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from './guards/tenant.guard';
import { TenantRoles } from './decorators/tenant-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { MembershipRole } from '../../common/enums/role.enum';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Post()
  async create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: User,
  ): Promise<UserOrganizationView> {
    return this.orgsService.create(dto, user);
  }

  @Get()
  async findAll(@CurrentUser() user: User): Promise<UserOrganizationView[]> {
    // Only return organizations where user has an active membership
    return this.orgsService.findUserOrganizations(user.id);
  }

  @Get(':id')
  @UseGuards(TenantGuard)
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<UserOrganizationView> {
    return this.orgsService.findById(id, user.id);
  }

  @Get(':id/members')
  @UseGuards(TenantGuard)
  async listMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<MemberView[]> {
    return this.orgsService.listMembers(id, user.id);
  }

  @Post(':id/members')
  @UseGuards(TenantGuard)
  @TenantRoles(MembershipRole.ADMIN)
  async addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: User,
  ): Promise<MemberView> {
    return this.orgsService.addMember(id, dto, user.id);
  }

  @Patch(':id/members/:userId')
  @UseGuards(TenantGuard)
  @TenantRoles(MembershipRole.ADMIN)
  async updateMemberRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: User,
  ): Promise<MemberView> {
    return this.orgsService.updateMemberRole(id, targetUserId, dto.role, user.id);
  }
}
