import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds an optional planned duration (whole days) to tasks.
 *
 * Existing tasks have no reliable duration, so the column is NULLABLE with no default: every
 * existing row stays NULL ("unknown") instead of receiving an invented value. A CHECK constraint
 * keeps any value that is set from being negative.
 *
 * Rollback note: down() drops the column, so any durations entered after this migration are lost.
 * Every task and all of its other columns are preserved.
 */
export class AddTaskDuration1700000004000 implements MigrationInterface {
  name = 'AddTaskDuration1700000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tasks"
      ADD COLUMN "durationDays" integer;
    `);

    await queryRunner.query(`
      ALTER TABLE "tasks"
      ADD CONSTRAINT "CHK_tasks_durationDays_non_negative"
      CHECK ("durationDays" IS NULL OR "durationDays" >= 0);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tasks"
      DROP CONSTRAINT IF EXISTS "CHK_tasks_durationDays_non_negative";
    `);

    await queryRunner.query(`
      ALTER TABLE "tasks"
      DROP COLUMN IF EXISTS "durationDays";
    `);
  }
}
