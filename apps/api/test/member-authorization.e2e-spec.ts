import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { assertSafeConnection } from './helpers/db-safety';

/**
 * Server-side proof of the MEMBER permission model, by calling the API directly with MEMBER tokens
 * (the frontend hiding a button proves nothing about the backend).
 *
 *   MEMBER can:    view projects/tasks of their organization, create and edit tasks there,
 *                  create a separate organization (and become its first ADMIN).
 *   MEMBER cannot: create/edit/delete projects, delete tasks, add members, promote or demote members,
 *                  or touch anything in an organization they do not belong to.
 *
 * Every rejected call is followed by a database assertion that the rows are byte-for-byte unchanged,
 * so "403" can never hide a write that happened anyway.
 *
 * Safety: setup.ts refuses to start unless the environment names a LOCAL *_test database, and this file
 * re-checks the live connection (helpers/db-safety.ts). It never deletes rows it did not create
 * (all fixtures use per-run unique emails and slugs).
 */

const run = randomBytes(4).toString('hex');
const email = (name: string): string => `memberauth.${name}.${run}@security-test.com`;
const PASSWORD = 'Password123!';

describe('MEMBER authorization is enforced by the API, not the UI (e2e)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let dataSource: DataSource;

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({
    get: (url: string) => api().get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body?: object) => api().post(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url: string, body?: object) => api().patch(url).set('Authorization', `Bearer ${token}`).send(body),
    delete: (url: string) => api().delete(url).set('Authorization', `Bearer ${token}`),
  });

  const register = async (name: string): Promise<{ token: string; id: string }> => {
    const res = await api()
      .post('/api/auth/register')
      .send({ email: email(name), password: PASSWORD, firstName: name, lastName: 'Tester' })
      .expect(201);
    return { token: res.body.accessToken, id: res.body.user.id };
  };

  // Raw database reads, independent of the API under test
  const projectRow = async (id: string) =>
    (await dataSource.query('SELECT * FROM "projects" WHERE "id" = $1', [id]))[0];
  const taskRow = async (id: string) => (await dataSource.query('SELECT * FROM "tasks" WHERE "id" = $1', [id]))[0];
  const taskRowsOfProject = async (projectId: string) =>
    dataSource.query('SELECT * FROM "tasks" WHERE "projectId" = $1 ORDER BY "id"', [projectId]);
  const projectCount = async (orgId: string): Promise<number> =>
    Number((await dataSource.query('SELECT COUNT(*) FROM "projects" WHERE "organizationId" = $1', [orgId]))[0].count);
  const memberships = async (orgId: string) =>
    dataSource.query(
      'SELECT "userId", "role" FROM "organization_memberships" WHERE "organizationId" = $1 ORDER BY "userId"',
      [orgId],
    );
  const roleOf = async (orgId: string, userId: string): Promise<string | undefined> =>
    (await dataSource.query('SELECT "role" FROM "organization_memberships" WHERE "organizationId" = $1 AND "userId" = $2', [orgId, userId]))[0]?.role;

  // Users
  let admin: { token: string; id: string }; // ADMIN of Org A
  let member: { token: string; id: string }; // MEMBER of Org A (the actor under test)
  let peer: { token: string; id: string }; // another MEMBER of Org A (target of promotion attempts)
  let outsider: { token: string; id: string }; // ADMIN of Org X, not in Org A
  let candidate: { token: string; id: string }; // registered, in no organization (target of add-member attempts)

  let orgAId: string;
  let orgXId: string;
  let projectAId: string;
  let projectXId: string;
  let taskAId: string;
  let taskXId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);

    await assertSafeConnection(dataSource);

    admin = await register('admin');
    member = await register('member');
    peer = await register('peer');
    outsider = await register('outsider');
    candidate = await register('candidate');

    const orgA = await as(admin.token).post('/api/organizations', { name: `Org A ${run}`, slug: `org-a-${run}` }).expect(201);
    orgAId = orgA.body.id;
    const orgX = await as(outsider.token).post('/api/organizations', { name: `Org X ${run}`, slug: `org-x-${run}` }).expect(201);
    orgXId = orgX.body.id;

    await as(admin.token).post(`/api/organizations/${orgAId}/members`, { userId: member.id, role: 'MEMBER' }).expect(201);
    await as(admin.token).post(`/api/organizations/${orgAId}/members`, { userId: peer.id, role: 'MEMBER' }).expect(201);

    const projA = await as(admin.token)
      .post('/api/projects', { name: 'Alpha', description: 'Org A scope', budget: '500000.00', organizationId: orgAId })
      .expect(201);
    projectAId = projA.body.id;
    const projX = await as(outsider.token)
      .post('/api/projects', { name: 'Xray', description: 'Org X confidential', budget: '900000.00', organizationId: orgXId })
      .expect(201);
    projectXId = projX.body.id;

    const taskA = await as(admin.token)
      .post('/api/tasks', { title: 'Alpha task', description: 'Org A', estimatedCost: '35000.00', projectId: projectAId })
      .expect(201);
    taskAId = taskA.body.id;
    const taskX = await as(outsider.token)
      .post('/api/tasks', { title: 'Xray task', description: 'Org X', estimatedCost: '48000.00', projectId: projectXId })
      .expect(201);
    taskXId = taskX.body.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ---------------------------------------------------------------------------------------------
  describe('what a MEMBER may do in their own organization', () => {
    it('1. views the organization projects and a project by id (200)', async () => {
      const list = await as(member.token).get(`/api/projects?organizationId=${orgAId}`).expect(200);
      expect(list.body.map((p: { id: string }) => p.id)).toContain(projectAId);
      const one = await as(member.token).get(`/api/projects/${projectAId}`).expect(200);
      expect(one.body.name).toBe('Alpha');
    });

    it('2. views the tasks of a project and a task by id (200)', async () => {
      const list = await as(member.token).get(`/api/tasks?projectId=${projectAId}`).expect(200);
      expect(list.body.map((t: { id: string }) => t.id)).toContain(taskAId);
      const one = await as(member.token).get(`/api/tasks/${taskAId}`).expect(200);
      expect(one.body.title).toBe('Alpha task');
    });

    it('3. creates a task (201) and it really is stored in the database', async () => {
      const before = (await taskRowsOfProject(projectAId)).length;
      const res = await as(member.token)
        .post('/api/tasks', { title: 'Created by member', estimatedCost: '1200.50', durationDays: 3, projectId: projectAId })
        .expect(201);
      const row = await taskRow(res.body.id);
      expect(row).toMatchObject({ title: 'Created by member', projectId: projectAId, durationDays: 3 });
      expect((await taskRowsOfProject(projectAId)).length).toBe(before + 1);
    });

    it('4. edits a task (200) and the change is stored in the database', async () => {
      const res = await as(member.token)
        .patch(`/api/tasks/${taskAId}`, { title: 'Edited by member', status: 'IN_PROGRESS', priority: 'HIGH' })
        .expect(200);
      expect(res.body.title).toBe('Edited by member');
      expect(await taskRow(taskAId)).toMatchObject({ title: 'Edited by member', status: 'IN_PROGRESS', priority: 'HIGH' });
    });

    it('5. lists the organization members (200) - viewing is not an admin action', async () => {
      const res = await as(member.token).get(`/api/organizations/${orgAId}/members`).expect(200);
      expect(res.body.length).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('what a MEMBER may not do (403) - and nothing is written', () => {
    it('6. cannot create a project; no project row is added', async () => {
      const before = await projectCount(orgAId);
      const res = await as(member.token)
        .post('/api/projects', { name: 'Member project', description: 'x', budget: '1000.00', organizationId: orgAId })
        .expect(403);
      expect(res.body.message).toMatch(/admin/i);
      expect(await projectCount(orgAId)).toBe(before);
      const byName = await dataSource.query('SELECT 1 FROM "projects" WHERE "name" = $1', ['Member project']);
      expect(byName.length).toBe(0);
    });

    it('7. cannot edit a project (name, description or budget); the row is unchanged', async () => {
      const before = await projectRow(projectAId);
      for (const body of [{ name: 'Hijacked' }, { description: 'Hijacked scope' }, { budget: '1.00' }]) {
        const res = await as(member.token).patch(`/api/projects/${projectAId}`, body).expect(403);
        expect(res.body.message).toMatch(/admin/i);
      }
      expect(await projectRow(projectAId)).toEqual(before); // includes updatedAt
    });

    it('8. cannot delete a project; the project and all of its tasks survive', async () => {
      const projectBefore = await projectRow(projectAId);
      const tasksBefore = await taskRowsOfProject(projectAId);
      expect(tasksBefore.length).toBeGreaterThan(0);

      await as(member.token).delete(`/api/projects/${projectAId}`).expect(403);

      expect(await projectRow(projectAId)).toEqual(projectBefore);
      expect(await taskRowsOfProject(projectAId)).toEqual(tasksBefore);
    });

    it('9. cannot delete a task; the task row is unchanged', async () => {
      const before = await taskRow(taskAId);
      const res = await as(member.token).delete(`/api/tasks/${taskAId}`).expect(403);
      expect(res.body.message).toMatch(/admin/i);
      expect(await taskRow(taskAId)).toEqual(before);
    });

    it('10. cannot add members (by email or userId, as MEMBER or as ADMIN); no membership is created', async () => {
      const before = await memberships(orgAId);
      const attempts = [
        { email: email('candidate'), role: 'MEMBER' },
        { email: email('candidate'), role: 'ADMIN' },
        { userId: candidate.id, role: 'MEMBER' },
        { userId: candidate.id, role: 'ADMIN' },
      ];
      for (const body of attempts) {
        await as(member.token).post(`/api/organizations/${orgAId}/members`, body).expect(403);
      }
      expect(await memberships(orgAId)).toEqual(before);
      expect(await roleOf(orgAId, candidate.id)).toBeUndefined();
    });

    it('11. cannot promote another member to ADMIN; the role is unchanged', async () => {
      await as(member.token).patch(`/api/organizations/${orgAId}/members/${peer.id}`, { role: 'ADMIN' }).expect(403);
      expect(await roleOf(orgAId, peer.id)).toBe('MEMBER');
    });

    it('12. cannot promote themselves to ADMIN (privilege escalation); they stay MEMBER', async () => {
      await as(member.token).patch(`/api/organizations/${orgAId}/members/${member.id}`, { role: 'ADMIN' }).expect(403);
      expect(await roleOf(orgAId, member.id)).toBe('MEMBER');
      // and the still-MEMBER token cannot use any admin operation afterwards
      await as(member.token).delete(`/api/projects/${projectAId}`).expect(403);
    });

    it('13. cannot demote an ADMIN; the ADMIN keeps the role', async () => {
      await as(member.token).patch(`/api/organizations/${orgAId}/members/${admin.id}`, { role: 'MEMBER' }).expect(403);
      expect(await roleOf(orgAId, admin.id)).toBe('ADMIN');
    });

    it('14. a task cannot be moved into another organization through PATCH (400, row unchanged)', async () => {
      const before = await taskRow(taskAId);
      await as(member.token).patch(`/api/tasks/${taskAId}`, { projectId: projectXId }).expect(400);
      expect(await taskRow(taskAId)).toEqual(before);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('cross-tenant: a MEMBER of Org A against Org X (not their organization)', () => {
    it('15. cannot read Org X data (403)', async () => {
      await as(member.token).get(`/api/organizations/${orgXId}`).expect(403);
      await as(member.token).get(`/api/organizations/${orgXId}/members`).expect(403);
      await as(member.token).get(`/api/projects?organizationId=${orgXId}`).expect(403);
      await as(member.token).get(`/api/projects/${projectXId}`).expect(403);
      await as(member.token).get(`/api/tasks?projectId=${projectXId}`).expect(403);
      await as(member.token).get(`/api/tasks/${taskXId}`).expect(403);
    });

    it('16. cannot create, edit or delete anything in Org X; every Org X row is unchanged', async () => {
      const projectBefore = await projectRow(projectXId);
      const tasksBefore = await taskRowsOfProject(projectXId);
      const membersBefore = await memberships(orgXId);
      const projectsBefore = await projectCount(orgXId);

      await as(member.token)
        .post('/api/projects', { name: 'Injected', budget: '1.00', organizationId: orgXId })
        .expect(403);
      await as(member.token).patch(`/api/projects/${projectXId}`, { name: 'Tampered' }).expect(403);
      await as(member.token).delete(`/api/projects/${projectXId}`).expect(403);
      await as(member.token)
        .post('/api/tasks', { title: 'Injected task', estimatedCost: '1.00', projectId: projectXId })
        .expect(403);
      await as(member.token).patch(`/api/tasks/${taskXId}`, { title: 'Tampered task' }).expect(403);
      await as(member.token).delete(`/api/tasks/${taskXId}`).expect(403);
      await as(member.token)
        .post(`/api/organizations/${orgXId}/members`, { userId: member.id, role: 'ADMIN' })
        .expect(403);
      await as(member.token).patch(`/api/organizations/${orgXId}/members/${outsider.id}`, { role: 'MEMBER' }).expect(403);

      expect(await projectRow(projectXId)).toEqual(projectBefore);
      expect(await taskRowsOfProject(projectXId)).toEqual(tasksBefore);
      expect(await memberships(orgXId)).toEqual(membersBefore);
      expect(await projectCount(orgXId)).toBe(projectsBefore);
    });

    it('17. an organizationId in the body or query that differs from the project does not widen access', async () => {
      // Claiming membership of Org A while addressing an Org X project must not help
      await as(member.token)
        .post('/api/tasks', { title: 'Mismatch', estimatedCost: '1.00', projectId: projectXId, organizationId: orgAId })
        .expect(400); // organizationId is not an accepted task field
      await as(member.token).get(`/api/projects?organizationId=${orgAId}&organizationId=${orgXId}`).expect((res) => {
        expect([400, 403]).toContain(res.status);
      });
      expect((await taskRowsOfProject(projectXId)).length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('a MEMBER may create a separate organization and becomes its first ADMIN', () => {
    it('18. creates an organization (201, role ADMIN), is ADMIN in the database, and is still only MEMBER in Org A', async () => {
      const res = await as(member.token)
        .post('/api/organizations', { name: `Member Own ${run}`, slug: `member-own-${run}` })
        .expect(201);
      expect(res.body.role).toBe('ADMIN');
      const ownId = res.body.id;

      expect(await roleOf(ownId, member.id)).toBe('ADMIN');
      expect(await memberships(ownId)).toEqual([{ userId: member.id, role: 'ADMIN' }]);

      // Admin rights are per organization: they do not leak into Org A
      expect(await roleOf(orgAId, member.id)).toBe('MEMBER');
      await as(member.token).delete(`/api/projects/${projectAId}`).expect(403);

      // ...but inside their own organization the admin operations work
      const proj = await as(member.token)
        .post('/api/projects', { name: 'Own project', budget: '10.00', organizationId: ownId })
        .expect(201);
      expect(await projectRow(proj.body.id)).toMatchObject({ name: 'Own project', organizationId: ownId });
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('regression: ADMIN keeps the administrative permissions', () => {
    it('19. ADMIN can edit a project and add/change members; the changes are stored', async () => {
      await as(admin.token).patch(`/api/projects/${projectAId}`, { description: 'Admin updated scope' }).expect(200);
      expect((await projectRow(projectAId)).description).toBe('Admin updated scope');

      await as(admin.token).post(`/api/organizations/${orgAId}/members`, { userId: candidate.id, role: 'MEMBER' }).expect(201);
      expect(await roleOf(orgAId, candidate.id)).toBe('MEMBER');

      await as(admin.token).patch(`/api/organizations/${orgAId}/members/${candidate.id}`, { role: 'ADMIN' }).expect(200);
      expect(await roleOf(orgAId, candidate.id)).toBe('ADMIN');
    });

    it('20. ADMIN can create a project and delete a task; the rows change accordingly', async () => {
      const created = await as(admin.token)
        .post('/api/projects', { name: 'Admin project', budget: '2000.00', organizationId: orgAId })
        .expect(201);
      expect(await projectRow(created.body.id)).toBeDefined();

      const task = await as(admin.token)
        .post('/api/tasks', { title: 'To delete', estimatedCost: '5.00', projectId: created.body.id })
        .expect(201);
      await as(admin.token).delete(`/api/tasks/${task.body.id}`).expect(200);
      expect(await taskRow(task.body.id)).toBeUndefined();
    });
  });
});
