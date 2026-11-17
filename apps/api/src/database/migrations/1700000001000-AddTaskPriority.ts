import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskPriority1700000001000 implements MigrationInterface {
  name = 'AddTaskPriority1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create task_priority_enum type if it does not already exist
    await queryRunner.query(`
      CREATE TYPE "task_priority_enum" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
    `);

    // 2. Add priority column with default 'MEDIUM' and NOT NULL constraint
    // In PostgreSQL, ADD COLUMN with DEFAULT backfills all existing records to 'MEDIUM'
    await queryRunner.query(`
      ALTER TABLE "tasks" 
      ADD COLUMN "priority" "task_priority_enum" NOT NULL DEFAULT 'MEDIUM';
    `);

    // 3. Create index for priority filtering queries
    await queryRunner.query(`
      CREATE INDEX "IDX_tasks_priority" ON "tasks" ("priority");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback schema changes cleanly while preserving all existing tasks and relations
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_tasks_priority";
    `);

    await queryRunner.query(`
      ALTER TABLE "tasks" 
      DROP COLUMN IF EXISTS "priority";
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "task_priority_enum";
    `);
  }
}
