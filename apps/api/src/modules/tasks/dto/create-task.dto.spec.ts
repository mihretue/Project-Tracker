import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTaskDto } from './create-task.dto';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { TaskStatus } from '../../../common/enums/task-status.enum';

describe('CreateTaskDto', () => {
  it('should validate task payload with explicit priority', async () => {
    const payload = {
      title: 'Database Indexing Optimization',
      description: 'Add composite indexes on high-traffic queries',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      estimatedCost: '35000.00',
      projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    };

    const dto = plainToInstance(CreateTaskDto, payload);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.priority).toBe(TaskPriority.HIGH);
  });

  it('should validate task payload when priority is omitted (defaults handled by service/db)', async () => {
    const payload = {
      title: 'Update Documentation',
      estimatedCost: '5000.00',
      projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    };

    const dto = plainToInstance(CreateTaskDto, payload);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.priority).toBeUndefined();
  });

  it('should reject invalid priority values', async () => {
    const payload = {
      title: 'Invalid Task',
      priority: 'CRITICAL', // Not in LOW, MEDIUM, HIGH
      estimatedCost: '5000.00',
      projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    };

    const dto = plainToInstance(CreateTaskDto, payload);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const priorityError = errors.find((e) => e.property === 'priority');
    expect(priorityError).toBeDefined();
  });
});
