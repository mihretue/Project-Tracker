import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPlatformRole1700000002000 implements MigrationInterface {
  name = 'AddUserPlatformRole1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "user_platform_role_enum" AS ENUM ('PLATFORM_ADMIN', 'USER');
    `);

    // ADD COLUMN ... DEFAULT backfills every existing user to 'USER'.
    // No existing account is promoted: PLATFORM_ADMIN is only granted by the seed/bootstrap script.
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "platformRole" "user_platform_role_enum" NOT NULL DEFAULT 'USER';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "platformRole";
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "user_platform_role_enum";
    `);
  }
}
