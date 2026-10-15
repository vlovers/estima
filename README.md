# Estima — AI-assisted software estimation

A full-stack TypeScript application for organizing development projects and tasks and generating AI-assisted time estimates.

> **Status:** Active development. Public demo and screenshots are not yet available.

## Architecture at a glance

```text
React + Mantine frontend
         |
         v
     NestJS API ---- AI estimation integration
         |
         v
  TypeORM / PostgreSQL
```

This is a conceptual architecture diagram, not a deployment topology.

## Engineering highlights

- JWT-based authentication and token lifecycle handling.
- Explicit TypeORM migrations and schema validation workflows.
- Disposable PostgreSQL environment for migration smoke tests and HTTP integration tests.
- Separate Nx targets for API and web development, builds, tests, and linting.
- Deterministic calibration simulation covering underestimation, overestimation, outliers, tenant differences, and changing conditions (`bun run simulate:calibration`).

A full-stack application designed to provide AI-powered time estimates for software development tasks. This monorepo contains the NestJS backend API and the React frontend application, managed with Nx.

## Features

*   **User Authentication:** Secure registration and login with JWT-based authentication.
*   **Project Management:** Create, view, update, and delete projects.
*   **Task Management:** Add tasks to projects, update their status, and manage details.
*   **AI-Powered Estimations:** Get development time estimates for tasks based on their description, technology, and required experience level.
*   **Database Migrations:** TypeORM migrations to manage the database schema.

---

## Tech Stack

### Backend (API)

*   **Framework:** [NestJS](https://nestjs.com/)
*   **Language:** TypeScript
*   **Database:** PostgreSQL
*   **ORM:** [TypeORM](https://typeorm.io/)
*   **Authentication:** JWT with Passport.js

### Frontend (Web)

*   **Framework:** [React](https://reactjs.org/)
*   **Language:** TypeScript
*   **UI Library:** [Mantine](https://mantine.dev/)
*   **State Management:** [Redux Toolkit](https://redux-toolkit.js.org/)
*   **Data Fetching:** [React Query](https://tanstack.com/query/v4)

### Tooling

*   **Monorepo:** [Nx](https://nx.dev/)
*   **Package Manager:** [Bun](https://bun.sh/) 1.3.2

---

## Prerequisites

Before you begin, ensure you have the following installed on your system:

*   [Node.js](https://nodejs.org/en/) 24 (for Nx and CLI tooling)
*   [Bun](https://bun.sh/) 1.3.2
*   [Docker](https://www.docker.com/get-started/) and Docker Compose

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/vlovers/estima.git
cd estima
```

### 2. Install Dependencies

Install all the necessary dependencies for both the API and web applications from the root directory.

```bash
bun ci
```

---

## Running the Application

### Backend (API)

1.  **Set Up Environment Variables:**
    Navigate to the `api` directory and create a `.env` file by copying the example:

    ```bash
    cd api
    cp .env.example .env
    ```

    Open the `.env` file and fill in the required environment variables, such as your database credentials and JWT secrets.

2.  **Start the Database:**
    From the root of the project, start the PostgreSQL database using Docker Compose:

    ```bash
    docker compose up -d
    ```

3.  **Run Database Migrations:**
    To set up the database schema, run the TypeORM migrations:

    ```bash
    TYPEORM_MIGRATION_CHAIN=baseline bun run typeorm:run-migrations
    ```

4.  **Start the API Server:**
    From the root of the project, start the NestJS development server:

    ```bash
    bun run start:api
    ```

    The API will be running at `http://localhost:3000`.

### Frontend (Web)

1.  **Start the Web Server:**
    In a new terminal, start the React development server from the root of the project:

    ```bash
    bun run start:web
    ```

    The frontend application will be available at `http://localhost:4200`.

---

## Running with Docker

Create `api/.env` from `api/.env.example` and set PostgreSQL credentials, JWT secrets and other required settings. Never commit real credentials.

**On a fresh, empty database**, initialize PostgreSQL and run the baseline migration chain *before* starting the API (runtime rejects missing or unexpected schema):

```bash
docker compose up -d postgres
TYPEORM_MIGRATION_CHAIN=baseline bun run typeorm:run-migrations
docker compose up --build -d api web
```

Web is available at `http://localhost` and the API at `http://localhost:3000`. Swagger JSON is at `http://localhost:3000/docs-json`.

To stop the stack: `docker compose down`. Do **not** use `docker compose down -v` unless you intentionally want to destroy the database volume.

**Existing databases:** Do not run baseline migrations automatically. Inspect and reconcile the database first; see [migration safety notes](api/src/database/MIGRATIONS.md). The API intentionally fails closed on unknown or legacy migration histories.

---

## CI validation

Pull requests to `develop` run Bun lockfile installation, lint, unit tests, API/Web builds and Docker image builds. A separate workflow runs baseline migration validation, HTTP/PostgreSQL integration tests and a production API runtime smoke test against a disposable PostgreSQL 17 container. These tests do not contact the real OpenAI API.

## Validation and tests

The root package scripts also provide:

```bash
bun run lint
bun run test
bun run test:api:integration
bun run migration-test:baseline
```

For new databases, use the baseline migration chain. Runtime validates the exact expected migration history and never synchronizes the database automatically. Database integration and migration validation use a disposable PostgreSQL test setup; consult [migration notes](api/src/database/MIGRATIONS.md) before running migrations against existing databases.

> **Setup note:** These instructions should be validated in a clean development environment before deployment. The Docker Compose host ports are bound to localhost.

---

## Available Scripts

Here are some of the most common scripts you can run from the root directory:

*   `bun run start:api`: Starts the backend development server.
*   `bun run start:web`: Starts the frontend development server.

*   `bun run build:api`: Builds the backend application for production.
*   `bun run build:web`: Builds the frontend application for production.

*   `bun run typeorm:run-migrations`: Runs all pending database migrations.
*   `bun run typeorm:revert-migration`: Reverts the last executed migration.

*   `bun run test`: Runs unit tests for all projects.
*   `bun run test:e2e:api`: Runs end-to-end tests for the API.
*   `bun run test:e2e:web`: Runs end-to-end tests for the web application.

*   `bun run lint`: Lints all projects in the workspace.
