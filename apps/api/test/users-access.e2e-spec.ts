import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

interface TestUser {
  token: string;
  id: string;
}

describe('User Endpoint Access Control (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let dataSource: DataSource;

  let alice: TestUser;
  let bob: TestUser;

  const registerUser = async (email: string, firstName: string): Promise<TestUser> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', firstName, lastName: 'Tester' })
      .expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
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

    alice = await registerUser('alice@users-access.test', 'Alice');
    bob = await registerUser('bob@users-access.test', 'Bob');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. GET /users/:id requires authentication (401)', async () => {
    await request(app.getHttpServer()).get(`/api/users/${alice.id}`).expect(401);
  });

  it('2. A user can read their own profile without sensitive fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/users/${alice.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    expect(res.body.id).toBe(alice.id);
    expect(res.body.email).toBe('alice@users-access.test');
    expect(res.body.platformRole).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.memberships).toBeUndefined();
  });

  it('3. A user cannot read another user\'s profile (403)', async () => {
    await request(app.getHttpServer())
      .get(`/api/users/${bob.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(403);
  });

  it('4. The response does not reveal whether another ID exists (403 for unknown IDs too)', async () => {
    await request(app.getHttpServer())
      .get(`/api/users/${randomUUID()}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(403);
  });

  it('5. An organization ADMIN cannot read the profile of a member of their own organization via /users/:id', async () => {
    const org = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ name: 'Alice Org', slug: 'alice-users-access' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/organizations/${org.body.id}/members`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ userId: bob.id, role: 'MEMBER' })
      .expect(201);

    // Alice is ADMIN and Bob is her member, yet profile lookup stays self-only
    await request(app.getHttpServer())
      .get(`/api/users/${bob.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/users/${alice.id}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(403);
  });

  it('6. Malformed IDs are rejected (400)', async () => {
    await request(app.getHttpServer())
      .get('/api/users/not-a-uuid')
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(400);
  });

  it('7. POST /users no longer exists: anonymous requests with a valid payload create nothing', async () => {
    const payload = {
      email: 'ghost@users-access.test',
      password: 'Password123!',
      firstName: 'Ghost',
      lastName: 'User',
    };

    await request(app.getHttpServer()).post('/api/users').send(payload).expect(404);
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${alice.token}`)
      .send(payload)
      .expect(404);

    const rows: Array<{ count: string }> = await dataSource.query(
      `SELECT count(*) FROM "users" WHERE "email" = 'ghost@users-access.test'`,
    );
    expect(parseInt(rows[0].count, 10)).toBe(0);
  });

  it('8. Regression: registration, login, /users/me and /auth/me still work, and no user-listing endpoint exists', async () => {
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'carol@users-access.test',
        password: 'Password123!',
        firstName: 'Carol',
        lastName: 'Tester',
      })
      .expect(201);
    expect(reg.body.accessToken).toBeDefined();
    expect(reg.body.user.passwordHash).toBeUndefined();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'carol@users-access.test', password: 'Password123!' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    // There is no endpoint that lists all users: no one, whatever their organization role, can
    // enumerate accounts of other tenants
    await request(app.getHttpServer()).get('/api/users').expect(404);
    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(404);
  });
});
