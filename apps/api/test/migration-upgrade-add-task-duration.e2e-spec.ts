import { DataSource, MigrationInterface } from 'typeorm';
import { randomBytes } from 'crypto';
import { InitialSchema1700000000000 } from '../src/database/migrations/1700000000000-InitialSchema';
import { AddTaskPriority1700000001000 } from '../src/database/migrations/1700000001000-AddTaskPriority';
import { AddUserPlatformRole1700000002000 } from '../src/database/migrations/1700000002000-AddUserPlatformRole';
import { RemoveUserPlatformRole1700000003000 } from '../src/database/migrations/1700000003000-RemoveUserPlatformRole';
import { AddTaskDuration1700000004000 } from '../src/database/migrations/1700000004000-AddTaskDuration';

/**
 * Upgrade + rollback test for AddTaskDuration1700000004000 on a database that ALREADY HOLDS DATA.
 * The migration adds tasks.durationDays (integer, nullable, no default, CHECK >= 0). Existing tasks
 * have no reliable duration, so they must stay NULL rather than receive an invented value.
 *
 * Same conventions as migration-upgrade-add-task-priority.e2e-spec.ts: scratch databases created
 * for this file and dropped afterwards (also when a test fails), explicit POSTGRES_* variables only
 * (no .env file), and a refusal to run against a hosted host. It never touches the shared E2E
 * database, the development database or Neon.
 */

type MigrationClass = new () => MigrationInterface;

const SCRATCH_PREFIX = 'migration_upgrade_test_';

