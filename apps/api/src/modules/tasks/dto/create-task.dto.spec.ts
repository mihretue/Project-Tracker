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

  it.each([
    ['accepts a whole number of days', 14, false],
    ['accepts zero', 0, false],
    ['rejects a negative number', -1, true],
    ['rejects a fraction', 2.5, true],
    ['rejects text', 'two weeks', true],
    ['rejects an absurdly large value', 1000000, true],
  ])('durationDays: %s', async (_label, durationDays, shouldFail) => {
    const dto = plainToInstance(CreateTaskDto, {
      title: 'With duration',
      estimatedCost: '5000.00',
      projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      durationDays,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'durationDays')).toBe(shouldFail);
  });
});
