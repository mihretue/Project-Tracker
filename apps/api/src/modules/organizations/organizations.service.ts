import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationMembership } from './entities/organization-membership.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepository: Repository<Organization>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepository: Repository<OrganizationMembership>,
  ) {}

  async findAll(): Promise<Organization[]> {
    return this.orgRepository.find();
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.orgRepository.findOne({
      where: { id },
      relations: ['memberships', 'memberships.user', 'projects'],
    });

    if (!org) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }

    return org;
  }

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const existing = await this.orgRepository.findOne({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(`Organization with slug '${dto.slug}' already exists`);
    }

    const org = this.orgRepository.create({
      name: dto.name,
      slug: dto.slug,
    });
    return this.orgRepository.save(org);
  }

  async addMember(
    organizationId: string,
    dto: AddMemberDto,
  ): Promise<OrganizationMembership> {
    const org = await this.orgRepository.findOne({ where: { id: organizationId } });
    if (!org) {
      throw new NotFoundException(`Organization with ID ${organizationId} not found`);
    }

    const existingMembership = await this.membershipRepository.findOne({
      where: { organizationId, userId: dto.userId },
    });
    if (existingMembership) {
      throw new ConflictException('User is already a member of this organization');
    }

    const membership = this.membershipRepository.create({
      organizationId,
      userId: dto.userId,
      role: dto.role,
    });

    return this.membershipRepository.save(membership);
  }
}
