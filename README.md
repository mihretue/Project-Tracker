# Tenant Project Tracker

A multi-tenant project and task tracker. Users belong to one or more organizations, with a role
(ADMIN or MEMBER) **per organization**. Projects carry ETB budgets, tasks carry a priority and an
estimated cost, and budget totals are calculated per project.

**NestJS · React + Vite · PostgreSQL · TypeScript**

## Architecture

A modular monolith: a NestJS REST API (controllers, services, entities, guards, DTOs) and a React +
Vite single-page app, in one npm-workspaces monorepo. PostgreSQL (via TypeORM) stores users,
organizations, memberships, projects and tasks; migrations define the schema. Authentication is a
JWT; every authorization decision (membership, role) is made on the server, never by the frontend.
The API and the web app deploy independently on Render, sharing one Neon PostgreSQL database.

## Live demo

| | |
|---|---|
| Web app | https://project-tracker-lasw.onrender.com |
| API | https://tracker-api-0951.onrender.com/api |
| API docs (Swagger) | https://tracker-api-0951.onrender.com/api/docs |

Hosted on Render (free tier) with a Neon PostgreSQL database. The API sleeps when idle, so the
**first request can take about 30 seconds**.

Demo accounts (organization *Abyssinia Technologies PLC*, project *Mobile Banking Platform*,
budget ETB 750,000.00):

| Role | Email | Password |
|---|---|---|
| ADMIN | `admin@abyssinia.test` | `Password123!` |
| MEMBER | `member@abyssinia.test` | `Password123!` |

You can also register a new user, create your own organization (you become its ADMIN), and add
other users to it by email.

## What it does

- **Organizations**: any signed-in user can create one and becomes its ADMIN. A user can be ADMIN in
  one organization and MEMBER in another.
- **ADMIN**: create, edit and delete projects; delete tasks; add members; change member roles.
- **MEMBER**: view projects and tasks; create and edit tasks.
- **Projects and tasks**: ETB budgets, task priority (LOW / MEDIUM / HIGH) with a priority filter,
  status, estimated cost. Budget figures are planning numbers, not recorded spending (there is no
  actual-expenditure data): **allocated** = sum of task estimated costs, **remaining** = budget −
  allocated, **utilization** = allocated ÷ budget. They are always computed from *all* of a
  project's tasks, whatever the filter shows.
- **Responsive UI** with light and dark themes and a mobile navigation drawer.

## Organization creation and authorization

The application uses organization-scoped role-based access control rather than a platform-level
administrator role.

Any authenticated user can create an organization. The creator is automatically assigned the
`ADMIN` role as the organization's first member. Organization creation and the initial ADMIN
membership are performed within a single database transaction to prevent organizations from being
created without an administrator.

Each user's role is stored in the organization membership record, not globally on the user account.
A user can therefore be an `ADMIN` in one organization and a `MEMBER` in another.

Organization administrators can add members and assign either `ADMIN` or `MEMBER` roles. All
organization-scoped operations enforce membership and authorization on the server.

This design supports self-service organization creation while maintaining tenant isolation and
independent permissions across organizations.

## Design decisions

- **Tenant isolation is enforced on the server, from the database.** Every organization route goes
  through a `TenantGuard` that checks the caller's membership; project and task routes look up the
  resource, find its organization, and check membership and role there. Client-supplied
  organization IDs are never trusted, and a non-member always gets `403`. A cross-tenant E2E suite
  covers organizations, members, projects and tasks.
- **Roles live on the membership**, not on the user, which is what allows a different role per
  organization. The last ADMIN of an organization cannot be demoted; the check runs in a transaction
  with a row lock so two concurrent demotions cannot leave zero admins.
- **Money is exact.** `NUMERIC(14,2)` columns and `decimal.js`; the API rejects more than two
  decimals or more than 12 integer digits instead of rounding or failing in the database.
- **Validation** at the API boundary: whitespace-only names are rejected, IDs must be UUIDs, unknown
  fields are rejected, and unexpected errors return a generic message (no stack traces).