describe('AddTaskDuration migration on a populated database (e2e)', () => {
  jest.setTimeout(60000);

  const host = process.env.POSTGRES_HOST || 'localhost';
  const connection = {
    type: 'postgres' as const,
    host,
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  };
  // Database A: step-by-step up/down tests. Database B: complete history from the first schema.
  const dbA = `${SCRATCH_PREFIX}${randomBytes(4).toString('hex')}`;
  const dbB = `${SCRATCH_PREFIX}${randomBytes(4).toString('hex')}`;

  let admin: DataSource;
  const open: DataSource[] = [];

  const connect = async (database: string, migrations: MigrationClass[]): Promise<DataSource> => {
    const ds = new DataSource({
      ...connection,
      database,
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

  // Every migration that exists BEFORE the one under test (the "previous version" of the product).
  const PREVIOUS: MigrationClass[] = [
    InitialSchema1700000000000,
    AddTaskPriority1700000001000,
    AddUserPlatformRole1700000002000,
    RemoveUserPlatformRole1700000003000,
  ];
  const WITH_DURATION: MigrationClass[] = [...PREVIOUS, AddTaskDuration1700000004000];

  /** tasks WITHOUT durationDays, so it is comparable across schema versions (priority included). */
  const tasksSnapshot = (ds: DataSource) =>
    ds.query(
      `SELECT "id","title","description","status","priority","estimatedCost","currency","projectId",
              "createdAt","updatedAt"
         FROM "tasks" ORDER BY "title"`,
    );
  /** Every table the migration must not touch. */
  const otherSnapshot = async (ds: DataSource) => ({
    users: await ds.query(`SELECT * FROM "users" ORDER BY "email"`),
    organizations: await ds.query(`SELECT * FROM "organizations" ORDER BY "slug"`),
    memberships: await ds.query(`SELECT * FROM "organization_memberships" ORDER BY "id"`),
    projects: await ds.query(`SELECT * FROM "projects" ORDER BY "name"`),
  });
  const columnExists = async (ds: DataSource, table: string, column: string) =>
    (
      await ds.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [table, column],
      )
    ).length === 1;
  const constraintExists = async (ds: DataSource, name: string) =>
    (await ds.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [name])).length === 1;
  const durations = (ds: DataSource): Promise<Array<{ title: string; durationDays: number | null }>> =>
    ds.query(`SELECT "title","durationDays" FROM "tasks" ORDER BY "title"`);

  /** Representative legacy data: users, two organizations, a project and varied tasks. */
  const seed = async (ds: DataSource) => {
    const [user] = await ds.query(
      `INSERT INTO "users" ("email","passwordHash","firstName","lastName")
       VALUES ('legacy@duration.test','not-a-real-hash','Legacy','User') RETURNING "id"`,
    );
    const [orgA] = await ds.query(
      `INSERT INTO "organizations" ("name","slug") VALUES ('Legacy A','legacy-a') RETURNING "id"`,
    );
    const [orgB] = await ds.query(
      `INSERT INTO "organizations" ("name","slug") VALUES ('Legacy B','legacy-b') RETURNING "id"`,
    );
    await ds.query(
      `INSERT INTO "organization_memberships" ("role","userId","organizationId") VALUES
         ('ADMIN', $1, $2), ('MEMBER', $1, $3)`,
      [user.id, orgA.id, orgB.id],
    );
    const [project] = await ds.query(
      `INSERT INTO "projects" ("name","budget","organizationId")
       VALUES ('Mobile Banking Platform','750000.00',$1) RETURNING "id"`,
      [orgA.id],
    );
    await ds.query(
      `INSERT INTO "tasks" ("title","description","status","estimatedCost","projectId") VALUES
         ('Design wireframes',  'Screens', 'COMPLETED',   '120000.50',      $1),
         ('Build auth service', NULL,      'IN_PROGRESS', '250000.00',      $1),
         ('Security review',    'Pen-test','REVIEW',      '99999999999.99', $1),
         ('Write runbook',      '',        'TODO',        '0.00',           $1)`,
      [project.id],
    );
  };

  let tasksBefore: Array<Record<string, unknown>>;
  let othersBefore: Awaited<ReturnType<typeof otherSnapshot>>;

  beforeAll(async () => {
    if (/neon\.tech|render\.com/i.test(host)) {
      throw new Error(`Refusing to run the migration test against a hosted database (${host}).`);
    }
    admin = new DataSource({ ...connection, database: 'postgres' });
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${dbA}"`);
    await admin.query(`CREATE DATABASE "${dbB}"`);

    // Database A: every migration BEFORE AddTaskDuration applied, with legacy data.
    const a = await connect(dbA, PREVIOUS);
    await a.runMigrations();
    await seed(a);
    // Priorities users have really set; the migration under test must not disturb them.
    await a.query(`UPDATE "tasks" SET "priority" = 'HIGH' WHERE "title" = 'Build auth service'`);
    await a.query(`UPDATE "tasks" SET "priority" = 'LOW'  WHERE "title" = 'Write runbook'`);
    tasksBefore = await tasksSnapshot(a);
    othersBefore = await otherSnapshot(a);
    expect(tasksBefore).toHaveLength(4);
    expect(othersBefore.users).toHaveLength(1);
    await close(a);

    // Database B: the very first schema (initial only), with the same legacy data.
    const b = await connect(dbB, [InitialSchema1700000000000]);
    await b.runMigrations();
    await seed(b);
    await close(b);
  });

  afterAll(async () => {
    for (const ds of [...open]) await ds.destroy().catch(() => undefined);
    if (admin?.isInitialized) {
      for (const name of [dbA, dbB]) {
        if (name.startsWith(SCRATCH_PREFIX)) {
          await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        }
      }
      await admin.destroy();
    }
  });

  it('starts from a schema that has no durationDays column or constraint yet', async () => {
    const ds = await connect(dbA, WITH_DURATION);
    expect(await columnExists(ds, 'tasks', 'durationDays')).toBe(false);
    expect(await constraintExists(ds, 'CHK_tasks_durationDays_non_negative')).toBe(false);
    await close(ds);
  });

  it('up(): existing tasks stay NULL (no invented value) and every other field is unchanged', async () => {
    const ds = await connect(dbA, WITH_DURATION);
    const ran = await ds.runMigrations();
    expect(ran.map((m) => m.name)).toEqual(['AddTaskDuration1700000004000']);

    const rows = await durations(ds);
    expect(rows).toHaveLength(4); // no task lost
    expect(rows.every((r) => r.durationDays === null)).toBe(true);

    expect(await tasksSnapshot(ds)).toEqual(tasksBefore); // incl. exact costs and HIGH/LOW priorities
    expect(await otherSnapshot(ds)).toEqual(othersBefore); // nothing outside tasks changed
    await close(ds);
  });

  it('up(): column is a nullable integer with no default, and the CHECK constraint exists', async () => {
    const ds = await connect(dbA, WITH_DURATION);
    const [column] = await ds.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'durationDays'`,
    );
    expect(column.data_type).toBe('integer');
    expect(column.is_nullable).toBe('YES');
    expect(column.column_default).toBeNull();
    expect(await constraintExists(ds, 'CHK_tasks_durationDays_non_negative')).toBe(true);
    await close(ds);
  });

  it('up(): a new task that omits it is NULL; 0 and positive values are accepted; negatives are rejected', async () => {
    const ds = await connect(dbA, WITH_DURATION);
    const [project] = await ds.query(`SELECT "id" FROM "projects" LIMIT 1`);
    const insert = (title: string, value: string) =>
      ds.query(
        `INSERT INTO "tasks" ("title","projectId","durationDays") VALUES ($1, $2, ${value}) RETURNING "durationDays"`,
        [title, project.id],
      );

    const [omitted] = await ds.query(
      `INSERT INTO "tasks" ("title","projectId") VALUES ('Omitted', $1) RETURNING "durationDays"`,
      [project.id],
    );
    expect(omitted.durationDays).toBeNull();
    expect((await insert('Zero', '0'))[0].durationDays).toBe(0);
    expect((await insert('Two weeks', '14'))[0].durationDays).toBe(14);
    await expect(insert('Negative', '-1')).rejects.toThrow();

    await ds.query(`DELETE FROM "tasks" WHERE "title" IN ('Omitted','Zero','Two weeks')`);
    await close(ds);
  });

  it('down(): drops the column and constraint; tasks and other tables stay intact (set durations are lost)', async () => {
    const ds = await connect(dbA, WITH_DURATION);
    // A duration entered after the migration is the one thing a rollback discards.
    await ds.query(`UPDATE "tasks" SET "durationDays" = 5 WHERE "title" = 'Design wireframes'`);
    await ds.undoLastMigration();

    expect(await columnExists(ds, 'tasks', 'durationDays')).toBe(false);
    expect(await constraintExists(ds, 'CHK_tasks_durationDays_non_negative')).toBe(false);
    expect(await tasksSnapshot(ds)).toEqual(tasksBefore);
    expect(await otherSnapshot(ds)).toEqual(othersBefore);
    await close(ds);
  });

  it('is repeatable: re-applying after the rollback leaves every existing task NULL again', async () => {
    const ds = await connect(dbA, WITH_DURATION);
    await ds.runMigrations();
    const rows = await durations(ds);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.durationDays === null)).toBe(true); // the 5 set before is gone
    expect(await tasksSnapshot(ds)).toEqual(tasksBefore);
    await close(ds);
  });

  it('full history: all five migrations apply from the first schema on top of populated data', async () => {
    const ds = await connect(dbB, WITH_DURATION);
    const ran = await ds.runMigrations();
    expect(ran.map((m) => m.name)).toEqual([
      'AddTaskPriority1700000001000',
      'AddUserPlatformRole1700000002000',
      'RemoveUserPlatformRole1700000003000',
      'AddTaskDuration1700000004000',
    ]);

    // Final schema: priority (backfilled MEDIUM) and durationDays (NULL) exist; platformRole is gone.
    expect(await columnExists(ds, 'tasks', 'priority')).toBe(true);
    expect(await columnExists(ds, 'tasks', 'durationDays')).toBe(true);
    expect(await columnExists(ds, 'users', 'platformRole')).toBe(false);
    const rows = await ds.query(`SELECT "priority","durationDays" FROM "tasks"`);
    expect(rows).toHaveLength(4);
    expect(rows.every((r: { priority: string }) => r.priority === 'MEDIUM')).toBe(true);
    expect(rows.every((r: { durationDays: number | null }) => r.durationDays === null)).toBe(true);

    // Everything else survived the whole history.
    expect(await ds.query(`SELECT count(*)::int AS n FROM "users"`)).toEqual([{ n: 1 }]);
    expect(await ds.query(`SELECT count(*)::int AS n FROM "organizations"`)).toEqual([{ n: 2 }]);
    expect(await ds.query(`SELECT count(*)::int AS n FROM "organization_memberships"`)).toEqual([{ n: 2 }]);
    expect(await ds.query(`SELECT count(*)::int AS n FROM "projects"`)).toEqual([{ n: 1 }]);
    await close(ds);
  });
});
