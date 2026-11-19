# Tenant Project Tracker

A multi-tenant project and task tracker. Users belong to one or more organizations, with a role
(ADMIN or MEMBER) **per organization**. Projects carry ETB budgets, tasks carry a priority and an
estimated cost, and budget totals are calculated per project.

**NestJS · React + Vite · PostgreSQL · TypeScript**

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
  status, estimated cost. Remaining budget and utilization are always computed from *all* of a
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
- **Migrations**, not auto-sync, define the schema (including the task priority migration).

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

Keep the `POSTGRES_*` values identical in both `.env` files, then:

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
npm run build            # production builds
```

The E2E tests need their own database, `tenant_project_tracker_test`, with migrations applied
(CI does this automatically). They always use that database, never the development one:

```bash
POSTGRES_DB=tenant_project_tracker_test npm run migration:run
POSTGRES_DB=tenant_project_tracker_test npm run test:e2e
```

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request:

1. **api** job: typecheck, build, unit tests, migrate a throwaway Postgres, E2E tests.
2. **web** job: typecheck, tests, build.
3. **deploy** job: only on pushes to `main`, and only if both jobs passed. It applies pending
   migrations to the live database, then triggers the Render deploy hooks.

Required GitHub secrets: `RENDER_API_DEPLOY_HOOK_URL`, `RENDER_WEB_DEPLOY_HOOK_URL`,
`LIVE_POSTGRES_HOST`, `LIVE_POSTGRES_USER`, `LIVE_POSTGRES_PASSWORD`, `LIVE_POSTGRES_DB`
(optionally `LIVE_POSTGRES_PORT`). No credentials are stored in the repository.

## Known limitations

- Logging out only clears the browser session; an issued JWT stays valid until it expires (1 day).
- A project that does not exist returns `404` while one in another tenant returns `403`, which
  reveals whether an ID exists.
- Demo passwords are public and Swagger is exposed on the demo deployment.
- There is no endpoint to remove a member or delete an organization.
- Free-tier hosting: cold starts after idle time.

More detail (architecture, API reference, database design): [docs/FULL-DOCUMENTATION.md](docs/FULL-DOCUMENTATION.md).
