import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes the platform-level role added by AddUserPlatformRole1700000002000. Organization creation
 * is open to every authenticated user again, so the column no longer serves any purpose.
 *
 * Data note: up() discards the column's values. Every account created through the application
 * holds the default 'USER'; the only way to hold 'PLATFORM_ADMIN' was the (now removed) seed
 * bootstrap, so no application data depends on it.
 */
export class RemoveUserPlatformRole1700000003000 implements MigrationInterface {
  name = 'RemoveUserPlatformRole1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "platformRole";
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "user_platform_role_enum";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreates the schema exactly as AddUserPlatformRole1700000002000 left it. Every user comes
    // back as 'USER' (any PLATFORM_ADMIN assignment dropped by up() cannot be restored).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_platform_role_enum') THEN
          CREATE TYPE "user_platform_role_enum" AS ENUM ('PLATFORM_ADMIN', 'USER');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "platformRole" "user_platform_role_enum" NOT NULL DEFAULT 'USER';
    `);
  }
}
