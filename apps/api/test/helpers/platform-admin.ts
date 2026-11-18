import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';

export interface TestPlatformAdmin {
  token: string;
  userId: string;
}

/**
 * Registers a user through the public API, then promotes it to PLATFORM_ADMIN directly in the
 * test database. This mirrors the real bootstrap (server-side only): there is deliberately no
 * API path that can grant this role.
 */
export async function createPlatformAdmin(
  app: INestApplication,
  dataSource: DataSource,
  email: string,
): Promise<TestPlatformAdmin> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({
      email,
      password: 'Password123!',
      firstName: 'Platform',
      lastName: 'Admin',
    })
    .expect(201);

  const userId: string = res.body.user.id;
  await dataSource.query(`UPDATE "users" SET "platformRole" = 'PLATFORM_ADMIN' WHERE "id" = $1`, [
    userId,
  ]);

  return { token: res.body.accessToken as string, userId };
}
