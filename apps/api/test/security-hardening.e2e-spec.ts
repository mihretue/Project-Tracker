import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { buildCorsOptions } from '../src/config/cors.config';
import { DataSource } from 'typeorm';
import { assertSafeConnection } from './helpers/db-safety';

describe('CORS and JWT hardening (e2e)', () => {
  jest.setTimeout(30000);

  const ALLOWED_ORIGIN = 'https://app.example.test';
  const EVIL_ORIGIN = 'https://evil.example.test';

  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    // Same options factory main.ts uses, fed an explicit allow-list
    app.enableCors(buildCorsOptions({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN }));
    await app.init();
    await assertSafeConnection(app.get(DataSource));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('CORS', () => {
    it('1. Preflight from an allowed origin succeeds without enabling credentials', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/auth/login')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .expect(204);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
      expect(res.headers['vary']).toMatch(/Origin/i);
    });

    it('2. Preflight from an unlisted origin gets no CORS grant', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/auth/login')
        .set('Origin', EVIL_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('3. Actual requests from an unlisted origin are not granted read access', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', EVIL_ORIGIN)
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('4. Actual requests from the allowed origin carry exactly that origin, never a wildcard', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', ALLOWED_ORIGIN)
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('5. Look-alike origins (suffix/prefix/scheme variations) are rejected', async () => {
      for (const origin of [
        'https://app.example.test.evil.test',
        'https://evilapp.example.test',
        'http://app.example.test',
        'null',
      ]) {
        const res = await request(app.getHttpServer())
          .options('/api/auth/login')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'POST');
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      }
    });

    it('6. Unlisted request headers and methods are not advertised', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/projects/00000000-0000-4000-8000-000000000000')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'PUT')
        .set('Access-Control-Request-Headers', 'x-custom-header');

      expect(res.headers['access-control-allow-methods']).not.toMatch(/PUT/);
      expect(res.headers['access-control-allow-headers']).not.toMatch(/x-custom-header/i);
    });
  });

  describe('Input validation and error disclosure', () => {
    let token: string;

    beforeAll(async () => {
      const reg = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `validation.${Date.now()}@security-test.com`,
          password: 'Password123!',
          firstName: 'Val',
          lastName: 'Idation',
        })
        .expect(201);
      token = reg.body.accessToken;
    });

    it('9. Non-UUID ids in query strings return 400 and leak no database details', async () => {
      for (const path of [
        '/api/tasks?projectId=not-a-uuid',
        "/api/tasks?projectId=1'%20OR%20'1'='1",
        '/api/projects?organizationId=not-a-uuid',
        '/api/projects?organizationId=123',
      ]) {
        const res = await request(app.getHttpServer())
          .get(path)
          .set('Authorization', `Bearer ${token}`)
          .expect(400);
        expect(JSON.stringify(res.body)).not.toMatch(/syntax|postgres|relation|column|QueryFailed/i);
      }
    });

    it('10. A missing required id is still a 400 with the existing message', async () => {
      const tasks = await request(app.getHttpServer())
        .get('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      expect(tasks.body.message).toContain('projectId');

      const projects = await request(app.getHttpServer())
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      expect(projects.body.message).toContain('organizationId');
    });

    it('11. Well-formed ids the caller cannot access are refused (403 for organizations, 404 for unknown projects)', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';
      await request(app.getHttpServer())
        .get(`/api/projects?organizationId=${unknown}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/tasks?projectId=${unknown}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('JWT secret', () => {
    it('7. A token signed with the old hard-coded secret is rejected (401)', async () => {
      const reg = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `jwt.hardening.${Date.now()}@security-test.com`,
          password: 'Password123!',
          firstName: 'Jwt',
          lastName: 'Hardening',
        })
        .expect(201);

      // Genuine token works
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${reg.body.accessToken}`)
        .expect(200);

      // Forged token for the same real user, signed with the previously published fallback
      const forged = new JwtService({ secret: 'dev-jwt-secret-key-32-chars-minimum' }).sign({
        sub: reg.body.user.id,
        email: reg.body.user.email,
      });
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });

    it('8. Unsigned ("alg": "none") and tampered tokens are rejected (401)', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ sub: '00000000-0000-4000-8000-000000000000', email: 'x@y.test' }),
      ).toString('base64url');

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${header}.${payload}.`)
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.token')
        .expect(401);
    });
  });
});
