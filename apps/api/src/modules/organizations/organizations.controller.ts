import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  OrganizationsService,
  UserOrganizationView,
  MemberView,
} from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from './guards/tenant.guard';
import { TenantRoles } from './decorators/tenant-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { MembershipRole } from '../../common/enums/role.enum';

@ApiTags('Organizations')
@ApiBearerAuth('JWT-auth')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @ApiOperation({ summary: 'Create new organization (caller becomes ADMIN)' })
  @Post()
  async create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: User,
  ): Promise<UserOrganizationView> {
    return this.orgsService.create(dto, user);
  }

  @ApiOperation({ summary: 'List organizations caller belongs to with pagination (take, skip)' })
  @Get()
  async findAll(
    @CurrentUser() user: User,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponse<UserOrganizationView>> {
    return this.orgsService.findUserOrganizations(user.id, pagination);
  }

  @ApiOperation({ summary: 'Get organization by ID (requires membership)' })
  @Get(':id')
  @UseGuards(TenantGuard)
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<UserOrganizationView> {
    return this.orgsService.findById(id, user.id);
  }

  @ApiOperation({ summary: 'List organization members (requires membership)' })
  @Get(':id/members')
  @UseGuards(TenantGuard)
  async listMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<MemberView[]> {
    return this.orgsService.listMembers(id, user.id);
  }

  @ApiOperation({ summary: 'Add new member to organization (ADMIN only)' })
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

  @ApiOperation({ summary: 'Update member role (ADMIN only)' })
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
