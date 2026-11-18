import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateOrganizationDto } from '../../modules/organizations/dto/create-organization.dto';
import { CreateProjectDto } from '../../modules/projects/dto/create-project.dto';
import { UpdateProjectDto } from '../../modules/projects/dto/update-project.dto';
import { CreateTaskDto } from '../../modules/tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../../modules/tasks/dto/update-task.dto';

const UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const errorsFor = async (cls: new () => object, payload: object): Promise<string[]> =>
  (await validate(plainToInstance(cls, payload))).map((e) => e.property);

describe('shared input validation', () => {
  describe('names are trimmed and must not be blank', () => {
    it.each(['', ' ', '   \t '])('rejects blank value %j on every name/title field', async (blank) => {
      expect(await errorsFor(CreateOrganizationDto, { name: blank, slug: 'ok' })).toContain('name');
      expect(await errorsFor(CreateProjectDto, { name: blank, budget: '1', organizationId: UUID })).toContain('name');
      expect(await errorsFor(UpdateProjectDto, { name: blank })).toContain('name');
      expect(await errorsFor(CreateTaskDto, { title: blank, estimatedCost: '1', projectId: UUID })).toContain('title');
      expect(await errorsFor(UpdateTaskDto, { title: blank })).toContain('title');
    });

    it('trims surrounding whitespace before the value is used', () => {
      const dto = plainToInstance(CreateProjectDto, { name: '  Padded  ', budget: '1', organizationId: UUID });
      expect(dto.name).toBe('Padded');
    });

    it('accepts updates that leave the name out', async () => {
      expect(await errorsFor(UpdateProjectDto, { budget: '10.00' })).toEqual([]);
      expect(await errorsFor(UpdateTaskDto, { status: 'DONE' })).not.toContain('title');
    });
  });

  describe('money', () => {
    const budgetErrors = (budget: unknown) =>
      errorsFor(CreateProjectDto, { name: 'P', budget, organizationId: UUID });

    it.each(['0', '0.5', '12345.67', '999999999999.99', 20000, 12345.67])('accepts %p', async (v) => {
      expect(await budgetErrors(v)).toEqual([]);
    });

    it.each([
      1e15,
      1e21,
      '1000000000000',
      '99999999999999.99',
      123.456,
      0.005,
      '100.505',
      '-1',
      -1,
      'abc',
      '',
      null,
      undefined,
    ])('rejects %p', async (v) => {
      expect(await budgetErrors(v)).toContain('budget');
    });

    it('applies the same rule to task costs and to updates', async () => {
      expect(await errorsFor(CreateTaskDto, { title: 'T', estimatedCost: 1e15, projectId: UUID })).toContain(
        'estimatedCost',
      );
      expect(await errorsFor(UpdateTaskDto, { estimatedCost: 123.456 })).toContain('estimatedCost');
      expect(await errorsFor(UpdateProjectDto, { budget: '99999999999999.99' })).toContain('budget');
      expect(await errorsFor(UpdateTaskDto, { estimatedCost: '999999999999.99' })).toEqual([]);
    });
  });
});
