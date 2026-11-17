import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { OrganizationMembership } from '../organizations/entities/organization-membership.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { MembershipRole } from '../../common/enums/role.enum';
import Decimal from 'decimal.js';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepository: Repository<OrganizationMembership>,
  ) {}

  async create(dto: CreateProjectDto, userId: string): Promise<Project> {
    // 1. Verify organization membership & ADMIN role
    const membership = await this.membershipRepository.findOne({
      where: { organizationId: dto.organizationId, userId },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You are not a member of this organization',
      );
    }

    if (membership.role !== MembershipRole.ADMIN) {
      throw new ForbiddenException(
        'Access denied: Only organization admins can create projects',
      );
    }

    // 2. Format budget using decimal.js to guarantee 2-decimal precision
    const formattedBudget = new Decimal(dto.budget).toFixed(2);

    const project = this.projectRepository.create({
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      budget: formattedBudget,
      currency: 'ETB',
      organizationId: dto.organizationId,
    });

    return this.projectRepository.save(project);
  }

  async findByOrganization(
    organizationId: string,
    userId: string,
  ): Promise<Project[]> {
    // Verify membership
    const membership = await this.membershipRepository.findOne({
      where: { organizationId, userId },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You are not a member of this organization',
      );
    }

    return this.projectRepository.find({
      where: { organizationId },
      relations: ['tasks'],
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string, userId: string): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id },
      relations: ['tasks'],
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    // Tenant check: verify user is a member of the project's owning organization
    const membership = await this.membershipRepository.findOne({
      where: { organizationId: project.organizationId, userId },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You do not have access to this project',
      );
    }

    return project;
  }

  async update(
    id: string,
    dto: UpdateProjectDto,
    userId: string,
  ): Promise<Project> {
    const project = await this.projectRepository.findOne({ where: { id } });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    // Only organization ADMIN can update projects
    const membership = await this.membershipRepository.findOne({
      where: { organizationId: project.organizationId, userId },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You do not have access to this project',
      );
    }

    if (membership.role !== MembershipRole.ADMIN) {
      throw new ForbiddenException(
        'Access denied: Only organization admins can update projects',
      );
    }

    if (dto.name !== undefined) {
      project.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      project.description = dto.description.trim() || null;
    }
    if (dto.budget !== undefined) {
      project.budget = new Decimal(dto.budget).toFixed(2);
    }

    return this.projectRepository.save(project);
  }

  async delete(id: string, userId: string): Promise<{ deleted: true }> {
    const project = await this.projectRepository.findOne({ where: { id } });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    const membership = await this.membershipRepository.findOne({
      where: { organizationId: project.organizationId, userId },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You do not have access to this project',
      );
    }

    if (membership.role !== MembershipRole.ADMIN) {
      throw new ForbiddenException(
        'Access denied: Only organization admins can delete projects',
      );
    }

    await this.projectRepository.remove(project);
    return { deleted: true };
  }
}
