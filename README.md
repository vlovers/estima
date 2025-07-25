# AI Estimates Monorepo

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
*   **Package Manager:** [Yarn](https://yarnpkg.com/)

---

## Prerequisites

Before you begin, ensure you have the following installed on your system:

*   [Node.js](https://nodejs.org/en/) (v18 or later recommended)
*   [Yarn](https://yarnpkg.com/getting-started/install)
*   [Docker](https://www.docker.com/get-started/) and Docker Compose

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://https://github.com/vlovers/estima.git
cd estima
```

### 2. Install Dependencies

Install all the necessary dependencies for both the API and web applications from the root directory.

```bash
yarn install
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
    docker-compose up -d
    ```

3.  **Run Database Migrations:**
    To set up the database schema, run the TypeORM migrations:

    ```bash
    yarn typeorm:run-migrations
    ```

4.  **Start the API Server:**
    From the root of the project, start the NestJS development server:

    ```bash
    yarn start:api
    ```

    The API will be running at `http://localhost:3000`.

### Frontend (Web)

1.  **Start the Web Server:**
    In a new terminal, start the React development server from the root of the project:

    ```bash
    yarn start:web
    ```

    The frontend application will be available at `http://localhost:4200`.

---

## Available Scripts

Here are some of the most common scripts you can run from the root directory:

*   `yarn start:api`: Starts the backend development server.
*   `yarn start:web`: Starts the frontend development server.

*   `yarn build:api`: Builds the backend application for production.
*   `yarn build:web`: Builds the frontend application for production.

*   `yarn typeorm:run-migrations`: Runs all pending database migrations.
*   `yarn typeorm:revert-migration`: Reverts the last executed migration.

*   `yarn test`: Runs unit tests for all projects.
*   `yarn test:e2e:api`: Runs end-to-end tests for the API.
*   `yarn test:e2e:web`: Runs end-to-end tests for the web application.

*   `yarn lint`: Lints all projects in the workspace.
