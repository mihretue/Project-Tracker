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

interface OrgView {
  id: string;
  slug: string;
  role: string;
}

describe('Organization slug conflicts and pagination (e2e)', () => {
  jest.setTimeout(120000);

  let app: INestApplication;
  let dataSource: DataSource;

  const registerUser = async (email: string, firstName: string): Promise<TestUser> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', firstName, lastName: 'Tester' })
      .expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  };

  const createOrg = (user: TestUser, slug: string, name = `Org ${slug}`) =>
    request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name, slug });

  const listOrgs = (user: TestUser, query = '') =>
    request(app.getHttpServer())
      .get(`/api/organizations${query}`)
      .set('Authorization', `Bearer ${user.token}`);

  const count = async (sql: string, params: unknown[] = []): Promise<number> => {
    const rows: Array<{ count: string }> = await dataSource.query(sql, params);
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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('duplicate slug conflicts', () => {
    it('1. A sequential duplicate returns 409 with a clear message and no database details', async () => {
      const a = await registerUser('seq.a@edge.test', 'SeqA');
      const b = await registerUser('seq.b@edge.test', 'SeqB');
      await createOrg(a, 'seq-slug').expect(201);

      const res = await createOrg(b, 'seq-slug').expect(409);
      expect(res.body.message).toBe("Organization with slug 'seq-slug' already exists");
      expect(JSON.stringify(res.body)).not.toMatch(/duplicate key|constraint|unique|violates|QueryFailed/i);
    });

    it('2. Simultaneous requests for one slug: exactly one wins, the rest get 409, never a 5xx', async () => {
      const rounds = 4;
      const contenders = 8;
      const users: TestUser[] = [];
      for (let i = 0; i < contenders; i += 1) {
        users.push(await registerUser(`race.${i}@edge.test`, `Race${i}`));
      }

      for (let round = 0; round < rounds; round += 1) {
        const slug = `race-slug-${round}`;
        const responses = await Promise.all(users.map((u) => createOrg(u, slug)));
        const statuses = responses.map((r) => r.status);

        expect(statuses.filter((s) => s === 201)).toHaveLength(1);
        expect(statuses.filter((s) => s === 409)).toHaveLength(contenders - 1);
        expect(statuses.some((s) => s >= 500)).toBe(false);

        for (const r of responses.filter((x) => x.status === 409)) {
          expect(r.body.message).toBe(`Organization with slug '${slug}' already exists`);
          expect(JSON.stringify(r.body)).not.toMatch(/duplicate key|constraint|violates|QueryFailed/i);
        }

        // Exactly one organization with exactly one membership (the winner, as ADMIN): losers
        // rolled back completely
        expect(await count('SELECT count(*) FROM "organizations" WHERE "slug" = $1', [slug])).toBe(1);
        const memberships: Array<{ userId: string; role: string }> = await dataSource.query(
          `SELECT m."userId", m."role" FROM "organization_memberships" m
             JOIN "organizations" o ON o."id" = m."organizationId" WHERE o."slug" = $1`,
          [slug],
        );
        const winner = responses.find((x) => x.status === 201);
        expect(memberships).toHaveLength(1);
        expect(memberships[0].role).toBe('ADMIN');
        expect(winner?.body.slug).toBe(slug);
      }

      // No loser kept a stray membership from any round
      const total = await count(
        `SELECT count(*) FROM "organization_memberships" m
           JOIN "users" u ON u."id" = m."userId" WHERE u."email" LIKE 'race.%@edge.test'`,
      );
      expect(total).toBe(rounds);
    });

    it('3. After a lost race the loser can still create an organization with another slug', async () => {
      const x = await registerUser('after.x@edge.test', 'AfterX');
      const y = await registerUser('after.y@edge.test', 'AfterY');
      await Promise.all([createOrg(x, 'after-race'), createOrg(y, 'after-race')]);

      const loserRetry = await createOrg(y, 'after-race-2').expect(201);
      expect(loserRetry.body.role).toBe('ADMIN');
    });

    it('4. Self-service creation still works for a user who is only a MEMBER elsewhere', async () => {
      const owner = await registerUser('own.member@edge.test', 'Owner');
      const member = await registerUser('only.member@edge.test', 'Member');
      const org = await createOrg(owner, 'member-host-org').expect(201);
      await request(app.getHttpServer())
        .post(`/api/organizations/${org.body.id}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ userId: member.id, role: 'MEMBER' })
        .expect(201);

      const own = await createOrg(member, 'members-own-org').expect(201);
      expect(own.body.role).toBe('ADMIN');
    });
  });

  describe('pagination across more than 10 organizations', () => {
    const TOTAL = 25;
    let owner: TestUser;
    let outsider: TestUser;
    let createdIds: string[];

    beforeAll(async () => {
      owner = await registerUser('pager@edge.test', 'Pager');
      outsider = await registerUser('outsider@edge.test', 'Outsider');
      createdIds = [];
      for (let i = 0; i < TOTAL; i += 1) {
        const res = await createOrg(owner, `page-org-${String(i).padStart(2, '0')}`).expect(201);
        createdIds.push(res.body.id as string);
      }
      await createOrg(outsider, 'outsider-only-org').expect(201);
    });

    it('5. The default page is 10 items and reports the true total', async () => {
      const res = await listOrgs(owner).expect(200);
      expect(res.body.items).toHaveLength(10);
      expect(res.body.count).toBe(TOTAL);
      expect(res.body.take).toBe(10);
      expect(res.body.skip).toBe(0);
    });

    it('6. Walking every page returns all organizations exactly once, in a stable order', async () => {
      const seen: string[] = [];
      const sizes: number[] = [];
      for (let skip = 0; skip < TOTAL; skip += 10) {
        const res = await listOrgs(owner, `?take=10&skip=${skip}`).expect(200);
        sizes.push(res.body.items.length);
        expect(res.body.count).toBe(TOTAL);
        seen.push(...res.body.items.map((o: OrgView) => o.id));
      }
      expect(sizes).toEqual([10, 10, 5]);
      expect(new Set(seen).size).toBe(TOTAL); // no duplicates across pages
      expect(seen).toEqual(createdIds); // none missing, oldest first
    });

    it('7. Memberships created in the same instant still page without gaps or repeats', async () => {
      await dataSource.query(
        `UPDATE "organization_memberships" SET "createdAt" = '2026-01-01T00:00:00Z' WHERE "userId" = $1`,
        [owner.id],
      );

      const seen: string[] = [];
      for (let skip = 0; skip < TOTAL; skip += 7) {
        const res = await listOrgs(owner, `?take=7&skip=${skip}`).expect(200);
        seen.push(...res.body.items.map((o: OrgView) => o.id));
      }
      expect(seen).toHaveLength(TOTAL);
      expect(new Set(seen).size).toBe(TOTAL);
      expect([...seen].sort()).toEqual([...createdIds].sort());
    });

    it('8. take=100 (the maximum) returns everything in one request', async () => {
      const res = await listOrgs(owner, '?take=100').expect(200);
      expect(res.body.items).toHaveLength(TOTAL);
      expect(res.body.count).toBe(TOTAL);
    });

    it('9. Out-of-range paging is handled: past the end is empty, invalid values are 400', async () => {
      const past = await listOrgs(owner, '?take=10&skip=500').expect(200);
      expect(past.body.items).toEqual([]);
      expect(past.body.count).toBe(TOTAL);

      await listOrgs(owner, '?take=101').expect(400);
      await listOrgs(owner, '?take=0').expect(400);
      await listOrgs(owner, '?skip=-1').expect(400);
      await listOrgs(owner, '?take=abc').expect(400);
    });

    it('10. Tenant isolation holds across pages: users only ever see their own organizations', async () => {
      const mine = await listOrgs(outsider, '?take=100').expect(200);
      expect(mine.body.count).toBe(1);
      expect(mine.body.items.map((o: OrgView) => o.slug)).toEqual(['outsider-only-org']);

      const ownerSlugs: string[] = [];
      for (let skip = 0; skip < TOTAL; skip += 10) {
        const res = await listOrgs(owner, `?take=10&skip=${skip}`).expect(200);
        ownerSlugs.push(...res.body.items.map((o: OrgView) => o.slug));
      }
      expect(ownerSlugs).not.toContain('outsider-only-org');

      await request(app.getHttpServer()).get('/api/organizations').expect(401);
    });

    it('11. Paging reports each organization with the caller\'s own role, including MEMBER', async () => {
      const guest = await registerUser('guest@edge.test', 'Guest');
      const added = createdIds.slice(0, 12);
      for (const orgId of added) {
        await request(app.getHttpServer())
          .post(`/api/organizations/${orgId}/members`)
          .set('Authorization', `Bearer ${owner.token}`)
          .send({ userId: guest.id, role: 'MEMBER' })
          .expect(201);
      }
      const ownOrg = await createOrg(guest, 'guest-own-org').expect(201);

      const all: OrgView[] = [];
      for (let skip = 0; skip < 13; skip += 10) {
        const res = await listOrgs(guest, `?take=10&skip=${skip}`).expect(200);
        expect(res.body.count).toBe(13);
        all.push(...res.body.items);
      }
      expect(new Set(all.map((o) => o.id)).size).toBe(13);
      expect(all.filter((o) => o.role === 'MEMBER')).toHaveLength(12);
      expect(all.find((o) => o.id === ownOrg.body.id)?.role).toBe('ADMIN');
    });
  });
});
