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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './entities/project.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('Projects')
@ApiBearerAuth('JWT-auth')
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @ApiOperation({ summary: 'Create a project with ETB budget (ADMIN only)' })
  @Post()
  async create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: User,
  ): Promise<Project> {
    return this.projectsService.create(dto, user.id);
  }

  @ApiOperation({ summary: 'List organization projects' })
  @ApiQuery({ name: 'organizationId', required: true, description: 'Organization UUID' })
  @Get()
  async findAll(
    @Query('organizationId', new ParseUUIDPipe({ optional: true })) organizationId: string | undefined,
    @CurrentUser() user: User,
  ): Promise<Project[]> {
    if (!organizationId) {
      throw new BadRequestException('Query parameter "organizationId" is required');
    }
    return this.projectsService.findByOrganization(organizationId, user.id);
  }

  @ApiOperation({ summary: 'Get project details by ID' })
  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<Project> {
    return this.projectsService.findById(id, user.id);
  }

  @ApiOperation({ summary: 'Update project details or budget (ADMIN only)' })
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: User,
  ): Promise<Project> {
    return this.projectsService.update(id, dto, user.id);
  }

  @ApiOperation({ summary: 'Delete project (ADMIN only)' })
  @Delete(':id')
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<{ deleted: true }> {
    return this.projectsService.delete(id, user.id);
  }
}
