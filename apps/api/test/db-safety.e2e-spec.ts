import type { DataSource } from 'typeorm';
import { assertSafeConnection, assertSafeTestEnvironment, pinLocalTestEnvironment } from './helpers/db-safety';

/**
 * The E2E safety guard itself. Uses injected environments and fake connection objects, so it opens no
 * database connection and cannot touch any real database.
 */

const safeEnv = { POSTGRES_HOST: 'localhost', POSTGRES_DB: 'tenant_project_tracker_test' };

const fakeDataSource = (options: object, currentDb = 'tenant_project_tracker_test'): DataSource =>
  ({
    options,
    query: jest.fn().mockResolvedValue([{ db: currentDb }]),
  }) as unknown as DataSource;

describe('E2E database safety guard', () => {
  describe('assertSafeTestEnvironment', () => {
    it.each(['localhost', '127.0.0.1', '::1'])('accepts the local host %s with a *_test database', (host) => {
      expect(() => assertSafeTestEnvironment({ ...safeEnv, POSTGRES_HOST: host })).not.toThrow();
    });

    it('accepts an explicit POSTGRES_SSL=false', () => {
      expect(() => assertSafeTestEnvironment({ ...safeEnv, POSTGRES_SSL: 'false' })).not.toThrow();
    });

    it.each([undefined, '', '   '])('rejects a missing POSTGRES_HOST (%j): it would fall back to apps/api/.env', (host) => {
      expect(() => assertSafeTestEnvironment({ ...safeEnv, POSTGRES_HOST: host })).toThrow(/must be set explicitly/);
    });

    it.each([
      'ep-example-123456.us-east-2.aws.neon.tech',
      'db.example.com',
      '10.0.0.5',
      '0.0.0.0',
      'localhost.evil.example',
      'notlocalhost',
      'LOCALHOST ',
    ])('rejects the non-local host %s', (host) => {
      expect(() => assertSafeTestEnvironment({ ...safeEnv, POSTGRES_HOST: host })).toThrow(/must be one of/);
    });

    it('rejects POSTGRES_SSL=true even for a local host', () => {
      expect(() => assertSafeTestEnvironment({ ...safeEnv, POSTGRES_SSL: 'true' })).toThrow(/POSTGRES_SSL=true/);
    });

    it.each([undefined, '', 'tenant_project_tracker', 'neondb', 'postgres', 'test_data', 'tenant_project_tracker_test_old'])(
      'rejects the database name %j (must end with _test)',
      (db) => {
        expect(() => assertSafeTestEnvironment({ ...safeEnv, POSTGRES_DB: db })).toThrow(/_test/);
      },
    );
  });

  describe('pinLocalTestEnvironment', () => {
    it('pins POSTGRES_SSL to false when unset, so .env cannot switch it on', () => {
      const env: Record<string, string | undefined> = { ...safeEnv };
      pinLocalTestEnvironment(env);
      expect(env.POSTGRES_SSL).toBe('false');
    });

    it('leaves an explicit value alone, so POSTGRES_SSL=true is still rejected afterwards', () => {
      const env: Record<string, string | undefined> = { ...safeEnv, POSTGRES_SSL: 'true' };
      pinLocalTestEnvironment(env);
      expect(env.POSTGRES_SSL).toBe('true');
      expect(() => assertSafeTestEnvironment(env)).toThrow(/POSTGRES_SSL=true/);
    });
  });

  describe('assertSafeConnection (checks the connection actually opened)', () => {
    const good = { host: 'localhost', database: 'tenant_project_tracker_test', ssl: false };

    it('accepts a local *_test connection whose server reports a *_test database', async () => {
      const ds = fakeDataSource(good);
      await expect(assertSafeConnection(ds)).resolves.toBeUndefined();
      expect(ds.query).toHaveBeenCalledWith('SELECT current_database() AS db');
    });

    it('rejects a hosted host before running any query', async () => {
      const ds = fakeDataSource({ ...good, host: 'ep-example.us-east-2.aws.neon.tech' });
      await expect(assertSafeConnection(ds)).rejects.toThrow(/non-local host/);
      expect(ds.query).not.toHaveBeenCalled();
    });

    it('rejects a configured database that is not *_test', async () => {
      const ds = fakeDataSource({ ...good, database: 'neondb' });
      await expect(assertSafeConnection(ds)).rejects.toThrow(/not a \*_test database/);
      expect(ds.query).not.toHaveBeenCalled();
    });

    it('rejects an SSL connection', async () => {
      const ds = fakeDataSource({ ...good, ssl: { rejectUnauthorized: false } });
      await expect(assertSafeConnection(ds)).rejects.toThrow(/SSL/);
    });

    it('rejects when the server itself reports a different database than configured', async () => {
      const ds = fakeDataSource(good, 'tenant_project_tracker');
      await expect(assertSafeConnection(ds)).rejects.toThrow(/current_database/);
    });
  });
});
