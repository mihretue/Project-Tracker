# Tenant Project Tracker Monorepo

A modular, multi-tenant project management platform built with NestJS, React, TypeScript, and PostgreSQL. Features tenant data isolation, role-based membership (ADMIN, MEMBER), and Ethiopian Birr (ETB) budget and cost tracking.

---

## Architecture Overview

This repository is structured as an npm workspaces monorepo:

```text
tenant-project-tracker/
├── apps/
│   ├── api/                     # NestJS + TypeScript backend
│   │   ├── src/
│   │   │   ├── common/          # Filters, enums, transformers
│   │   │   ├── database/        # TypeORM DataSource & migrations
│   │   │   ├── modules/         # Modular feature domains
│   │   │   │   ├── users/
│   │   │   │   ├── organizations/
│   │   │   │   ├── projects/
│   │   │   │   ├── tasks/
│   │   │   │   └── health/
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   └── test/                # Unit & E2E tests
│   └── web/                     # React + TypeScript + Vite frontend
│       └── src/
│           ├── components/      # UI components (Navbar, Layout, StatCard)
│           ├── pages/           # Route views (Login, Register, Dashboards)
│           └── router.tsx       # React Router DOM configuration
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated CI build & test pipeline
├── docker-compose.yml           # Local PostgreSQL 16 container
├── .env.example                 # Environment variables template
├── package.json                 # Monorepo root scripts & workspace configuration
└── README.md
```

---

## Technology Stack

- **Backend**: NestJS 10, TypeScript 5 (Strict Mode), TypeORM
- **Frontend**: React 18, TypeScript 5, Vite, React Router DOM v6, Lucide Icons
- **Database**: PostgreSQL 16
- **Validation**: `class-validator`, `class-transformer`
- **Testing**: Jest, Supertest
- **Package Manager**: npm (workspaces)

---

## Domain Model & Multi-Tenancy

1. **User**: Represents user identities across the platform. A user can belong to multiple organizations.
2. **Organization**: Represents the tenant boundary. All projects belong to a specific organization.
3. **OrganizationMembership**: Join model linking `User` and `Organization` with explicit `MembershipRole` (`ADMIN` or `MEMBER`). Enforces uniqueness on `(userId, organizationId)`.
4. **Project**: Owned by an `Organization`. Maintains a budget in **Ethiopian Birr (ETB)** stored using PostgreSQL `numeric(14, 2)` to eliminate floating-point rounding errors.
5. **Task**: Owned by a `Project`. Maintains an estimated cost in **ETB** stored using PostgreSQL `numeric(14, 2)`.

---

## Local Setup & Getting Started

### Prerequisites

- **Node.js**: v20 or higher (v24 supported)
- **npm**: v10 or higher
- **Docker & Docker Compose** (for running local PostgreSQL)

### 1. Clone & Install Dependencies

```bash
git clone <repo-url>
cd Project-Tracker

# Install all workspace dependencies
npm install
```

### 2. Configure Environment Variables

Copy the example environment files:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Default local database connection values:
- `POSTGRES_HOST=localhost`
- `POSTGRES_PORT=5432`
- `POSTGRES_USER=postgres`
- `POSTGRES_PASSWORD=postgres`
- `POSTGRES_DB=tenant_project_tracker`

### 3. Start PostgreSQL Database

Using Docker Compose:

```bash
npm run docker:db:up
```

To stop the database:
```bash
npm run docker:db:down
```

### 4. Run Database Migrations

TypeORM is configured with `synchronize: false` in both runtime and CLI configurations. To apply migrations:

```bash
npm run migration:run
```

To revert the latest migration:
```bash
npm run migration:revert
```

### 5. Start Development Servers

Run backend and frontend concurrently or independently:

```bash
# Start backend API (http://localhost:3000/api)
npm run dev:api

# Start frontend application (http://localhost:5173)
npm run dev:web
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev:api` | Starts the NestJS API in watch mode |
| `npm run dev:web` | Starts the Vite React dev server |
| `npm run build` | Builds both backend and frontend applications |
| `npm run build:api` | Compiles the NestJS backend (`dist/`) |
| `npm run build:web` | Compiles the Vite React frontend (`dist/`) |
| `npm run test` | Runs backend unit tests |
| `npm run test:e2e` | Runs backend end-to-end integration tests |
| `npm run typecheck` | Validates strict TypeScript types across all workspaces |
| `npm run migration:run` | Executes pending TypeORM database migrations |
| `npm run migration:revert` | Reverts the last executed migration |
| `npm run docker:db:up` | Starts PostgreSQL container via Docker Compose |
| `npm run docker:db:down` | Stops the PostgreSQL container |

---

## Verification & Status for Phase 1

- [x] Monorepo workspace configuration (`apps/api`, `apps/web`)
- [x] Strict TypeScript configuration without `any`
- [x] Modular NestJS architecture (users, organizations, projects, tasks, health)
- [x] TypeORM PostgreSQL configuration with `synchronize: false`
- [x] Initial migration with exact `numeric(14, 2)` monetary columns for ETB
- [x] Global exception filter and class-validator DTO validation
- [x] React 18 + Vite + React Router DOM responsive foundation
- [x] Placeholder views for Login, Register, Organization Dashboard, and Project Dashboard
- [x] Docker Compose setup and GitHub Actions CI workflow
