import { DataSource, MigrationInterface } from 'typeorm';
import { randomBytes } from 'crypto';
import { InitialSchema1700000000000 } from '../src/database/migrations/1700000000000-InitialSchema';
import { AddTaskPriority1700000001000 } from '../src/database/migrations/1700000001000-AddTaskPriority';
import { AddUserPlatformRole1700000002000 } from '../src/database/migrations/1700000002000-AddUserPlatformRole';
import { RemoveUserPlatformRole1700000003000 } from '../src/database/migrations/1700000003000-RemoveUserPlatformRole';

/**
 * Upgrade + rollback tests for the platform-role migration pair on databases that ALREADY HOLD
 * DATA:
 *   - AddUserPlatformRole1700000002000    adds users.platformRole (enum, NOT NULL, default 'USER')
 *   - RemoveUserPlatformRole1700000003000 drops it again (platform admins were later removed)
 *
 * Same conventions as migration-upgrade-add-task-priority.e2e-spec.ts: scratch databases created for this file and
 * dropped afterwards (also when a test fails), explicit POSTGRES_* variables only (no .env file),
 * and a refusal to run against a hosted host. It never touches the shared E2E database, the
 * development database or Neon.
 */

type MigrationClass = new () => MigrationInterface;

const SCRATCH_PREFIX = 'migration_upgrade_test_';

