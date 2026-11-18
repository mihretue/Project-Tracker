import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TaskPriority } from '../src/common/enums/task-priority.enum';
import { createPlatformAdmin } from './helpers/platform-admin';

describe('Task Priority & Filtering (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let dataSource: DataSource;

  let tokenPlatformAdmin: string;
  let tokenUserA: string;
  let tokenUserB: string;
  let userAId: string;
  let userBId: string;

  let orgAId: string;
  let orgBId: string;

  let projectAId: string;
  let projectBId: string;

  beforeAll(async () => {
    process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || '5433';
    process.env.POSTGRES_DB = process.env.POSTGRES_DB || 'tenant_project_tracker';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);

    // Clean test data
    await dataSource.query('DELETE FROM "tasks"');
    await dataSource.query('DELETE FROM "projects"');
    await dataSource.query('DELETE FROM "organization_memberships"');
    await dataSource.query('DELETE FROM "organizations"');
    await dataSource.query('DELETE FROM "users"');

    // 1. Register User A
    const regResA = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'priority.alice@test.com',
        password: 'Password123!',
        firstName: 'Alice',
        lastName: 'Priority',
      })
      .expect(201);
    tokenUserA = regResA.body.accessToken;
    userAId = regResA.body.user.id;

    // 2. Register User B (Foreign tenant)
    const regResB = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'priority.bob@test.com',
        password: 'Password123!',
        firstName: 'Bob',
        lastName: 'Priority',
      })
      .expect(201);
    tokenUserB = regResB.body.accessToken;
    userBId = regResB.body.user.id;

    tokenPlatformAdmin = (
      await createPlatformAdmin(app, dataSource, 'priority.platform@test.com')
    ).token;

    // 3. Platform admin creates Organization A with User A as initial ADMIN
    const orgResA = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
      .send({
        name: 'Priority Test Corp',
        slug: 'priority-corp',
        initialAdminUserId: userAId,
      })
      .expect(201);
    orgAId = orgResA.body.id;

    // 4. Platform admin creates Organization B with User B as initial ADMIN
    const orgResB = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
      .send({
        name: 'Foreign Priority Ltd',
        slug: 'foreign-priority',
        initialAdminUserId: userBId,
      })
      .expect(201);
    orgBId = orgResB.body.id;

    // 5. User A creates Project A
    const projResA = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        name: 'Project Priority Engine',
        description: 'Testing task priorities',
        budget: '250000.00',
        organizationId: orgAId,
      })
      .expect(201);
    projectAId = projResA.body.id;

    // 6. User B creates Project B
    const projResB = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${tokenUserB}`)
      .send({
        name: 'Project Foreign',
        description: 'Foreign tenant project',
        budget: '150000.00',
        organizationId: orgBId,
      })
      .expect(201);
    projectBId = projResB.body.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. Task creation defaults to MEDIUM priority when priority is omitted', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        title: 'Task without explicit priority',
        estimatedCost: '10000.00',
        projectId: projectAId,
      })
      .expect(201);

    expect(res.body.priority).toBe(TaskPriority.MEDIUM);
  });

  it('2. Supports explicit LOW, MEDIUM, and HIGH priorities during creation', async () => {
    // LOW priority
    const resLow = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        title: 'Low Priority Routine Task',
        priority: TaskPriority.LOW,
        estimatedCost: '5000.00',
        projectId: projectAId,
      })
      .expect(201);
    expect(resLow.body.priority).toBe(TaskPriority.LOW);

    // MEDIUM priority
    const resMed = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        title: 'Medium Priority Standard Task',
        priority: TaskPriority.MEDIUM,
        estimatedCost: '15000.00',
        projectId: projectAId,
      })
      .expect(201);
    expect(resMed.body.priority).toBe(TaskPriority.MEDIUM);

    // HIGH priority
    const resHigh = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        title: 'High Priority Critical Bug',
        priority: TaskPriority.HIGH,
        estimatedCost: '35000.00',
        projectId: projectAId,
      })
      .expect(201);
    expect(resHigh.body.priority).toBe(TaskPriority.HIGH);
  });

  it('3. Filters tasks strictly by priority query parameter', async () => {
    // Filter HIGH tasks
    const highRes = await request(app.getHttpServer())
      .get(`/api/tasks?projectId=${projectAId}&priority=HIGH`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(200);

    expect(highRes.body.length).toBe(1);
    expect(highRes.body[0].title).toBe('High Priority Critical Bug');
    expect(highRes.body[0].priority).toBe(TaskPriority.HIGH);

    // Filter LOW tasks
    const lowRes = await request(app.getHttpServer())
      .get(`/api/tasks?projectId=${projectAId}&priority=LOW`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(200);

    expect(lowRes.body.length).toBe(1);
    expect(lowRes.body[0].title).toBe('Low Priority Routine Task');
    expect(lowRes.body[0].priority).toBe(TaskPriority.LOW);

    // Filter MEDIUM tasks (1 default + 1 explicit = 2)
    const medRes = await request(app.getHttpServer())
      .get(`/api/tasks?projectId=${projectAId}&priority=MEDIUM`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(200);

    expect(medRes.body.length).toBe(2);
    expect(medRes.body.every((t: { priority: string }) => t.priority === TaskPriority.MEDIUM)).toBe(true);

    // Unfiltered fetch returns all 4 tasks
    const allRes = await request(app.getHttpServer())
      .get(`/api/tasks?projectId=${projectAId}`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(200);

    expect(allRes.body.length).toBe(4);
  });

  it('4. Allows updating task priority via PATCH /api/tasks/:id', async () => {
    // Create LOW task
    const createRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        title: 'Task to escalate',
        priority: TaskPriority.LOW,
        estimatedCost: '8000.00',
        projectId: projectAId,
      })
      .expect(201);

    const taskId = createRes.body.id;
    expect(createRes.body.priority).toBe(TaskPriority.LOW);

    // Escalate to HIGH
    const updateRes = await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        priority: TaskPriority.HIGH,
      })
      .expect(200);

    expect(updateRes.body.priority).toBe(TaskPriority.HIGH);

    // Verify persisted
    const getRes = await request(app.getHttpServer())
      .get(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(200);

    expect(getRes.body.priority).toBe(TaskPriority.HIGH);
  });

  it('5. Priority filtering preserves tenant isolation and rejects unauthorized access', async () => {
    // User B attempts to filter tasks in User A's project
    const breachRes = await request(app.getHttpServer())
      .get(`/api/tasks?projectId=${projectAId}&priority=HIGH`)
      .set('Authorization', `Bearer ${tokenUserB}`)
      .expect(403);

    expect(breachRes.body.message).toContain('Access denied');
  });

  describe('priority query validation', () => {
    const listTasks = (query: string, token: string = tokenUserA) =>
      request(app.getHttpServer())
        .get(`/api/tasks?projectId=${projectAId}${query}`)
        .set('Authorization', `Bearer ${token}`);

    it('6. Rejects values outside LOW, MEDIUM, HIGH with 400 (not 500)', async () => {
      for (const bad of ['URGENT', 'high', 'Medium', '', '0', 'HIGH%20', 'null', 'undefined']) {
        const res = await listTasks(`&priority=${bad}`).expect(400);
        expect(res.body.statusCode).toBe(400);
      }
    });

    it('7. Rejects repeated or malformed priority parameters with 400', async () => {
      await listTasks('&priority=LOW&priority=HIGH').expect(400);
      await listTasks('&priority[]=LOW').expect(400);
      await listTasks("&priority=HIGH'%20OR%20'1'='1").expect(400);
    });

    it('8. A missing priority returns all tasks of the project', async () => {
      const res = await listTasks('').expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(4);
      const priorities = new Set(res.body.map((t: { priority: string }) => t.priority));
      expect(priorities).toEqual(new Set(['LOW', 'MEDIUM', 'HIGH']));
    });

    it('9. Each valid priority returns only tasks with that priority', async () => {
      for (const valid of Object.values(TaskPriority)) {
        const res = await listTasks(`&priority=${valid}`).expect(200);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body.every((t: { priority: string }) => t.priority === valid)).toBe(true);
      }
    });

    it('10. Validation does not weaken tenant isolation: foreign users still get 403 for valid values', async () => {
      await listTasks('&priority=LOW', tokenUserB).expect(403);
      await listTasks('', tokenUserB).expect(403);
    });
  });
});
