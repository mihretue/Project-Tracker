import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './entities/project.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  async create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: User,
  ): Promise<Project> {
    return this.projectsService.create(dto, user.id);
  }

  @Get()
  async findAll(
    @Query('organizationId') organizationId: string | undefined,
    @CurrentUser() user: User,
  ): Promise<Project[]> {
    if (!organizationId) {
      throw new BadRequestException('Query parameter "organizationId" is required');
    }
    return this.projectsService.findByOrganization(organizationId, user.id);
  }

  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<Project> {
    return this.projectsService.findById(id, user.id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: User,
  ): Promise<Project> {
    return this.projectsService.update(id, dto, user.id);
  }

  @Delete(':id')
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<{ deleted: true }> {
    return this.projectsService.delete(id, user.id);
  }
}