describe('Platform-role migrations on a populated database (e2e)', () => {
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

  // Migrations that exist BEFORE the migration under test (the "previous version" of the product).
  const PREVIOUS: MigrationClass[] = [InitialSchema1700000000000, AddTaskPriority1700000001000];
  const WITH_ADD: MigrationClass[] = [...PREVIOUS, AddUserPlatformRole1700000002000];
  const ALL: MigrationClass[] = [...WITH_ADD, RemoveUserPlatformRole1700000003000];

  /** users WITHOUT the platformRole column, so it is comparable across every schema version. */
  const usersSnapshot = (ds: DataSource) =>
    ds.query(
      `SELECT "id","email","passwordHash","firstName","lastName","isActive","createdAt","updatedAt"
         FROM "users" ORDER BY "email"`,
    );
  /** Every table the platform-role migrations must not touch. */
  const otherSnapshot = async (ds: DataSource) => ({
    organizations: await ds.query(`SELECT * FROM "organizations" ORDER BY "slug"`),
    memberships: await ds.query(`SELECT * FROM "organization_memberships" ORDER BY "id"`),
    projects: await ds.query(`SELECT * FROM "projects" ORDER BY "name"`),
    tasks: await ds.query(`SELECT * FROM "tasks" ORDER BY "title"`),
  });
  const columnExists = async (ds: DataSource, table: string, column: string) =>
    (
      await ds.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [table, column],
      )
    ).length === 1;
  const typeExists = async (ds: DataSource, name: string) =>
    (await ds.query(`SELECT 1 FROM pg_type WHERE typname = $1`, [name])).length === 1;
  const platformRoles = async (ds: DataSource): Promise<Array<{ email: string; platformRole: string }>> =>
    ds.query(`SELECT "email","platformRole" FROM "users" ORDER BY "email"`);

  /** Representative legacy data: several users, two organizations, memberships, a project, tasks. */
  const seed = async (ds: DataSource) => {
    const users: Array<{ id: string }> = [];
    for (const [email, first, last, active] of [
      ['aster@legacy.test', 'Aster', 'Admin', true],
      ['bekele@legacy.test', 'Bekele', 'Member', true],
      ['chaltu@legacy.test', 'Chaltu', 'Inactive', false],
    ] as const) {
      const [u] = await ds.query(
        `INSERT INTO "users" ("email","passwordHash","firstName","lastName","isActive")
         VALUES ($1,'not-a-real-hash',$2,$3,$4) RETURNING "id"`,
        [email, first, last, active],
      );
      users.push(u);
    }
    const [orgA] = await ds.query(
      `INSERT INTO "organizations" ("name","slug") VALUES ('Legacy A','legacy-a') RETURNING "id"`,
    );
    const [orgB] = await ds.query(
      `INSERT INTO "organizations" ("name","slug") VALUES ('Legacy B','legacy-b') RETURNING "id"`,
    );
    await ds.query(
      `INSERT INTO "organization_memberships" ("role","userId","organizationId") VALUES
         ('ADMIN',  $1, $4), ('MEMBER', $2, $4), ('ADMIN', $2, $5), ('MEMBER', $3, $5)`,
      [users[0].id, users[1].id, users[2].id, orgA.id, orgB.id],
    );
    const [project] = await ds.query(
      `INSERT INTO "projects" ("name","budget","organizationId")
       VALUES ('Mobile Banking Platform','750000.00',$1) RETURNING "id"`,
      [orgA.id],
    );
    await ds.query(
      `INSERT INTO "tasks" ("title","description","status","estimatedCost","projectId") VALUES
         ('Design wireframes', 'Screens', 'COMPLETED',   '120000.50',  $1),
         ('Build auth service', NULL,     'IN_PROGRESS', '250000.00',  $1),
         ('Write runbook',      '',       'TODO',        '0.00',       $1)`,
      [project.id],
    );
  };

  let usersBefore: Array<Record<string, unknown>>;
  let othersBefore: Awaited<ReturnType<typeof otherSnapshot>>;

  beforeAll(async () => {
    if (/neon\.tech|render\.com/i.test(host)) {
      throw new Error(`Refusing to run the migration test against a hosted database (${host}).`);
    }
    admin = new DataSource({ ...connection, database: 'postgres' });
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${dbA}"`);
    await admin.query(`CREATE DATABASE "${dbB}"`);

    // Database A: schema one step BEFORE AddUserPlatformRole (initial + priority), with data.
    const a = await connect(dbA, PREVIOUS);
    await a.runMigrations();
    await seed(a);
    // Priorities users have really set; the migrations under test must not disturb them.
    await a.query(`UPDATE "tasks" SET "priority" = 'HIGH' WHERE "title" = 'Build auth service'`);
    await a.query(`UPDATE "tasks" SET "priority" = 'LOW'  WHERE "title" = 'Write runbook'`);
    usersBefore = await usersSnapshot(a);
    othersBefore = await otherSnapshot(a);
    expect(usersBefore).toHaveLength(3);
    expect(othersBefore.tasks).toHaveLength(3);
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

  it('starts from a schema that has no platformRole column or enum yet', async () => {
    const ds = await connect(dbA, WITH_ADD);
    expect(await columnExists(ds, 'users', 'platformRole')).toBe(false);
    expect(await typeExists(ds, 'user_platform_role_enum')).toBe(false);
    await close(ds);
  });

  describe('AddUserPlatformRole', () => {
    it('up(): every existing user becomes USER; users and all other tables are unchanged', async () => {
      const ds = await connect(dbA, WITH_ADD);
      const ran = await ds.runMigrations();
      expect(ran.map((m) => m.name)).toEqual(['AddUserPlatformRole1700000002000']);

      const roles = await platformRoles(ds);
      expect(roles).toHaveLength(3); // no user lost
      expect(roles.every((r) => r.platformRole === 'USER')).toBe(true); // nobody is promoted

      expect(await usersSnapshot(ds)).toEqual(usersBefore); // identity fields unchanged
      expect(await otherSnapshot(ds)).toEqual(othersBefore); // incl. the HIGH/LOW priorities
      await close(ds);
    });

    it('up(): column is NOT NULL default USER; enum is PLATFORM_ADMIN/USER', async () => {
      const ds = await connect(dbA, WITH_ADD);
      const [column] = await ds.query(
        `SELECT is_nullable, column_default FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'platformRole'`,
      );
      expect(column.is_nullable).toBe('NO');
      expect(column.column_default).toContain("'USER'");

      const labels = await ds.query(
        `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'user_platform_role_enum' ORDER BY e.enumsortorder`,
      );
      expect(labels.map((l: { enumlabel: string }) => l.enumlabel)).toEqual(['PLATFORM_ADMIN', 'USER']);
      await close(ds);
    });

    it('up(): a new user that omits it defaults to USER; PLATFORM_ADMIN is allowed; junk is rejected', async () => {
      const ds = await connect(dbA, WITH_ADD);
      const [fresh] = await ds.query(
        `INSERT INTO "users" ("email","passwordHash","firstName","lastName")
         VALUES ('new@legacy.test','x','New','User') RETURNING "platformRole"`,
      );
      expect(fresh.platformRole).toBe('USER');

      const [promoted] = await ds.query(
        `INSERT INTO "users" ("email","passwordHash","firstName","lastName","platformRole")
         VALUES ('root@legacy.test','x','Root','Admin','PLATFORM_ADMIN') RETURNING "platformRole"`,
      );
      expect(promoted.platformRole).toBe('PLATFORM_ADMIN');

      await expect(
        ds.query(
          `INSERT INTO "users" ("email","passwordHash","firstName","lastName","platformRole")
           VALUES ('bad@legacy.test','x','Bad','Role','SUPERUSER')`,
        ),
      ).rejects.toThrow();

      await ds.query(`DELETE FROM "users" WHERE "email" IN ('new@legacy.test','root@legacy.test')`);
      await close(ds);
    });

    it('down(): removes the column and enum type; users and other tables stay intact', async () => {
      const ds = await connect(dbA, WITH_ADD);
      await ds.undoLastMigration();

      expect(await columnExists(ds, 'users', 'platformRole')).toBe(false);
      expect(await typeExists(ds, 'user_platform_role_enum')).toBe(false);
      expect(await usersSnapshot(ds)).toEqual(usersBefore);
      expect(await otherSnapshot(ds)).toEqual(othersBefore);
      await close(ds);
    });

    it('is repeatable: re-applying after the rollback backfills USER again', async () => {
      const ds = await connect(dbA, WITH_ADD);
      await ds.runMigrations();
      const roles = await platformRoles(ds);
      expect(roles).toHaveLength(3);
      expect(roles.every((r) => r.platformRole === 'USER')).toBe(true);
      expect(await usersSnapshot(ds)).toEqual(usersBefore);
      await close(ds);
    });
  });

  describe('RemoveUserPlatformRole (applied after AddUserPlatformRole)', () => {
    it('up(): drops the column and enum even when a user holds PLATFORM_ADMIN; no user is lost', async () => {
      const ds = await connect(dbA, ALL);
      // Edge case: someone was promoted while the column existed. Removing must not delete them.
      await ds.query(`UPDATE "users" SET "platformRole" = 'PLATFORM_ADMIN' WHERE "email" = 'aster@legacy.test'`);

      const ran = await ds.runMigrations();
      expect(ran.map((m) => m.name)).toEqual(['RemoveUserPlatformRole1700000003000']);

      expect(await columnExists(ds, 'users', 'platformRole')).toBe(false);
      expect(await typeExists(ds, 'user_platform_role_enum')).toBe(false);
      expect(await usersSnapshot(ds)).toEqual(usersBefore);
      expect(await otherSnapshot(ds)).toEqual(othersBefore);
      await close(ds);
    });

    it('down(): recreates the column/enum with every user as USER (a discarded PLATFORM_ADMIN is not restored)', async () => {
      const ds = await connect(dbA, ALL);
      await ds.undoLastMigration();

      expect(await columnExists(ds, 'users', 'platformRole')).toBe(true);
      expect(await typeExists(ds, 'user_platform_role_enum')).toBe(true);
      const roles = await platformRoles(ds);
      expect(roles).toHaveLength(3);
      expect(roles.every((r) => r.platformRole === 'USER')).toBe(true); // documented data loss
      expect(await usersSnapshot(ds)).toEqual(usersBefore);
      expect(await otherSnapshot(ds)).toEqual(othersBefore);
      await close(ds);
    });
  });

  it('full history: all four migrations apply from the first schema on top of populated data', async () => {
    const ds = await connect(dbB, ALL);
    const ran = await ds.runMigrations();
    expect(ran.map((m) => m.name)).toEqual([
      'AddTaskPriority1700000001000',
      'AddUserPlatformRole1700000002000',
      'RemoveUserPlatformRole1700000003000',
    ]);

    // Final schema: priority exists and backfilled MEDIUM; platformRole is gone again.
    expect(await columnExists(ds, 'tasks', 'priority')).toBe(true);
    expect(await columnExists(ds, 'users', 'platformRole')).toBe(false);
    expect(await typeExists(ds, 'user_platform_role_enum')).toBe(false);
    const priorities = await ds.query(`SELECT "priority" FROM "tasks"`);
    expect(priorities).toHaveLength(3);
    expect(priorities.every((p: { priority: string }) => p.priority === 'MEDIUM')).toBe(true);

    // All users, organizations, memberships and projects survived the whole history.
    expect(await ds.query(`SELECT count(*)::int AS n FROM "users"`)).toEqual([{ n: 3 }]);
    expect(await ds.query(`SELECT count(*)::int AS n FROM "organizations"`)).toEqual([{ n: 2 }]);
    expect(await ds.query(`SELECT count(*)::int AS n FROM "organization_memberships"`)).toEqual([{ n: 4 }]);
    expect(await ds.query(`SELECT count(*)::int AS n FROM "projects"`)).toEqual([{ n: 1 }]);
    await close(ds);
  });
});
