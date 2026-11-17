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
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task } from './entities/task.entity';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('Tasks')
@ApiBearerAuth('JWT-auth')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @ApiOperation({ summary: 'Create deliverable task (priority: LOW, MEDIUM, HIGH)' })
  @Post()
  async create(
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: User,
  ): Promise<Task> {
    return this.tasksService.create(dto, user.id);
  }

  @ApiOperation({ summary: 'List tasks in project with optional priority filter' })
  @ApiQuery({ name: 'projectId', required: true, description: 'Project UUID' })
  @ApiQuery({ name: 'priority', required: false, enum: TaskPriority, description: 'Filter by priority (LOW, MEDIUM, HIGH)' })
  @Get()
  async findByProject(
    @Query('projectId') projectId: string | undefined,
    @Query('priority') priority: TaskPriority | undefined,
    @CurrentUser() user: User,
  ): Promise<Task[]> {
    if (!projectId) {
      throw new BadRequestException('Query parameter "projectId" is required');
    }
    return this.tasksService.findByProject(projectId, user.id, priority);
  }

  @ApiOperation({ summary: 'Get task by ID' })
  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<Task> {
    return this.tasksService.findById(id, user.id);
  }

  @ApiOperation({ summary: 'Update task status, priority, or estimated cost' })
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: User,
  ): Promise<Task> {
    return this.tasksService.update(id, dto, user.id);
  }

  @ApiOperation({ summary: 'Delete task (ADMIN only)' })
  @Delete(':id')
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<{ deleted: true }> {
    return this.tasksService.delete(id, user.id);
  }
}
