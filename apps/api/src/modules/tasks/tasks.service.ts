import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { Project } from '../projects/entities/project.entity';
import { OrganizationMembership } from '../organizations/entities/organization-membership.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { MembershipRole } from '../../common/enums/role.enum';
import Decimal from 'decimal.js';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepository: Repository<OrganizationMembership>,
  ) {}

  async create(dto: CreateTaskDto, userId: string): Promise<Task> {
    // 1. Verify parent project exists
    const project = await this.projectRepository.findOne({
      where: { id: dto.projectId },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${dto.projectId} not found`);
    }

    // 2. Verify user has membership in the parent project's organization
    const membership = await this.membershipRepository.findOne({
      where: { organizationId: project.organizationId, userId },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You do not have access to this project',
      );
    }

    // 3. Format estimated cost using decimal.js
    const formattedCost = new Decimal(dto.estimatedCost).toFixed(2);

    const task = this.taskRepository.create({
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      status: dto.status || TaskStatus.TODO,
      priority: dto.priority || TaskPriority.MEDIUM,
      estimatedCost: formattedCost,
      currency: 'ETB',
      durationDays: dto.durationDays ?? null,
      projectId: dto.projectId,
    });

    return this.taskRepository.save(task);
  }

  async findByProject(
    projectId: string,
    userId: string,
    priority?: TaskPriority,
  ): Promise<Task[]> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    const membership = await this.membershipRepository.findOne({
      where: { organizationId: project.organizationId, userId },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You do not have access to this project',
      );
    }

    const whereClause: { projectId: string; priority?: TaskPriority } = {
      projectId,
    };
    if (priority) {
      whereClause.priority = priority;
    }

    return this.taskRepository.find({
      where: whereClause,
      order: { createdAt: 'ASC' },
    });
  }

  async findById(id: string, userId: string): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { id },
      relations: ['project'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // Tenant check: derive organization from parent project
    const membership = await this.membershipRepository.findOne({
      where: { organizationId: task.project.organizationId, userId },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You do not have access to this task',
      );
    }

    return task;
  }

  async update(id: string, dto: UpdateTaskDto, userId: string): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { id },
      relations: ['project'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const membership = await this.membershipRepository.findOne({
      where: { organizationId: task.project.organizationId, userId },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You do not have access to this task',
      );
    }

    if (dto.title !== undefined) {
      task.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      task.description = dto.description.trim() || null;
    }
    if (dto.status !== undefined) {
      task.status = dto.status;
    }
    if (dto.priority !== undefined) {
      task.priority = dto.priority;
    }
    if (dto.estimatedCost !== undefined) {
      task.estimatedCost = new Decimal(dto.estimatedCost).toFixed(2);
    }
    // undefined = leave unchanged, null = clear it
    if (dto.durationDays !== undefined) {
      task.durationDays = dto.durationDays;
    }

    return this.taskRepository.save(task);
  }

  async delete(id: string, userId: string): Promise<{ deleted: true }> {
    const task = await this.taskRepository.findOne({
      where: { id },
      relations: ['project'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const membership = await this.membershipRepository.findOne({
      where: { organizationId: task.project.organizationId, userId },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You do not have access to this task',
      );
    }

    if (membership.role !== MembershipRole.ADMIN) {
      throw new ForbiddenException(
        'Access denied: Only organization admins can delete tasks',
      );
    }

    await this.taskRepository.remove(task);
    return { deleted: true };
  }
}
