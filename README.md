# ESG Management System (MERN)

**Collect data → Verify → Approve → Measure → Report.**

Single source of truth for ESG master data, reporting cycles, KPI data
collection with SHA-256 hashed evidence, segregated approval workflows, GRI
content index generation, and immutable audit trails.

---

## Architecture & Repository Layout

```
ESG Software/
├─ Skills/                 # Product & technical specifications (PRD, workflow, backend, frontend)
├─ backend/                # Node.js 20 + Express 4 + Mongoose 8 REST API (/api/v1)
├─ frontend/               # React 18 + Vite 5 + Tailwind CSS + TanStack Query SPA
├─ docker-compose.yml      # MongoDB 7 replica set (rs0) + MailHog (SMTP dev server)
└─ package.json            # Root workspace convenience scripts
```

---

## Quick Start (Local Development)

### 1. Start MongoDB Replica Set

Transactions are required for atomic status transitions and audit logging.

- **With Docker:**
  ```bash
  docker compose up -d mongo mailhog
  ```
- **Without Docker (built-in local replica set):**
  ```bash
  npm --prefix backend run dev:db
  ```

### 2. Configure & Seed the Backend

Copy `backend/.env.example` to `backend/.env`, then run the seed script to load
roles, ESG pillars (`E`, `S`, `G`, `GEN`), standards (`GRI`, `IFRS-S1`,
`IFRS-S2`, `SASB`), 12 GRI disclosures, and the `DEMO` organisation:

```bash
npm --prefix backend run seed
npm --prefix backend run dev
```

The API listens on `http://localhost:5000` (Swagger OpenAPI docs at
`http://localhost:5000/api/docs`).

### 3. Start the Frontend

```bash
npm --prefix frontend run dev
```

Open `http://localhost:5173`.

---

## Demo Accounts (`DEMO` Organisation — password: `DemoPass123`)

| Role           | Email             | Name           | Department                          |
| -------------- | ----------------- | -------------- | ----------------------------------- |
| **Admin**      | `admin@demo.esg`  | Asha Admin     | Sustainability & Compliance (`SUS`) |
| **Data Owner** | `ravi@demo.esg`   | Ravi Owner     | Operations & Facilities (`OPS`)     |
| **Approver**   | `meera@demo.esg`  | Meera Approver | Sustainability & Compliance (`SUS`) |
| **Viewer**     | `vikram@demo.esg` | Vikram Viewer  | Human Resources (`HR`)              |

---

## Running Tests & Linting

```bash
# Run both backend and frontend linters
npm run lint

# Run backend Jest + Supertest suite (in-memory MongoDB replica set)
npm --prefix backend test

# Run frontend Vitest + React Testing Library suite
npm --prefix frontend test

# Build production frontend bundle
npm --prefix frontend run build
```
