import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateProjectDto } from './create-project.dto';

describe('CreateProjectDto', () => {
  it('should validate valid project payload with positive ETB budget string', async () => {
    const payload = {
      name: 'Mobile Banking Portal',
      description: 'Modernization project',
      budget: '650000.50',
      organizationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    };

    const dto = plainToInstance(CreateProjectDto, payload);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid budget decimal or invalid UUID', async () => {
    const payload = {
      name: 'Test Project',
      budget: 'not-a-number',
      organizationId: 'not-a-uuid',
    };

    const dto = plainToInstance(CreateProjectDto, payload);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const propertyNames = errors.map((e) => e.property);
    expect(propertyNames).toContain('budget');
    expect(propertyNames).toContain('organizationId');
  });
});