- **Security configuration**: the API refuses to start without a strong `JWT_SECRET`, CORS allows
  only listed origins, and login/registration are rate limited.
- **Migrations**, not auto-sync, define the schema (see below).

## Migrations and rollback

The migration history currently contains these five migrations, in application order:

1. `1700000000000-InitialSchema` — creates the initial database schema.
2. `1700000001000-AddTaskPriority` — adds task priorities (`LOW / MEDIUM / HIGH`).
3. `1700000002000-AddUserPlatformRole` — adds the user platform-role field.
4. `1700000003000-RemoveUserPlatformRole` — removes the user platform-role field.
5. `1700000004000-AddTaskDuration` — adds task duration.

**Task priority migration** (`1700000001000-AddTaskPriority`) is the migration required for Part 3:

1. Creates the `task_priority_enum` type.
2. Adds `tasks.priority` as `NOT NULL DEFAULT 'MEDIUM'`. In PostgreSQL, adding a column with a
   default gives every *existing* row that default, so all existing tasks become `MEDIUM` in one
   statement, with no row loop and no data loss. New tasks also default to `MEDIUM`.
3. Adds an index on `priority` for the filter.

`down()` reverses it exactly: drops the index, the column, then the type. Tasks and every other
column are untouched; only the priority values are lost.

- **Apply:** `npm run migration:run` (CI runs it against the live database before deploying).
- **Roll back:** `npm run migration:revert` undoes only the *latest* applied migration. Run it once
  per migration, in reverse application order, until reaching the migration you intend to revert.
  Reverting the priority migration also removes the priority values.
- **Compatibility:** the `priority` column has a default, so the previous app version keeps working
  against the new schema. If a deploy fails, roll back the application first and keep the additive
  column; revert the schema only if it is itself the problem, and take a Neon backup or branch first.
- **Verification:** CI verifies migrations before deployment in two ways. (A) All migrations are
  applied from scratch to a throwaway database, and the E2E tests run against that schema.
  (B) `npm run test:migration` runs three migration-upgrade test suites (22 tests) against scratch
  databases, covering task-priority, task-duration and platform-role migration upgrade/rollback
  behavior. The priority suite builds the pre-priority schema, inserts legacy tasks, applies only
  the priority migration, and verifies that existing tasks remain intact with `MEDIUM` priority,
  other tables are untouched, the column has the expected `NOT NULL` constraint and default, and
  the index exists. It also verifies that `down()` removes the priority column, index and enum type
  while preserving the tasks. The other suites verify their respective migration upgrades and
  rollbacks.

## Where tenant isolation could leak

Isolation is enforced per route, not by the database, so it fails if:

- a new endpoint is added without the tenant guard (authentication alone is not enough);
- a nested resource (a project or task) is loaded by ID without checking that it belongs to the
  organization the caller was authorized for;
- a query, aggregate, report or bulk operation omits the organization filter;
- a background job or future code path bypasses the shared guards.

Mitigations in place: membership and role are read from the database on every request, resource
ownership is derived from the stored row (never from client input), and cross-tenant E2E tests
check that a user from one organization gets `403` on another organization's organization, member,
project and task endpoints. Not yet in place: database row-level security as a second layer.

## Run it locally

Prerequisites: Node 20+, Docker (or any PostgreSQL 16).

```bash
npm install
cp .env.example .env                       # used by docker compose
cp apps/api/.env.example apps/api/.env     # API settings
cp apps/web/.env.example apps/web/.env     # VITE_API_URL
```

Edit `apps/api/.env` and set a strong `JWT_SECRET` (32+ characters; the API will not start without
it). Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Keep the `POSTGRES_*` values identical in the root `.env` (read by Docker Compose, which creates the
database) and `apps/api/.env` (read by the API), then:

