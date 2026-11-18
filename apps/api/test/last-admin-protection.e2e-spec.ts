import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { createPlatformAdmin, TestPlatformAdmin } from './helpers/platform-admin';

interface TestUser {
  token: string;
  id: string;
}

describe('Last Organization ADMIN Protection (e2e)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let dataSource: DataSource;
  let platformAdmin: TestPlatformAdmin;

  let owner: TestUser;
  let second: TestUser;
  let plain: TestUser;

  const registerUser = async (email: string, firstName: string): Promise<TestUser> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', firstName, lastName: 'Tester' })
      .expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  };

  const createOrg = async (slug: string, initialAdminUserId: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .send({ name: `Org ${slug}`, slug, initialAdminUserId })
      .expect(201);
    return res.body.id as string;
  };

  const addMember = (orgId: string, actor: TestUser, userId: string, role: 'ADMIN' | 'MEMBER') =>
    request(app.getHttpServer())
      .post(`/api/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ userId, role });

  const setRole = (orgId: string, actor: TestUser, targetUserId: string, role: 'ADMIN' | 'MEMBER') =>
    request(app.getHttpServer())
      .patch(`/api/organizations/${orgId}/members/${targetUserId}`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ role });

  const adminIds = async (orgId: string): Promise<string[]> => {
    const rows: Array<{ userId: string }> = await dataSource.query(
      `SELECT "userId" FROM "organization_memberships" WHERE "organizationId" = $1 AND "role" = 'ADMIN'`,
      [orgId],
    );
    return rows.map((r) => r.userId);
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

    platformAdmin = await createPlatformAdmin(app, dataSource, 'pa@last-admin.test');
    owner = await registerUser('owner@last-admin.test', 'Owner');
    second = await registerUser('second@last-admin.test', 'Second');
    plain = await registerUser('plain@last-admin.test', 'Plain');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. The sole ADMIN cannot demote themselves (409) and stays ADMIN', async () => {
    const orgId = await createOrg('solo-admin-org', owner.id);

    const res = await setRole(orgId, owner, owner.id, 'MEMBER').expect(409);
    expect(res.body.message).toMatch(/at least one ADMIN/i);
    expect(await adminIds(orgId)).toEqual([owner.id]);
  });

  it('2. Setting the sole ADMIN to ADMIN again is allowed (no-op)', async () => {
    const orgId = await createOrg('noop-admin-org', owner.id);

    await setRole(orgId, owner, owner.id, 'ADMIN').expect(200);
    expect(await adminIds(orgId)).toEqual([owner.id]);
  });

  it('3. A MEMBER still cannot change roles (403) and the ADMIN is unaffected', async () => {
    const orgId = await createOrg('member-attempt-org', owner.id);
    await addMember(orgId, owner, plain.id, 'MEMBER').expect(201);

    await setRole(orgId, plain, owner.id, 'MEMBER').expect(403);
    expect(await adminIds(orgId)).toEqual([owner.id]);
  });

  it('4. Safe hand-over: promote the replacement first, then the old ADMIN may step down', async () => {
    const orgId = await createOrg('handover-org', owner.id);
    await addMember(orgId, owner, second.id, 'MEMBER').expect(201);

    // Promoting never reduces the admin count, so it is always allowed
    await setRole(orgId, owner, second.id, 'ADMIN').expect(200);
    expect((await adminIds(orgId)).sort()).toEqual([owner.id, second.id].sort());

    // Two ADMINs: the original can now demote themselves
    const res = await setRole(orgId, owner, owner.id, 'MEMBER').expect(200);
    expect(res.body.role).toBe('MEMBER');
    expect(await adminIds(orgId)).toEqual([second.id]);

    // The remaining ADMIN is now the last one and is protected too
    await setRole(orgId, second, second.id, 'MEMBER').expect(409);
    expect(await adminIds(orgId)).toEqual([second.id]);

    // The demoted user lost ADMIN rights in this organization immediately
    await setRole(orgId, owner, second.id, 'MEMBER').expect(403);
  });

  it('5. One organization\'s last-admin rule does not depend on admins elsewhere', async () => {
    const orgX = await createOrg('scope-org-x', owner.id);
    const orgY = await createOrg('scope-org-y', second.id);
    await addMember(orgY, second, owner.id, 'ADMIN').expect(201); // owner is ADMIN in X and Y

    // In Y there are two admins: owner may step down there
    await setRole(orgY, owner, owner.id, 'MEMBER').expect(200);
    // In X owner is still the only admin: protected, regardless of Y
    await setRole(orgX, owner, owner.id, 'MEMBER').expect(409);
    expect(await adminIds(orgX)).toEqual([owner.id]);
  });

  it('6. Two ADMINs demoting each other at the same time can never leave zero ADMINs', async () => {
    const rounds = 6;

    for (let i = 0; i < rounds; i += 1) {
      const orgId = await createOrg(`race-org-${i}`, owner.id);
      await addMember(orgId, owner, second.id, 'ADMIN').expect(201);

      const [r1, r2] = await Promise.all([
        setRole(orgId, owner, second.id, 'MEMBER'),
        setRole(orgId, second, owner.id, 'MEMBER'),
      ]);

      const statuses = [r1.status, r2.status].sort();
      // Exactly one demotion wins; the loser is refused (403 actor no longer ADMIN, or 409 last ADMIN)
      expect(statuses[0]).toBe(200);
      expect([403, 409]).toContain(statuses[1]);
      expect(await adminIds(orgId)).toHaveLength(1);
    }
  });

  it('7. Concurrent self-demotions of both ADMINs leave exactly one ADMIN', async () => {
    const orgId = await createOrg('race-self-org', owner.id);
    await addMember(orgId, owner, second.id, 'ADMIN').expect(201);

    const [r1, r2] = await Promise.all([
      setRole(orgId, owner, owner.id, 'MEMBER'),
      setRole(orgId, second, second.id, 'MEMBER'),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([200, expect.any(Number)]);
    expect(await adminIds(orgId)).toHaveLength(1);
  });

  it('8. Regression: promoting, demoting a non-last ADMIN and tenant isolation still work', async () => {
    const orgId = await createOrg('regression-org', owner.id);
    await addMember(orgId, owner, second.id, 'MEMBER').expect(201);

    // Duplicate membership and unknown target are still rejected as before
    await addMember(orgId, owner, second.id, 'MEMBER').expect(409);
    await setRole(orgId, owner, plain.id, 'ADMIN').expect(404);

    // A user outside the organization cannot touch its roles
    await setRole(orgId, plain, second.id, 'ADMIN').expect(403);
    expect(await adminIds(orgId)).toEqual([owner.id]);

    await setRole(orgId, owner, second.id, 'ADMIN').expect(200);
    await setRole(orgId, owner, second.id, 'MEMBER').expect(200);
    expect(await adminIds(orgId)).toEqual([owner.id]);
  });
});
