import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enums
    await queryRunner.query(`
      CREATE TYPE "membership_role_enum" AS ENUM ('ADMIN', 'MEMBER');
    `);
    await queryRunner.query(`
      CREATE TYPE "task_status_enum" AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED');
    `);

    // 2. Users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(255) NOT NULL,
        "passwordHash" character varying(255) NOT NULL,
        "firstName" character varying(100) NOT NULL,
        "lastName" character varying(100) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email");
    `);

    // 3. Organizations table
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(150) NOT NULL,
        "slug" character varying(100) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organizations_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_organizations_slug" UNIQUE ("slug")
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_organizations_slug" ON "organizations" ("slug");
    `);

    // 4. Organization Memberships table
    await queryRunner.query(`
      CREATE TABLE "organization_memberships" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "role" "membership_role_enum" NOT NULL DEFAULT 'MEMBER',
        "userId" uuid NOT NULL,
        "organizationId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organization_memberships_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_organization" UNIQUE ("userId", "organizationId"),
        CONSTRAINT "FK_org_membership_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_org_membership_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_org_membership_userId" ON "organization_memberships" ("userId");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_org_membership_organizationId" ON "organization_memberships" ("organizationId");
    `);

    // 5. Projects table (with ETB numeric budget)
    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(200) NOT NULL,
        "description" text,
        "budget" numeric(14,2) NOT NULL DEFAULT '0.00',
        "currency" character varying(3) NOT NULL DEFAULT 'ETB',
        "organizationId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_projects_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_projects_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_projects_organizationId" ON "projects" ("organizationId");
    `);

    // 6. Tasks table (with estimatedCost ETB numeric)
    await queryRunner.query(`
      CREATE TABLE "tasks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying(250) NOT NULL,
        "description" text,
        "status" "task_status_enum" NOT NULL DEFAULT 'TODO',
        "estimatedCost" numeric(14,2) NOT NULL DEFAULT '0.00',
        "currency" character varying(3) NOT NULL DEFAULT 'ETB',
        "projectId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tasks_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tasks_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tasks_projectId" ON "tasks" ("projectId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tasks";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "projects";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_memberships";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "task_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "membership_role_enum";`);
  }
}
