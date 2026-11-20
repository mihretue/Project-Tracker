import { DataSource, MigrationInterface } from 'typeorm';
import { randomBytes } from 'crypto';
import { InitialSchema1700000000000 } from '../src/database/migrations/1700000000000-InitialSchema';
import { AddTaskPriority1700000001000 } from '../src/database/migrations/1700000001000-AddTaskPriority';
import { AddUserPlatformRole1700000002000 } from '../src/database/migrations/1700000002000-AddUserPlatformRole';
import { RemoveUserPlatformRole1700000003000 } from '../src/database/migrations/1700000003000-RemoveUserPlatformRole';

/**
 * Proves the task-priority migration on a database that ALREADY HOLDS DATA (the "fresh schema"
 * path is covered by running every migration in CI before the other E2E suites).
 *
 * Safety: everything happens in a scratch database created for this file and dropped afterwards.
 * It never touches the shared E2E database, the development database or a hosted database; it
 * refuses to run against a hosted (Neon / Render) host. It reads only explicit POSTGRES_* variables
 * (set by CI) and deliberately does NOT load any .env file, which may point at a hosted database.
 */

type MigrationClass = new () => MigrationInterface;

const SCRATCH_PREFIX = 'migration_upgrade_test_';

describe('AddTaskPriority migration on a populated database (e2e)', () => {
  jest.setTimeout(60000);

  const host = process.env.POSTGRES_HOST || 'localhost';
  const scratchDb = `${SCRATCH_PREFIX}${randomBytes(4).toString('hex')}`;
  const connection = {
    type: 'postgres' as const,
    host,
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  };

  let admin: DataSource;
  const open: DataSource[] = [];

  /** A data source on the scratch database that knows ONLY the given migrations. */
  const connect = async (migrations: MigrationClass[]): Promise<DataSource> => {
    const ds = new DataSource({
      ...connection,
      database: scratchDb,
      migrations,
      migrationsTransactionMode: 'all',
      synchronize: false,
    });
    await ds.initialize();
    open.push(ds);
    return ds;
  };
  const close = async (ds: DataSource) => {
    await ds.destroy();
    open.splice(open.indexOf(ds), 1);
  };

  const taskSnapshot = (ds: DataSource) =>
    ds.query(
      `SELECT "id", "title", "description", "status", "estimatedCost", "currency", "projectId", "createdAt"
         FROM "tasks" ORDER BY "title"`,
    );
  const columnExists = async (ds: DataSource, table: string, column: string) =>
    (
      await ds.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [table, column],
      )
    ).length === 1;
  const typeExists = async (ds: DataSource, name: string) =>
    (await ds.query(`SELECT 1 FROM pg_type WHERE typname = $1`, [name])).length === 1;
  const indexExists = async (ds: DataSource, name: string) =>
    (await ds.query(`SELECT 1 FROM pg_indexes WHERE indexname = $1`, [name])).length === 1;

  /** Everything except tasks: the migration must not touch any of it. */
  const unrelatedSnapshot = async (ds: DataSource) => ({
    users: await ds.query(`SELECT * FROM "users" ORDER BY "email"`),
    organizations: await ds.query(`SELECT * FROM "organizations" ORDER BY "slug"`),
    memberships: await ds.query(`SELECT * FROM "organization_memberships" ORDER BY "id"`),
    projects: await ds.query(`SELECT * FROM "projects" ORDER BY "name"`),
  });

  let projectId: string;
  let before: Array<Record<string, unknown>>;
  let unrelatedBefore: Awaited<ReturnType<typeof unrelatedSnapshot>>;

  beforeAll(async () => {
    if (/neon\.tech|render\.com/i.test(host)) {
      throw new Error(`Refusing to run the migration test against a hosted database (${host}).`);
    }
    admin = new DataSource({ ...connection, database: 'postgres' });
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${scratchDb}"`);

    // "Version 1" of the product: only the initial schema, then real-looking data.
    const v1 = await connect([InitialSchema1700000000000]);
    await v1.runMigrations();

    const [org] = await v1.query(
      `INSERT INTO "organizations" ("name","slug") VALUES ('Upgrade Co','upgrade-co') RETURNING "id"`,
    );
    const [user] = await v1.query(
      `INSERT INTO "users" ("email","passwordHash","firstName","lastName")
       VALUES ('legacy@upgrade.test','not-a-real-hash','Legacy','User') RETURNING "id"`,
    );
    await v1.query(
      `INSERT INTO "organization_memberships" ("role","userId","organizationId") VALUES ('ADMIN',$1,$2)`,
      [user.id, org.id],
    );
    const [project] = await v1.query(
      `INSERT INTO "projects" ("name","budget","organizationId")
       VALUES ('Mobile Banking Platform','750000.00',$1) RETURNING "id"`,
      [org.id],
    );
    projectId = project.id;
    await v1.query(
      `INSERT INTO "tasks" ("title","description","status","estimatedCost","projectId") VALUES
         ('Design wireframes',  'Screens for onboarding', 'COMPLETED',   '120000.50', $1),
         ('Build auth service', NULL,                     'IN_PROGRESS', '250000.00', $1),
         ('Security review',    'Pen-test findings',      'REVIEW',      '99999999999.99', $1),
         ('Write runbook',      '',                       'TODO',        '0.00', $1),
         ('Load testing',       'k6 scenarios',           'TODO',        '79999.50', $1)`,
      [projectId],
    );
    before = await taskSnapshot(v1);
    expect(before).toHaveLength(5);
    unrelatedBefore = await unrelatedSnapshot(v1);
    expect(unrelatedBefore.users).toHaveLength(1);
    expect(unrelatedBefore.projects).toHaveLength(1);
    await close(v1);
  });

  afterAll(async () => {
    for (const ds of [...open]) await ds.destroy().catch(() => undefined);
    if (admin?.isInitialized) {
      if (scratchDb.startsWith(SCRATCH_PREFIX)) {
        await admin.query(`DROP DATABASE IF EXISTS "${scratchDb}" WITH (FORCE)`);
      }
      await admin.destroy();
    }
  });

  it('starts from a schema that has no priority column yet', async () => {
    const ds = await connect([InitialSchema1700000000000, AddTaskPriority1700000001000]);
    expect(await columnExists(ds, 'tasks', 'priority')).toBe(false);
    expect(await typeExists(ds, 'task_priority_enum')).toBe(false);
    await close(ds);
  });

  it('up(): every existing task becomes MEDIUM and no other field changes', async () => {
    const ds = await connect([InitialSchema1700000000000, AddTaskPriority1700000001000]);
    const ran = await ds.runMigrations();
    expect(ran.map((m) => m.name)).toEqual(['AddTaskPriority1700000001000']);

    const rows = await ds.query(`SELECT "priority" FROM "tasks"`);
    expect(rows).toHaveLength(5); // no task lost
    expect(rows.every((r: { priority: string }) => r.priority === 'MEDIUM')).toBe(true);

    // Same ids, titles, descriptions, statuses, exact costs, relations and timestamps as before.
    expect(await taskSnapshot(ds)).toEqual(before);

    // Nothing outside the tasks table was modified or deleted.
    expect(await unrelatedSnapshot(ds)).toEqual(unrelatedBefore);

    // The column is NOT NULL with a MEDIUM default (so omitting it can never produce NULL).
    const [column] = await ds.query(
      `SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'priority'`,
    );
    expect(column.is_nullable).toBe('NO');
    expect(column.column_default).toContain("'MEDIUM'");

    // Schema objects the app depends on.
    const labels = await ds.query(
      `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'task_priority_enum' ORDER BY e.enumsortorder`,
    );
    expect(labels.map((l: { enumlabel: string }) => l.enumlabel)).toEqual(['LOW', 'MEDIUM', 'HIGH']);
    expect(await indexExists(ds, 'IDX_tasks_priority')).toBe(true);
    await close(ds);
  });

  it('after up(): new tasks default to MEDIUM, accept LOW/HIGH, and reject invalid values', async () => {
    const ds = await connect([InitialSchema1700000000000, AddTaskPriority1700000001000]);
    const [defaulted] = await ds.query(
      `INSERT INTO "tasks" ("title","projectId") VALUES ('Defaulted', $1) RETURNING "priority"`,
      [projectId],
    );
    expect(defaulted.priority).toBe('MEDIUM');

    const [high] = await ds.query(
      `INSERT INTO "tasks" ("title","projectId","priority") VALUES ('Urgent', $1, 'HIGH') RETURNING "priority"`,
      [projectId],
    );
    expect(high.priority).toBe('HIGH');

    await expect(
      ds.query(`INSERT INTO "tasks" ("title","projectId","priority") VALUES ('Bad', $1, 'URGENT')`, [
        projectId,
      ]),
    ).rejects.toThrow();

    await ds.query(`DELETE FROM "tasks" WHERE "title" IN ('Defaulted','Urgent')`);
    await close(ds);
  });

  it('down(): removes the column, index and type but keeps every task untouched', async () => {
    const ds = await connect([InitialSchema1700000000000, AddTaskPriority1700000001000]);
    await ds.undoLastMigration();

    expect(await columnExists(ds, 'tasks', 'priority')).toBe(false);
    expect(await indexExists(ds, 'IDX_tasks_priority')).toBe(false);
    expect(await typeExists(ds, 'task_priority_enum')).toBe(false);

    // Tasks and everything else survived the rollback. The only thing a rollback discards is the
    // priority VALUES themselves (the column is dropped); back them up first in a real database.
    expect(await taskSnapshot(ds)).toEqual(before);
    expect(await unrelatedSnapshot(ds)).toEqual(unrelatedBefore);
    await close(ds);
  });

  it('is repeatable: re-applying after a rollback backfills MEDIUM again', async () => {
    const ds = await connect([InitialSchema1700000000000, AddTaskPriority1700000001000]);
    await ds.runMigrations();
    const rows = await ds.query(`SELECT "priority" FROM "tasks"`);
    expect(rows).toHaveLength(5);
    expect(rows.every((r: { priority: string }) => r.priority === 'MEDIUM')).toBe(true);
    expect(await taskSnapshot(ds)).toEqual(before);
    await close(ds);
  });

  it('the full migration history applies cleanly on top of the populated data', async () => {
    const ds = await connect([
      InitialSchema1700000000000,
      AddTaskPriority1700000001000,
      AddUserPlatformRole1700000002000,
      RemoveUserPlatformRole1700000003000,
    ]);
    const ran = await ds.runMigrations();
    expect(ran.map((m) => m.name)).toEqual([
      'AddUserPlatformRole1700000002000',
      'RemoveUserPlatformRole1700000003000',
    ]);
    expect(await taskSnapshot(ds)).toEqual(before);
    expect(await columnExists(ds, 'tasks', 'priority')).toBe(true);
    expect(await columnExists(ds, 'users', 'platformRole')).toBe(false);
    await close(ds);
  });
});
