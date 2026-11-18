import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { createPlatformAdmin } from './helpers/platform-admin';

describe('Tenant Isolation & Cross-Tenant Security (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let dataSource: DataSource;

  // Tokens & IDs
  let tokenPlatformAdmin: string;

  let tokenUserA: string;
  let userAId: string;

  let tokenUserB: string;
  let userBId: string;

  let tokenUserC: string;
  let userCId: string;

  let orgAId: string;
  let orgBId: string;

  let projectAId: string;
  let projectBId: string;

  let taskAId: string;
  let taskBId: string;

  beforeAll(async () => {
    // Ensure environment points to test postgres instance
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

    // Clean test data safely
    await dataSource.query('DELETE FROM "tasks"');
    await dataSource.query('DELETE FROM "projects"');
    await dataSource.query('DELETE FROM "organization_memberships"');
    await dataSource.query('DELETE FROM "organizations"');
    await dataSource.query('DELETE FROM "users"');

    // 1. Register User A
    const regResA = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'user.a@security-test.com',
        password: 'Password123!',
        firstName: 'Alice',
        lastName: 'Admin',
      })
      .expect(201);
    tokenUserA = regResA.body.accessToken;
    userAId = regResA.body.user.id;

    // 2. Register User B
    const regResB = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'user.b@security-test.com',
        password: 'Password123!',
        firstName: 'Bob',
        lastName: 'Admin',
      })
      .expect(201);
    tokenUserB = regResB.body.accessToken;
    userBId = regResB.body.user.id;

    // 3. Register User C (MEMBER candidate)
    const regResC = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'user.c@security-test.com',
        password: 'Password123!',
        firstName: 'Charlie',
        lastName: 'Member',
      })
      .expect(201);
    tokenUserC = regResC.body.accessToken;
    userCId = regResC.body.user.id;

    // 3b. Platform administrator (provisioned server-side) creates the organizations
    tokenPlatformAdmin = (
      await createPlatformAdmin(app, dataSource, 'platform.admin@security-test.com')
    ).token;

    // 4. Platform admin creates Organization A with User A as initial ADMIN
    const orgResA = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
      .send({
        name: 'Organization A Corp',
        slug: 'org-a',
        initialAdminUserId: userAId,
      })
      .expect(201);
    orgAId = orgResA.body.id;

    // 5. Platform admin creates Organization B with User B as initial ADMIN
    const orgResB = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
      .send({
        name: 'Organization B Ltd',
        slug: 'org-b',
        initialAdminUserId: userBId,
      })
      .expect(201);
    orgBId = orgResB.body.id;

    // 6. User A creates Project A in Organization A
    const projResA = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        name: 'Project Alpha',
        description: 'Org A confidential deliverables',
        budget: '500000.00',
        organizationId: orgAId,
      })
      .expect(201);
    projectAId = projResA.body.id;

    // 7. User A creates Task A in Project A
    const taskResA = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        title: 'Task Alpha 1',
        description: 'Internal Org A Task',
        estimatedCost: '35000.00',
        projectId: projectAId,
      })
      .expect(201);
    taskAId = taskResA.body.id;

    // 8. User B creates Project B in Organization B
    const projResB = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${tokenUserB}`)
      .send({
        name: 'Project Beta',
        description: 'Org B sensitive financials',
        budget: '750000.00',
        organizationId: orgBId,
      })
      .expect(201);
    projectBId = projResB.body.id;

    // 9. User B creates Task B in Project B
    const taskResB = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUserB}`)
      .send({
        title: 'Task Beta 1',
        description: 'Confidential Org B Task',
        estimatedCost: '48000.00',
        projectId: projectBId,
      })
      .expect(201);
    taskBId = taskResB.body.id;

    // 10. User A adds User C as MEMBER to Organization A
    await request(app.getHttpServer())
      .post(`/api/organizations/${orgAId}/members`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        userId: userCId,
        role: 'MEMBER',
      })
      .expect(201);

    // 11. User B adds User A as MEMBER to Organization B (to test multi-tenancy)
    await request(app.getHttpServer())
      .post(`/api/organizations/${orgBId}/members`)
      .set('Authorization', `Bearer ${tokenUserB}`)
      .send({
        userId: userAId,
        role: 'MEMBER',
      })
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // Test 1: Unauthenticated requests are rejected
  it('1. Unauthenticated requests are rejected with 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .get('/api/organizations')
      .expect(401);

    await request(app.getHttpServer())
      .get(`/api/projects?organizationId=${orgAId}`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`/api/tasks/${taskAId}`)
      .expect(401);
  });

  // Test 2: Users can access their own organization
  it('2. Users can access their own authorized organization', async () => {
    const resA = await request(app.getHttpServer())
      .get(`/api/organizations/${orgAId}`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(200);

    expect(resA.body.id).toBe(orgAId);
    expect(resA.body.name).toBe('Organization A Corp');

    const resB = await request(app.getHttpServer())
      .get(`/api/organizations/${orgBId}`)
      .set('Authorization', `Bearer ${tokenUserB}`)
      .expect(200);

    expect(resB.body.id).toBe(orgBId);
    expect(resB.body.name).toBe('Organization B Ltd');
  });

  // Test 3: Users cannot list another organization's projects
  it('3. User C (not in Org B) cannot list Organization B projects', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/projects?organizationId=${orgBId}`)
      .set('Authorization', `Bearer ${tokenUserC}`)
      .expect(403);

    expect(res.body.message).toContain('Access denied');
  });

  // Test 4: Users cannot retrieve another organization's project by ID
  it('4. User C cannot retrieve Organization B project by ID', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectBId}`)
      .set('Authorization', `Bearer ${tokenUserC}`)
      .expect(403);

    expect(res.body.message).toContain('Access denied');
  });

  // Test 5: Users cannot update or delete another organization's project
  it('5. User C cannot update or delete Organization B project', async () => {
    await request(app.getHttpServer())
      .patch(`/api/projects/${projectBId}`)
      .set('Authorization', `Bearer ${tokenUserC}`)
      .send({ name: 'Tampered Project Name' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/projects/${projectBId}`)
      .set('Authorization', `Bearer ${tokenUserC}`)
      .expect(403);
  });

  // Test 6: Users cannot access tasks through another organization's project
  it('6. User C cannot list or create tasks for another organization project', async () => {
    await request(app.getHttpServer())
      .get(`/api/tasks?projectId=${projectBId}`)
      .set('Authorization', `Bearer ${tokenUserC}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenUserC}`)
      .send({
        title: 'Malicious Task Injection',
        estimatedCost: '1000.00',
        projectId: projectBId,
      })
      .expect(403);
  });

  // Test 7: Users cannot access another organization's task by manipulating task IDs
  it('7. User C cannot read, update, or delete Organization B task by ID manipulation', async () => {
    await request(app.getHttpServer())
      .get(`/api/tasks/${taskBId}`)
      .set('Authorization', `Bearer ${tokenUserC}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskBId}`)
      .set('Authorization', `Bearer ${tokenUserC}`)
      .send({ title: 'Tampered Task Title' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/tasks/${taskBId}`)
      .set('Authorization', `Bearer ${tokenUserC}`)
      .expect(403);
  });

  // Test 8: Members cannot perform ADMIN-only operations
  it('8. Organization MEMBER cannot add members, modify roles, or delete projects', async () => {
    // User C is MEMBER of Organization A
    await request(app.getHttpServer())
      .post(`/api/organizations/${orgAId}/members`)
      .set('Authorization', `Bearer ${tokenUserC}`)
      .send({
        email: 'intruder@test.com',
        role: 'ADMIN',
      })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/organizations/${orgAId}/members/${userAId}`)
      .set('Authorization', `Bearer ${tokenUserC}`)
      .send({ role: 'MEMBER' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/projects/${projectAId}`)
      .set('Authorization', `Bearer ${tokenUserC}`)
      .expect(403);
  });

  // Test 9: A user who belongs to two organizations can access both with correct roles
  it('9. User A belongs to Org A (ADMIN) and Org B (MEMBER) and role permissions are strictly enforced per tenant', async () => {
    // User A in Org A: ADMIN -> can add member
    const newMemberRes = await request(app.getHttpServer())
      .post(`/api/organizations/${orgAId}/members`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        userId: userBId,
        role: 'MEMBER',
      })
      .expect(201);
    expect(newMemberRes.body.role).toBe('MEMBER');

    // User A in Org B: MEMBER -> can view Org B projects
    const listRes = await request(app.getHttpServer())
      .get(`/api/projects?organizationId=${orgBId}`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(200);
    expect(listRes.body.length).toBeGreaterThan(0);

    // User A in Org B: MEMBER -> CANNOT perform ADMIN actions (e.g. deleting project in Org B)
    await request(app.getHttpServer())
      .delete(`/api/projects/${projectBId}`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .expect(403);
  });

  // Test 10: Organization creation is platform-level; the creator is not auto-assigned as ADMIN
  it('10. Platform admin creates an org for a chosen ADMIN and gains no membership in it', async () => {
    const freshOrg = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
      .send({
        name: 'Charlies Autonomous Org',
        slug: 'charlie-org',
        initialAdminUserId: userCId,
      })
      .expect(201);

    expect(freshOrg.body.initialAdmin.userId).toBe(userCId);

    // Charlie is the ADMIN of the new organization
    const memberList = await request(app.getHttpServer())
      .get(`/api/organizations/${freshOrg.body.id}/members`)
      .set('Authorization', `Bearer ${tokenUserC}`)
      .expect(200);

    expect(memberList.body.length).toBe(1);
    expect(memberList.body[0].userId).toBe(userCId);
    expect(memberList.body[0].role).toBe('ADMIN');

    // The platform admin created it but is not a member: tenant isolation still applies to them
    await request(app.getHttpServer())
      .get(`/api/organizations/${freshOrg.body.id}/members`)
      .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
      .expect(403);
  });
});
