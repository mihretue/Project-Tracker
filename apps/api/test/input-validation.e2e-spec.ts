import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

interface TestUser {
  token: string;
  id: string;
}

describe('Input validation: blank names, UUID params, money bounds (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let dataSource: DataSource;
  let admin: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let orgId: string;
  let projectId: string;
  let taskId: string;

  const server = () => app.getHttpServer();
  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

  const register = async (email: string): Promise<TestUser> => {
    const res = await request(server())
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', firstName: 'Val', lastName: 'Tester' })
      .expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  };

  const postProject = (body: Record<string, unknown>) =>
    request(server()).post('/api/projects').set(auth(admin)).send({ organizationId: orgId, ...body });
  const postTask = (body: Record<string, unknown>) =>
    request(server()).post('/api/tasks').set(auth(admin)).send({ projectId, ...body });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);

    await dataSource.query('DELETE FROM "tasks"');
    await dataSource.query('DELETE FROM "projects"');
    await dataSource.query('DELETE FROM "organization_memberships"');
    await dataSource.query('DELETE FROM "organizations"');
    await dataSource.query('DELETE FROM "users"');

    admin = await register('val-admin@example.test');
    member = await register('val-member@example.test');
    outsider = await register('val-outsider@example.test');

    const org = await request(server())
      .post('/api/organizations')
      .set(auth(admin))
      .send({ name: 'Validation Org', slug: 'validation-org' })
      .expect(201);
    orgId = org.body.id as string;
    await request(server())
      .post(`/api/organizations/${orgId}/members`)
      .set(auth(admin))
      .send({ userId: member.id, role: 'MEMBER' })
      .expect(201);

    const project = await postProject({ name: 'Base Project', budget: '1000.00' }).expect(201);
    projectId = project.body.id as string;
    const task = await postTask({ title: 'Base Task', estimatedCost: '10.00' }).expect(201);
    taskId = task.body.id as string;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('whitespace-only and padded names', () => {
    it.each(['', '   ', '\t\n  '])('rejects organization name %j', async (name) => {
      const before = await dataSource.query('SELECT COUNT(*)::int AS n FROM "organizations"');
      await request(server())
        .post('/api/organizations')
        .set(auth(admin))
        .send({ name, slug: `blank-${Math.random().toString(36).slice(2, 8)}` })
        .expect(400);
      const after = await dataSource.query('SELECT COUNT(*)::int AS n FROM "organizations"');
      expect(after[0].n).toBe(before[0].n);
    });

    it.each(['', '   '])('rejects project name %j on create and on update', async (name) => {
      await postProject({ name, budget: '10.00' }).expect(400);
      await request(server()).patch(`/api/projects/${projectId}`).set(auth(admin)).send({ name }).expect(400);
      const row = await dataSource.query('SELECT "name" FROM "projects" WHERE "id" = $1', [projectId]);
      expect(row[0].name).toBe('Base Project');
    });

    it.each(['', '   '])('rejects task title %j on create and on update', async (title) => {
      await postTask({ title, estimatedCost: '1.00' }).expect(400);
      await request(server()).patch(`/api/tasks/${taskId}`).set(auth(member)).send({ title }).expect(400);
      const row = await dataSource.query('SELECT "title" FROM "tasks" WHERE "id" = $1', [taskId]);
      expect(row[0].title).toBe('Base Task');
    });

    it('stores padded names trimmed', async () => {
      const org = await request(server())
        .post('/api/organizations')
        .set(auth(admin))
        .send({ name: '  Padded Org  ', slug: 'padded-org' })
        .expect(201);
      expect(org.body.name).toBe('Padded Org');

      const project = await postProject({ name: '  Padded Project ', budget: '5.00' }).expect(201);
      expect(project.body.name).toBe('Padded Project');

      const task = await postTask({ title: '  Padded Task ', estimatedCost: '5.00' }).expect(201);
      expect(task.body.title).toBe('Padded Task');
    });

    it('still lets a partial update omit the name', async () => {
      await request(server()).patch(`/api/projects/${projectId}`).set(auth(admin)).send({ budget: '1000.00' }).expect(200);
      await request(server()).patch(`/api/tasks/${taskId}`).set(auth(member)).send({ status: 'IN_PROGRESS' }).expect(200);
    });
  });

  describe('malformed organization ids on member routes (previously 500)', () => {
    it('GET /organizations/:id/members with a non-UUID id returns 400', async () => {
      const res = await request(server()).get('/api/organizations/abc/members').set(auth(admin)).expect(400);
      expect(JSON.stringify(res.body)).not.toMatch(/uuid.*syntax|QueryFailed|SELECT/i);
    });

    it('POST /organizations/:id/members with a non-UUID id returns 400', async () => {
      await request(server())
        .post('/api/organizations/abc/members')
        .set(auth(admin))
        .send({ userId: member.id, role: 'MEMBER' })
        .expect(400);
    });

    it('malformed organizationId in the query string returns 400', async () => {
      await request(server()).get('/api/projects?organizationId=abc').set(auth(admin)).expect(400);
    });

    it('a well-formed UUID of an organization the caller does not belong to is still 403', async () => {
      await request(server()).get(`/api/organizations/${orgId}/members`).set(auth(outsider)).expect(403);
      await request(server())
        .post(`/api/organizations/${orgId}/members`)
        .set(auth(outsider))
        .send({ userId: outsider.id, role: 'ADMIN' })
        .expect(403);
    });

    it('a MEMBER is still refused ADMIN-only member management', async () => {
      await request(server())
        .post(`/api/organizations/${orgId}/members`)
        .set(auth(member))
        .send({ userId: outsider.id, role: 'MEMBER' })
        .expect(403);
    });
  });

  describe('money bounds and precision (NUMERIC(14,2))', () => {
    it.each([
      ['1e15 as a number', 1e15],
      ['"99999999999999.99" (14 integer digits)', '99999999999999.99'],
      ['"1000000000000" (13 integer digits)', '1000000000000'],
      ['1e21 as a number', 1e21],
    ])('rejects project budget %s with 400, never 500', async (_label, budget) => {
      await postProject({ name: 'Too Big', budget }).expect(400);
      await request(server()).patch(`/api/projects/${projectId}`).set(auth(admin)).send({ budget }).expect(400);
    });

    it.each([1e15, '99999999999999.99'])('rejects task cost %p with 400, never 500', async (estimatedCost) => {
      await postTask({ title: 'Too Big', estimatedCost }).expect(400);
      await request(server()).patch(`/api/tasks/${taskId}`).set(auth(admin)).send({ estimatedCost }).expect(400);
    });

    it.each([
      ['number 123.456', 123.456],
      ['number 0.005', 0.005],
      ['string "100.505"', '100.505'],
    ])('rejects more than 2 decimals consistently (%s) instead of rounding', async (_label, value) => {
      await postProject({ name: 'Decimals', budget: value }).expect(400);
      await postTask({ title: 'Decimals', estimatedCost: value }).expect(400);
    });

    it.each([-1, '-5.00', 'abc', '', null])('still rejects invalid amount %p', async (value) => {
      await postProject({ name: 'Bad Amount', budget: value }).expect(400);
      await postTask({ title: 'Bad Amount', estimatedCost: value }).expect(400);
    });

    it('accepts the largest representable amount and plain numbers with <= 2 decimals', async () => {
      const big = await postProject({ name: 'Max Budget', budget: '999999999999.99' }).expect(201);
      expect(big.body.budget).toBe('999999999999.99');

      const numeric = await postProject({ name: 'Numeric Budget', budget: 12345.67 }).expect(201);
      expect(numeric.body.budget).toBe('12345.67');

      const whole = await postTask({ title: 'Whole Cost', estimatedCost: 20000 }).expect(201);
      expect(whole.body.estimatedCost).toBe('20000.00');

      const zero = await postTask({ title: 'Zero Cost', estimatedCost: '0' }).expect(201);
      expect(zero.body.estimatedCost).toBe('0.00');
    });
  });
});
