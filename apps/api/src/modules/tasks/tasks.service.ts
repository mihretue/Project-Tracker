import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskStatus } from '../../common/enums/task-status.enum';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
  ) {}

  async findAll(): Promise<Task[]> {
    return this.taskRepository.find({ relations: ['project'] });
  }

  async findById(id: string): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { id },
      relations: ['project'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async findByProject(projectId: string): Promise<Task[]> {
    return this.taskRepository.find({
      where: { projectId },
    });
  }

  async create(dto: CreateTaskDto): Promise<Task> {
    const task = this.taskRepository.create({
      title: dto.title,
      description: dto.description || null,
      status: dto.status || TaskStatus.TODO,
      estimatedCost: dto.estimatedCost,
      currency: 'ETB',
      projectId: dto.projectId,
    });
    return this.taskRepository.save(task);
  }
}
