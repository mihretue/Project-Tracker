import type { DataSource } from 'typeorm';

/**
 * Safety net for the API E2E suite. Most specs boot the real AppModule and several run
 * `DELETE FROM` on every table, so they must never be pointed at a development, hosted (Neon) or
 * production database. `apps/api/.env` can contain exactly such a host, and the application's
 * ConfigModule reads that file for any variable that is not already set - so an unconfigured run
 * would otherwise connect to it silently.
 *
 * Two layers:
 *   1. assertSafeTestEnvironment() - called from setup.ts BEFORE any spec imports AppModule
 *      (ConfigModule loads .env at import time), and rejects an unsafe environment up front.
 *   2. assertSafeConnection() - called by every spec that boots the app, BEFORE any destructive
 *      statement, and checks the connection that was actually opened (including what the server
 *      itself reports as the current database).
 */

export const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '::1'];

type Env = Record<string, string | undefined>;

const isLocalHost = (host: unknown): boolean => typeof host === 'string' && LOCAL_HOSTS.includes(host);

const endsWithTest = (name: unknown): boolean => typeof name === 'string' && name.endsWith('_test');

/**
 * Pins the one variable that .env could otherwise inject. CI does not set POSTGRES_SSL, and the
 * hosted configuration in apps/api/.env sets it to "true"; leaving it unset would let that file
 * turn SSL on (or, with a hosted host, mask the problem). A local test database never needs SSL.
 */
export const pinLocalTestEnvironment = (env: Env = process.env): void => {
  if (env.POSTGRES_SSL === undefined) {
    env.POSTGRES_SSL = 'false';
  }
};

/** Throws unless the environment explicitly selects a LOCAL database whose name ends in "_test". */
export const assertSafeTestEnvironment = (env: Env = process.env): void => {
  const host = env.POSTGRES_HOST;
  const db = env.POSTGRES_DB;

  if (host === undefined || host.trim() === '') {
    throw new Error(
      'E2E safety: POSTGRES_HOST must be set explicitly (for example POSTGRES_HOST=localhost). ' +
        'When it is unset the application falls back to apps/api/.env, which may point at a hosted database.',
    );
  }
  if (!isLocalHost(host)) {
    throw new Error(
      `E2E safety: POSTGRES_HOST must be one of ${LOCAL_HOSTS.join(', ')} (got "${host}"). ` +
        'The E2E suite deletes data and must never run against a hosted or shared database.',
    );
  }
  if (env.POSTGRES_SSL === 'true') {
    throw new Error('E2E safety: POSTGRES_SSL=true indicates a hosted database; refusing to run.');
  }
  if (!endsWithTest(db)) {
    throw new Error(`E2E safety: POSTGRES_DB must end with "_test" (got "${db ?? 'unset'}").`);
  }
};

/**
 * Verifies the connection that is really in use, before any destructive statement:
 * the configured host/database/SSL, and the database name reported by the server itself.
 */
export const assertSafeConnection = async (dataSource: DataSource): Promise<void> => {
  const options = dataSource.options as { host?: unknown; database?: unknown; ssl?: unknown };

  if (!isLocalHost(options.host)) {
    throw new Error(`E2E safety: connected to non-local host "${String(options.host)}"; refusing to continue.`);
  }
  if (!endsWithTest(options.database)) {
    throw new Error(`E2E safety: connected to database "${String(options.database)}", not a *_test database.`);
  }
  if (options.ssl) {
    throw new Error('E2E safety: the connection uses SSL, which indicates a hosted database.');
  }

  const rows: Array<{ db: string }> = await dataSource.query('SELECT current_database() AS db');
  if (!endsWithTest(rows[0]?.db)) {
    throw new Error(`E2E safety: the server reports current_database()="${rows[0]?.db}", not a *_test database.`);
  }
};
