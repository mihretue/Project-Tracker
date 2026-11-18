import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

describe('Login and Registration Rate Limiting (e2e)', () => {
  jest.setTimeout(30000);

  const LIMIT = 3;
  const savedEnv = {
    max: process.env.AUTH_RATE_LIMIT_MAX,
    window: process.env.AUTH_RATE_LIMIT_WINDOW_MS,
  };

  let app: INestApplication;
  let email: string;
  let token: string;
  const password = 'Password123!';

  const register = (mail: string, body: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: mail, password, firstName: 'Rate', lastName: 'Limit', ...body });

  const login = (mail: string, pass: string) =>
    request(app.getHttpServer()).post('/api/auth/login').send({ email: mail, password: pass });

  beforeAll(async () => {
    // Read when the application module is created, so this suite uses its own small limit
    process.env.AUTH_RATE_LIMIT_MAX = String(LIMIT);
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    email = `rate.limit.${Date.now()}@security-test.com`;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    for (const [key, value] of [
      ['AUTH_RATE_LIMIT_MAX', savedEnv.max],
      ['AUTH_RATE_LIMIT_WINDOW_MS', savedEnv.window],
    ] as const) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('1. Registration: requests within the limit succeed, the next one is refused with 429', async () => {
    const first = await register(email).expect(201);
    token = first.body.accessToken;
    await register(`second.${email}`).expect(201);
    await register('not-an-email').expect(400); // invalid attempts count too

    const blocked = await register(`third.${email}`).expect(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('2. Login: legitimate use within the limit works, then brute force is cut off', async () => {
    await login(email, password).expect(200);
    await login(email, 'wrong-password-1').expect(401);
    await login(email, 'wrong-password-2').expect(401);

    // Limit reached: even the correct password is refused until the window resets
    const blocked = await login(email, password).expect(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('3. The login and registration limits are independent counters', async () => {
    // Both are exhausted by the tests above, yet other routes are unaffected
    await login(email, password).expect(429);
    await register(`fourth.${email}`).expect(429);
  });

  it('4. Authenticated and public non-auth endpoints are not rate limited', async () => {
    for (let i = 0; i < LIMIT * 4; i += 1) {
      await request(app.getHttpServer()).get('/api/health').expect(200);
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
  });
});
