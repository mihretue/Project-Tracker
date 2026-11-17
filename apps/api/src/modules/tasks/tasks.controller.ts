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
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task } from './entities/task.entity';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  async create(
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: User,
  ): Promise<Task> {
    return this.tasksService.create(dto, user.id);
  }

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

  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<Task> {
    return this.tasksService.findById(id, user.id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: User,
  ): Promise<Task> {
    return this.tasksService.update(id, dto, user.id);
  }

  @Delete(':id')
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<{ deleted: true }> {
    return this.tasksService.delete(id, user.id);
  }
}
