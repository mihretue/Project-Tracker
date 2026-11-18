import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { createPlatformAdmin, TestPlatformAdmin } from './helpers/platform-admin';

interface TestUser {
  token: string;
  id: string;
}

describe('Platform-Level vs Organization-Level Authorization (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let dataSource: DataSource;

  let platformAdmin: TestPlatformAdmin;
  let plainUser: TestUser; // normal USER, no memberships
  let orgAdminA: TestUser; // ADMIN of Org A (no platform role)
  let orgMemberA: TestUser; // MEMBER of Org A (no platform role)
  let multiRoleUser: TestUser; // ADMIN in Org A, MEMBER in Org B
  let orgAdminB: TestUser; // ADMIN of Org B
  let candidate: TestUser; // target for add-member checks

  let orgAId: string;
  let orgBId: string;

  const registerUser = async (email: string, firstName: string): Promise<TestUser> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', firstName, lastName: 'Tester' })
      .expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  };

  const createOrg = (token: string, slug: string, initialAdminUserId: string) =>
    request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Org ${slug}`, slug, initialAdminUserId });

  const orgCount = async (slug: string): Promise<number> => {
    const rows: Array<{ count: string }> = await dataSource.query(
      'SELECT count(*) FROM "organizations" WHERE "slug" = $1',
      [slug],
    );
    return parseInt(rows[0].count, 10);
  };

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

    platformAdmin = await createPlatformAdmin(app, dataSource, 'pa@platform-test.com');
    plainUser = await registerUser('plain@platform-test.com', 'Plain');
    orgAdminA = await registerUser('admin.a@platform-test.com', 'AdminA');
    orgMemberA = await registerUser('member.a@platform-test.com', 'MemberA');
    multiRoleUser = await registerUser('multi@platform-test.com', 'Multi');
    orgAdminB = await registerUser('admin.b@platform-test.com', 'AdminB');
    candidate = await registerUser('candidate@platform-test.com', 'Candidate');

    // Platform admin creates both organizations, each with its own initial ADMIN
    const orgA = await createOrg(platformAdmin.token, 'plat-org-a', orgAdminA.id).expect(201);
    orgAId = orgA.body.id;
    const orgB = await createOrg(platformAdmin.token, 'plat-org-b', orgAdminB.id).expect(201);
    orgBId = orgB.body.id;

    // Org-level role assignment by the organization admins (existing behaviour)
    await request(app.getHttpServer())
      .post(`/api/organizations/${orgAId}/members`)
      .set('Authorization', `Bearer ${orgAdminA.token}`)
      .send({ userId: orgMemberA.id, role: 'MEMBER' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/organizations/${orgAId}/members`)
      .set('Authorization', `Bearer ${orgAdminA.token}`)
      .send({ userId: multiRoleUser.id, role: 'ADMIN' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/organizations/${orgBId}/members`)
      .set('Authorization', `Bearer ${orgAdminB.token}`)
      .send({ userId: multiRoleUser.id, role: 'MEMBER' })
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. A normal USER cannot create an organization (403) and nothing is created', async () => {
    await createOrg(plainUser.token, 'plain-attempt', plainUser.id).expect(403);
    expect(await orgCount('plain-attempt')).toBe(0);
  });

  it('2. Unauthenticated requests cannot create an organization (401)', async () => {
    await request(app.getHttpServer())
      .post('/api/organizations')
      .send({ name: 'Anon', slug: 'anon-org', initialAdminUserId: plainUser.id })
      .expect(401);
  });

  it('3. A PLATFORM_ADMIN can create an organization and is NOT auto-added as a member', async () => {
    const res = await createOrg(platformAdmin.token, 'created-by-pa', candidate.id).expect(201);
    expect(res.body.slug).toBe('created-by-pa');

    const memberships: Array<{ userId: string }> = await dataSource.query(
      'SELECT "userId" FROM "organization_memberships" WHERE "organizationId" = $1',
      [res.body.id],
    );
    expect(memberships.map((m) => m.userId)).toEqual([candidate.id]);
    expect(memberships.some((m) => m.userId === platformAdmin.userId)).toBe(false);

    // Platform role grants no organization-level access: tenant isolation still applies
    await request(app.getHttpServer())
      .get(`/api/organizations/${res.body.id}/members`)
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .expect(403);
  });

  it('4. The initial administrator receives ADMIN only in the newly created organization', async () => {
    const res = await createOrg(platformAdmin.token, 'multi-new-org', multiRoleUser.id).expect(201);
    expect(res.body.initialAdmin.userId).toBe(multiRoleUser.id);

    const rows: Array<{ organizationId: string; role: string }> = await dataSource.query(
      'SELECT "organizationId", "role" FROM "organization_memberships" WHERE "userId" = $1',
      [multiRoleUser.id],
    );
    const byOrg = new Map(rows.map((r) => [r.organizationId, r.role]));
    expect(byOrg.get(res.body.id)).toBe('ADMIN');
    expect(byOrg.get(orgAId)).toBe('ADMIN');
    expect(byOrg.get(orgBId)).toBe('MEMBER'); // untouched
    expect(rows).toHaveLength(3);
  });

  it('5. Organization creation rejects a missing or unknown initial administrator', async () => {
    await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .send({ name: 'No Admin', slug: 'no-admin-org' })
      .expect(400);

    await createOrg(platformAdmin.token, 'ghost-admin-org', randomUUID()).expect(404);

    // Nothing is persisted for either failed attempt
    expect(await orgCount('no-admin-org')).toBe(0);
    expect(await orgCount('ghost-admin-org')).toBe(0);
  });

  it('6. A user cannot assign themselves PLATFORM_ADMIN during registration', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'sneaky@platform-test.com',
        password: 'Password123!',
        firstName: 'Sneaky',
        lastName: 'User',
        platformRole: 'PLATFORM_ADMIN',
      })
      .expect(400);

    const sneaky: Array<{ count: string }> = await dataSource.query(
      `SELECT count(*) FROM "users" WHERE "email" = 'sneaky@platform-test.com'`,
    );
    expect(parseInt(sneaky[0].count, 10)).toBe(0);

    // POST /users no longer exists (covered in users-access.e2e-spec.ts)
    await request(app.getHttpServer())
      .post('/api/users')
      .send({
        email: 'sneaky2@platform-test.com',
        password: 'Password123!',
        firstName: 'Sneaky',
        lastName: 'Two',
        platformRole: 'PLATFORM_ADMIN',
      })
      .expect(404);
  });

  it('7. Newly registered users default to USER', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'default.role@platform-test.com',
        password: 'Password123!',
        firstName: 'Default',
        lastName: 'Role',
      })
      .expect(201);
    expect(res.body.user.platformRole).toBe('USER');

    const rows: Array<{ platformRole: string }> = await dataSource.query(
      `SELECT "platformRole" FROM "users" WHERE "email" = 'default.role@platform-test.com'`,
    );
    expect(rows[0].platformRole).toBe('USER');
  });

  it('8. An organization ADMIN without PLATFORM_ADMIN cannot create organizations', async () => {
    await createOrg(orgAdminA.token, 'admin-attempt', orgAdminA.id).expect(403);
    expect(await orgCount('admin-attempt')).toBe(0);
  });

  it('9. An organization MEMBER without PLATFORM_ADMIN cannot create organizations', async () => {
    await createOrg(orgMemberA.token, 'member-attempt', orgMemberA.id).expect(403);
    expect(await orgCount('member-attempt')).toBe(0);
  });

  it('10. ADMIN in Organization A does not grant ADMIN permissions in Organization B', async () => {
    // multiRoleUser is ADMIN in A: can add members there
    await request(app.getHttpServer())
      .post(`/api/organizations/${orgAId}/members`)
      .set('Authorization', `Bearer ${multiRoleUser.token}`)
      .send({ userId: candidate.id, role: 'MEMBER' })
      .expect(201);

    // ...but only MEMBER in B: the same operation is refused
    await request(app.getHttpServer())
      .post(`/api/organizations/${orgBId}/members`)
      .set('Authorization', `Bearer ${multiRoleUser.token}`)
      .send({ userId: candidate.id, role: 'MEMBER' })
      .expect(403);

    // Org-level admin is not platform-level admin
    await createOrg(multiRoleUser.token, 'multi-attempt', multiRoleUser.id).expect(403);
  });

  it('11. Listing all users is a platform-level operation', async () => {
    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${orgAdminA.token}`)
      .expect(403);

    const res = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(7);
    expect(res.body[0].passwordHash).toBeUndefined();
  });

  it('12. The platform role is read from the database on every request, not from the token', async () => {
    const adminUser = await registerUser('temp.pa@platform-test.com', 'Temp');
    await dataSource.query(
      `UPDATE "users" SET "platformRole" = 'PLATFORM_ADMIN' WHERE "id" = $1`,
      [adminUser.id],
    );
    await createOrg(adminUser.token, 'temp-pa-org', candidate.id).expect(201);

    // Same token, role revoked server-side: access is lost immediately
    await dataSource.query(`UPDATE "users" SET "platformRole" = 'USER' WHERE "id" = $1`, [
      adminUser.id,
    ]);
    await createOrg(adminUser.token, 'temp-pa-org-2', candidate.id).expect(403);
  });

  it('13. Regression: organization-level project permissions are unchanged', async () => {
    const admin = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${orgAdminA.token}`)
      .send({ name: 'Admin Project', budget: '1000.00', organizationId: orgAId })
      .expect(201);
    expect(admin.body.organizationId).toBe(orgAId);

    await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${orgMemberA.token}`)
      .send({ name: 'Member Project', budget: '1000.00', organizationId: orgAId })
      .expect(403);

    // A platform admin who is not a member cannot touch the organization's projects
    await request(app.getHttpServer())
      .get(`/api/projects?organizationId=${orgAId}`)
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .expect(403);

    // /auth/me exposes the platform role (informational for the UI; the API enforces it)
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .expect(200);
    expect(me.body.platformRole).toBe('PLATFORM_ADMIN');
  });
});