```bash
npm run docker:db:up     # PostgreSQL
npm run migration:run    # create the schema
npm run seed             # demo organization, two users, project and tasks
npm run dev:api          # http://localhost:3000/api   (terminal 1)
npm run dev:web          # http://localhost:5173       (terminal 2)
```

## Tests

```bash
npm run typecheck        # API and web
npm run test:api         # API unit tests
npm run test:web         # frontend tests
npm run test:e2e         # API end-to-end tests (see below)
npm run test:migration   # priority, duration and platform-role migration upgrade/rollback tests (22 tests)
npm run build            # production builds
```

The E2E tests need their own database, `tenant_project_tracker_test`, with migrations applied
(CI does this automatically). They always use that database, never the development one:

```bash
# macOS / Linux / Git Bash
POSTGRES_HOST=localhost POSTGRES_SSL=false POSTGRES_DB=tenant_project_tracker_test npm run migration:run
POSTGRES_HOST=localhost POSTGRES_SSL=false POSTGRES_DB=tenant_project_tracker_test npm run test:e2e
```

```powershell
# Windows PowerShell
$env:POSTGRES_HOST = "localhost"
$env:POSTGRES_SSL = "false"
$env:POSTGRES_DB = "tenant_project_tracker_test"
npm run migration:run
npm run test:e2e

# Clear the overrides when finished, so later commands use your normal configuration.
Remove-Item Env:POSTGRES_HOST, Env:POSTGRES_SSL, Env:POSTGRES_DB
```

The API test safety guard requires an explicitly configured local host and rejects SSL for this
local test database. Set `POSTGRES_USER`, `POSTGRES_PASSWORD` and (if needed) `POSTGRES_PORT` in
`apps/api/.env` for your local PostgreSQL instance. Do not point these test commands at a hosted
or production database.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request:

1. **api** job: typecheck, build, unit tests, migrate a throwaway Postgres, E2E tests.
2. **web** job: typecheck, tests, build.
3. **deploy** job: only on pushes to `main`, and only if both jobs passed. It applies pending
   migrations to the live database, then triggers the Render deploy hooks.

### Change-based deployment

The pipeline uses change detection to identify which parts of the monorepo have been modified:

- API changes trigger API checks and deployment.
- Frontend changes trigger frontend checks and deployment.
- Changes to both trigger both pipelines and deployments.
- Documentation-only or unrelated changes skip unnecessary application deployments.

This keeps deployments focused on affected applications while ensuring that required checks pass
before deployment.

Required GitHub secrets: `RENDER_API_DEPLOY_HOOK_URL`, `RENDER_WEB_DEPLOY_HOOK_URL`,
`LIVE_POSTGRES_HOST`, `LIVE_POSTGRES_USER`, `LIVE_POSTGRES_PASSWORD`, `LIVE_POSTGRES_DB`
(optionally `LIVE_POSTGRES_PORT`). No credentials are stored in the repository.

## What I would harden before production

- Database row-level security as a second isolation layer; a least-privilege database user for the
  app (separate from the migration user); verified TLS to the database.
- Short-lived access tokens with refresh/revocation so logout takes effect immediately.
- Consistent `403`/`404` responses so resource existence is not disclosed.
- Managed secret storage and rotation; dependency auditing and automated updates.
- Pipeline: post-deploy health check and smoke test, automatic rollback, run concurrency control,
  and a manual approval gate on the `production` environment.
- Operations: central logging, monitoring and alerts, automated backups with a tested restore.

## Known limitations

- Logging out only clears the browser session; an issued JWT stays valid until it expires (1 day).
- A project that does not exist returns `404` while one in another tenant returns `403`, which
  reveals whether an ID exists.
- Demo passwords are public and Swagger is exposed on the demo deployment. The accounts hold demo
  data only; do not enter real information, and they should be disabled after the evaluation.
- There is no endpoint to remove a member or delete an organization.
- Free-tier hosting: cold starts after idle time.

More detail (architecture, API reference, database design): [docs/FULL-DOCUMENTATION.md](docs/FULL-DOCUMENTATION.md).
