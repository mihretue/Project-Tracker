import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationMembership } from './entities/organization-membership.entity';
import { User } from '../users/entities/user.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { MembershipRole } from '../../common/enums/role.enum';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';

export interface UserOrganizationView {
  id: string;
  name: string;
  slug: string;
  role: MembershipRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberView {
  id: string;
  userId: string;
  role: MembershipRole;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  createdAt: Date;
}

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepository: Repository<Organization>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepository: Repository<OrganizationMembership>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Any authenticated user may create an organization. The creator becomes its first ADMIN;
   * the organization and that membership are created atomically.
   */
  async create(
    dto: CreateOrganizationDto,
    creator: User,
  ): Promise<UserOrganizationView> {
    const slug = dto.slug.toLowerCase().trim();
    const existing = await this.orgRepository.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException(`Organization with slug '${slug}' already exists`);
    }

    // Execute in transaction to ensure atomicity of Organization + Admin Membership
    return this.dataSource.transaction(async (manager) => {
      const org = manager.create(Organization, {
        name: dto.name.trim(),
        slug,
      });
      const savedOrg = await manager.save(org);

      const membership = manager.create(OrganizationMembership, {
        organizationId: savedOrg.id,
        userId: creator.id,
        role: MembershipRole.ADMIN,
      });
      await manager.save(membership);

      return {
        id: savedOrg.id,
        name: savedOrg.name,
        slug: savedOrg.slug,
        role: MembershipRole.ADMIN,
        createdAt: savedOrg.createdAt,
        updatedAt: savedOrg.updatedAt,
      };
    });
  }

  async findUserOrganizations(
    userId: string,
    pagination?: PaginationDto,
  ): Promise<PaginatedResponse<UserOrganizationView>> {
    const take = pagination?.take !== undefined ? pagination.take : 10;
    const skip = pagination?.skip !== undefined ? pagination.skip : 0;

    const [memberships, totalCount] = await this.membershipRepository.findAndCount({
      where: { userId },
      relations: ['organization'],
      order: { createdAt: 'ASC' },
      take,
      skip,
    });

    const items = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
      createdAt: m.organization.createdAt,
      updatedAt: m.organization.updatedAt,
    }));

    return {
      items,
      count: totalCount,
      take,
      skip,
    };
  }

  async findById(orgId: string, userId: string): Promise<UserOrganizationView> {
    const membership = await this.membershipRepository.findOne({
      where: { organizationId: orgId, userId },
      relations: ['organization'],
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You do not have membership in this organization',
      );
    }

    return {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
      createdAt: membership.organization.createdAt,
      updatedAt: membership.organization.updatedAt,
    };
  }

  async listMembers(orgId: string, userId: string): Promise<MemberView[]> {
    // Verify caller is a member of this organization
    const callerMembership = await this.membershipRepository.findOne({
      where: { organizationId: orgId, userId },
    });

    if (!callerMembership) {
      throw new ForbiddenException(
        'Access denied: You are not a member of this organization',
      );
    }

    const memberships = await this.membershipRepository.find({
      where: { organizationId: orgId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    return memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      user: {
        id: m.user.id,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
      },
      createdAt: m.createdAt,
    }));
  }

  async addMember(
    orgId: string,
    dto: AddMemberDto,
    actorId: string,
  ): Promise<MemberView> {
    // 1. Verify actor has ADMIN role in this organization
    const actorMembership = await this.membershipRepository.findOne({
      where: { organizationId: orgId, userId: actorId },
    });

    if (!actorMembership || actorMembership.role !== MembershipRole.ADMIN) {
      throw new ForbiddenException(
        'Access denied: Only organization admins can add members',
      );
    }

    // 2. Identify target user by userId or email
    let targetUser: User | null = null;
    if (dto.userId) {
      targetUser = await this.userRepository.findOne({ where: { id: dto.userId } });
    } else if (dto.email) {
      targetUser = await this.userRepository.findOne({
        where: { email: dto.email.toLowerCase().trim() },
      });
    }

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    // 3. Prevent duplicate membership
    const existing = await this.membershipRepository.findOne({
      where: { organizationId: orgId, userId: targetUser.id },
    });

    if (existing) {
      throw new ConflictException(
        'User is already a member of this organization',
      );
    }

    // 4. Create membership
    const membership = this.membershipRepository.create({
      organizationId: orgId,
      userId: targetUser.id,
      role: dto.role,
    });

    const saved = await this.membershipRepository.save(membership);

    return {
      id: saved.id,
      userId: targetUser.id,
      role: saved.role,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
      },
      createdAt: saved.createdAt,
    };
  }

  async updateMemberRole(
    orgId: string,
    targetUserId: string,
    newRole: MembershipRole,
    actorId: string,
  ): Promise<MemberView> {
    return this.dataSource.transaction(async (manager) => {
      // Serialize role changes per organization: concurrent updates queue on this row lock, and
      // every read below (made after the lock is granted) sees the previous update's result.
      // Without it, two admins demoting each other at once would both pass the last-admin check.
      await manager.findOne(Organization, {
        where: { id: orgId },
        lock: { mode: 'pessimistic_write' },
      });

      // 1. Verify actor is (still) ADMIN. Re-checked under the lock: the guard's check ran earlier.
      const actorMembership = await manager.findOne(OrganizationMembership, {
        where: { organizationId: orgId, userId: actorId },
      });

      if (!actorMembership || actorMembership.role !== MembershipRole.ADMIN) {
        throw new ForbiddenException(
          'Access denied: Only organization admins can modify member roles',
        );
      }

      // 2. Verify target membership exists
      const targetMembership = await manager.findOne(OrganizationMembership, {
        where: { organizationId: orgId, userId: targetUserId },
        relations: ['user'],
      });

      if (!targetMembership) {
        throw new NotFoundException(
          'Membership not found for this user and organization',
        );
      }

      // 3. An organization must always keep at least one ADMIN
      if (targetMembership.role === MembershipRole.ADMIN && newRole !== MembershipRole.ADMIN) {
        const adminCount = await manager.count(OrganizationMembership, {
          where: { organizationId: orgId, role: MembershipRole.ADMIN },
        });

        if (adminCount <= 1) {
          throw new ConflictException(
            'An organization must always have at least one ADMIN. Promote another member to ADMIN before demoting the last one.',
          );
        }
      }

      targetMembership.role = newRole;
      const saved = await manager.save(targetMembership);

      return {
        id: saved.id,
        userId: saved.userId,
        role: saved.role,
        user: {
          id: saved.user.id,
          email: saved.user.email,
          firstName: saved.user.firstName,
          lastName: saved.user.lastName,
        },
        createdAt: saved.createdAt,
      };
    });
  }
}
