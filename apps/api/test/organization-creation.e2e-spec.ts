import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

interface TestUser {
  token: string;
  id: string;
  email: string;
}

describe('Self-Service Organization Creation and Membership (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let dataSource: DataSource;

  const registerUser = async (email: string, firstName: string): Promise<TestUser> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', firstName, lastName: 'Tester' })
      .expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string, email };
  };

  const createOrg = (user: TestUser, slug: string) =>
    request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: `Org ${slug}`, slug });

  const addMember = (orgId: string, actor: TestUser, userId: string, role: 'ADMIN' | 'MEMBER') =>
    request(app.getHttpServer())
      .post(`/api/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ userId, role });

  const membershipsOf = async (userId: string): Promise<Array<{ organizationId: string; role: string }>> =>
    dataSource.query(
      'SELECT "organizationId", "role" FROM "organization_memberships" WHERE "userId" = $1',
      [userId],
    );

  beforeAll(async () => {
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

    await dataSource.query('DELETE FROM "tasks"');
    await dataSource.query('DELETE FROM "projects"');
    await dataSource.query('DELETE FROM "organization_memberships"');
    await dataSource.query('DELETE FROM "organizations"');
    await dataSource.query('DELETE FROM "users"');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. An unauthenticated user cannot create an organization (401) and nothing is created', async () => {
    await request(app.getHttpServer())
      .post('/api/organizations')
      .send({ name: 'Anon Org', slug: 'anon-org' })
      .expect(401);

    const rows: Array<{ count: string }> = await dataSource.query(
      `SELECT count(*) FROM "organizations" WHERE "slug" = 'anon-org'`,
    );
    expect(parseInt(rows[0].count, 10)).toBe(0);
  });

  it('2. A newly registered user starts with no organizations, then can create one and continue', async () => {
    const fresh = await registerUser('fresh@org-creation.test', 'Fresh');

    const before = await request(app.getHttpServer())
      .get('/api/organizations')
      .set('Authorization', `Bearer ${fresh.token}`)
      .expect(200);
    expect(before.body.items).toHaveLength(0);

    const created = await createOrg(fresh, 'fresh-org').expect(201);
    expect(created.body.slug).toBe('fresh-org');
    expect(created.body.role).toBe('ADMIN');

    const after = await request(app.getHttpServer())
      .get('/api/organizations')
      .set('Authorization', `Bearer ${fresh.token}`)
      .expect(200);
    expect(after.body.items.map((o: { id: string }) => o.id)).toEqual([created.body.id]);
    expect(after.body.items[0].role).toBe('ADMIN');
  });

  it('3. The creator automatically becomes the ADMIN: exactly one membership, created with the org', async () => {
    const creator = await registerUser('creator@org-creation.test', 'Creator');
    const res = await createOrg(creator, 'creator-org').expect(201);

    const rows: Array<{ userId: string; role: string }> = await dataSource.query(
      'SELECT "userId", "role" FROM "organization_memberships" WHERE "organizationId" = $1',
      [res.body.id],
    );
    expect(rows).toEqual([{ userId: creator.id, role: 'ADMIN' }]);

    // The creator can exercise ADMIN rights immediately
    const members = await request(app.getHttpServer())
      .get(`/api/organizations/${res.body.id}/members`)
      .set('Authorization', `Bearer ${creator.token}`)
      .expect(200);
    expect(members.body).toHaveLength(1);
    expect(members.body[0].role).toBe('ADMIN');
  });

  it('4. Nobody can pick another user as the initial admin or inject membership fields at creation', async () => {
    const creator = await registerUser('inject@org-creation.test', 'Inject');
    const other = await registerUser('other@org-creation.test', 'Other');

    for (const extra of [
      { initialAdminUserId: other.id },
      { role: 'MEMBER' },
      { userId: other.id },
    ]) {
      await request(app.getHttpServer())
        .post('/api/organizations')
        .set('Authorization', `Bearer ${creator.token}`)
        .send({ name: 'Inject Org', slug: 'inject-org', ...extra })
        .expect(400);
    }
    const rows: Array<{ count: string }> = await dataSource.query(
      `SELECT count(*) FROM "organizations" WHERE "slug" = 'inject-org'`,
    );
    expect(parseInt(rows[0].count, 10)).toBe(0);
  });

  it('5. A duplicate slug is refused (409) and leaves no stray membership behind', async () => {
    const a = await registerUser('dup.a@org-creation.test', 'DupA');
    const b = await registerUser('dup.b@org-creation.test', 'DupB');
    await createOrg(a, 'dup-slug-org').expect(201);

    await createOrg(b, 'dup-slug-org').expect(409);
    expect(await membershipsOf(b.id)).toHaveLength(0);
  });

  it('6. The creator can add both a MEMBER and an ADMIN, and roles are stored as requested', async () => {
    const owner = await registerUser('owner@org-creation.test', 'Owner');
    const member = await registerUser('member@org-creation.test', 'Member');
    const coAdmin = await registerUser('coadmin@org-creation.test', 'CoAdmin');
    const org = await createOrg(owner, 'team-org').expect(201);

    const m = await addMember(org.body.id, owner, member.id, 'MEMBER').expect(201);
    const a = await addMember(org.body.id, owner, coAdmin.id, 'ADMIN').expect(201);
    expect(m.body.role).toBe('MEMBER');
    expect(a.body.role).toBe('ADMIN');

    const byUser = new Map(
      (await dataSource.query(
        'SELECT "userId", "role" FROM "organization_memberships" WHERE "organizationId" = $1',
        [org.body.id],
      )).map((r: { userId: string; role: string }) => [r.userId, r.role]),
    );
    expect(byUser.get(owner.id)).toBe('ADMIN');
    expect(byUser.get(member.id)).toBe('MEMBER');
    expect(byUser.get(coAdmin.id)).toBe('ADMIN');

    // Adding by email also works, and duplicates are refused
    const byEmail = await request(app.getHttpServer())
      .post(`/api/organizations/${org.body.id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: 'Member@Org-Creation.test', role: 'MEMBER' })
      .expect(409);
    expect(byEmail.body.message).toMatch(/already a member/i);

    // A plain MEMBER can neither add members nor create projects
    await addMember(org.body.id, member, owner.id, 'ADMIN').expect(403);
    await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ name: 'Member Project', budget: '1000.00', organizationId: org.body.id })
      .expect(403);
  });

  it('7. A user can belong to several organizations with an independent role in each', async () => {
    const multi = await registerUser('multi@org-creation.test', 'Multi');
    const founder = await registerUser('founder@org-creation.test', 'Founder');
    const target = await registerUser('target@org-creation.test', 'Target');

    const orgA = await createOrg(multi, 'multi-a').expect(201); // multi: ADMIN
    const orgB = await createOrg(founder, 'multi-b').expect(201); // founder: ADMIN
    await addMember(orgB.body.id, founder, multi.id, 'MEMBER').expect(201); // multi: MEMBER

    const list = await request(app.getHttpServer())
      .get('/api/organizations')
      .set('Authorization', `Bearer ${multi.token}`)
      .expect(200);
    const roles = new Map(list.body.items.map((o: { id: string; role: string }) => [o.id, o.role]));
    expect(roles.get(orgA.body.id)).toBe('ADMIN');
    expect(roles.get(orgB.body.id)).toBe('MEMBER');

    // ADMIN rights apply in A only
    await addMember(orgA.body.id, multi, target.id, 'MEMBER').expect(201);
    await addMember(orgB.body.id, multi, target.id, 'MEMBER').expect(403);
  });

  it('8. Creating or administering one organization grants no access to another organization', async () => {
    const adminA = await registerUser('admin.a@org-creation.test', 'AdminA');
    const adminB = await registerUser('admin.b@org-creation.test', 'AdminB');
    const orgA = await createOrg(adminA, 'iso-a').expect(201);
    const orgB = await createOrg(adminB, 'iso-b').expect(201);

    const projectB = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminB.token}`)
      .send({ name: 'B Secret', budget: '900000.00', organizationId: orgB.body.id })
      .expect(201);
    const taskB = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminB.token}`)
      .send({ title: 'B Task', estimatedCost: '1000.00', projectId: projectB.body.id })
      .expect(201);

    const asA = (req: request.Test) => req.set('Authorization', `Bearer ${adminA.token}`);
    const server = app.getHttpServer();

    await asA(request(server).get(`/api/organizations/${orgB.body.id}`)).expect(403);
    await asA(request(server).get(`/api/organizations/${orgB.body.id}/members`)).expect(403);
    await asA(request(server).get(`/api/projects?organizationId=${orgB.body.id}`)).expect(403);
    await asA(request(server).get(`/api/projects/${projectB.body.id}`)).expect(403);
    await asA(request(server).get(`/api/tasks?projectId=${projectB.body.id}`)).expect(403);
    await asA(request(server).get(`/api/tasks/${taskB.body.id}`)).expect(403);
    await asA(
      request(server)
        .post(`/api/organizations/${orgB.body.id}/members`)
        .send({ userId: adminA.id, role: 'ADMIN' }),
    ).expect(403);
    await asA(
      request(server).patch(`/api/organizations/${orgB.body.id}/members/${adminB.id}`).send({ role: 'MEMBER' }),
    ).expect(403);

    // A cannot even self-promote into B, and B's membership list is unchanged
    expect(await membershipsOf(adminA.id)).toEqual([
      { organizationId: orgA.body.id, role: 'ADMIN' },
    ]);
  });

  it('9. Public registration cannot assign privileged roles or memberships', async () => {
    for (const extra of [
      { platformRole: 'PLATFORM_ADMIN' },
      { role: 'ADMIN' },
      { isAdmin: true },
      { isActive: true },
      { id: '00000000-0000-4000-8000-000000000000' },
      { memberships: [{ role: 'ADMIN' }] },
    ]) {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'escalate@org-creation.test',
          password: 'Password123!',
          firstName: 'Esc',
          lastName: 'Alate',
          ...extra,
        })
        .expect(400);
    }

    const created: Array<{ count: string }> = await dataSource.query(
      `SELECT count(*) FROM "users" WHERE "email" = 'escalate@org-creation.test'`,
    );
    expect(parseInt(created[0].count, 10)).toBe(0);

    // A normal registration yields no membership and no extra profile fields
    const plain = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'plain@org-creation.test',
        password: 'Password123!',
        firstName: 'Plain',
        lastName: 'User',
      })
      .expect(201);
    expect(plain.body.user.platformRole).toBeUndefined();
    expect(plain.body.user.passwordHash).toBeUndefined();
    expect(await membershipsOf(plain.body.user.id)).toHaveLength(0);
  });

  it('10. The users table has no platform-level role column any more', async () => {
    const cols: Array<{ column_name: string }> = await dataSource.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
    );
    expect(cols.map((c) => c.column_name)).not.toContain('platformRole');
  });
});
