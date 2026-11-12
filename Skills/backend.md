# ESG Management System — Backend Specification

Node.js + Express + MongoDB (Mongoose). Read with `prd.md` (what), `workflow.md`
(rules and states), `frontend.md` (consumer of this API).

---

## 1. Tech Stack and Versions

| Concern    | Choice                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| Runtime    | Node.js 20 LTS                                                          |
| Framework  | Express 4                                                               |
| Database   | MongoDB 7 (replica set, required for transactions)                      |
| ODM        | Mongoose 8                                                              |
| Validation | Zod                                                                     |
| Auth       | `jsonwebtoken` (access + refresh), `bcrypt` (cost 12), `cookie-parser`  |
| Uploads    | `multer` (memory → hashed → storage driver)                             |
| Storage    | Local disk driver (dev) / S3-compatible driver (prod), same interface   |
| Email      | `nodemailer` (SMTP)                                                     |
| Jobs       | `node-cron` (daily reminders)                                           |
| Export     | `exceljs` (XLSX), `fast-csv` (CSV), `pdfkit` (PDF summary, P1)          |
| Security   | `helmet`, `cors`, `express-rate-limit`, `express-mongo-sanitize`, `hpp` |
| Logging    | `pino` + `pino-http`                                                    |
| Tests      | Jest + Supertest + `mongodb-memory-server` (replica set mode)           |
| Quality    | ESLint, Prettier, Husky                                                 |
| API docs   | OpenAPI 3 via `swagger-ui-express` at `/api/docs`                       |

## 2. Folder Structure

```
backend/
├─ src/
│  ├─ server.js                 # starts HTTP, connects DB, starts cron
│  ├─ app.js                    # express app, middleware, routes
│  ├─ config/
│  │  ├─ env.js                 # validated env (Zod)
│  │  ├─ db.js                  # mongoose.connect
│  │  └─ constants.js           # statuses, actions, roles
│  ├─ models/                   # 16 Mongoose models (see §4)
│  ├─ routes/                   # one file per resource, mounted at /api/v1
│  ├─ controllers/              # thin: parse → service → respond
│  ├─ services/                 # business rules, transactions
│  │  ├─ auth.service.js
│  │  ├─ kpiRecord.service.js   # state machine
│  │  ├─ period.service.js
│  │  ├─ evidence.service.js
│  │  ├─ dashboard.service.js
│  │  ├─ report.service.js
│  │  ├─ audit.service.js
│  │  ├─ notification.service.js
│  │  └─ emission.service.js
│  ├─ middleware/
│  │  ├─ authenticate.js        # verify JWT → req.user
│  │  ├─ authorize.js           # requireRoles('Admin',…)
│  │  ├─ validate.js            # Zod body/query/params
│  │  ├─ upload.js              # multer config + mime check
│  │  ├─ rateLimit.js
│  │  └─ errorHandler.js
│  ├─ validators/               # Zod schemas per resource
│  ├─ storage/                  # local.js, s3.js, index.js
│  ├─ jobs/reminders.job.js
│  ├─ utils/                    # ApiError, asyncHandler, pagination, hash
│  └─ seed/                     # roles, pillars, GRI, sample KPIs
├─ tests/
├─ uploads/                     # dev only, gitignored
├─ .env.example
├─ Dockerfile
└─ docker-compose.yml           # api + mongo (replica set) + mailhog
```

Layering rule: **routes → controllers → services → models.** Controllers never
touch models; services never read `req`/`res`.

## 3. Environment Variables (`.env.example`)

| Variable                                                        | Example                                        | Purpose                                                     |
| --------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| `NODE_ENV`                                                      | `development`                                  |                                                             |
| `PORT`                                                          | `5000`                                         |                                                             |
| `MONGODB_URI`                                                   | `mongodb://localhost:27017/esg?replicaSet=rs0` | Must be a replica set                                       |
| `JWT_ACCESS_SECRET`                                             | 64+ random chars                               |                                                             |
| `JWT_REFRESH_SECRET`                                            | 64+ random chars                               |                                                             |
| `JWT_ACCESS_TTL`                                                | `15m`                                          |                                                             |
| `JWT_REFRESH_TTL`                                               | `7d`                                           |                                                             |
| `CLIENT_URL`                                                    | `http://localhost:5173`                        | CORS origin, email links                                    |
| `COOKIE_SECURE`                                                 | `false` (dev) / `true`                         |                                                             |
| `STORAGE_DRIVER`                                                | `local` or `s3`                                |                                                             |
| `UPLOAD_DIR`                                                    | `./uploads`                                    | local driver                                                |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`      |                                                | s3 driver                                                   |
| `MAX_FILE_MB`                                                   | `10`                                           |                                                             |
| `MAX_FILES_PER_RECORD`                                          | `10`                                           |                                                             |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` |                                                |                                                             |
| `REMINDER_CRON`                                                 | `0 8 * * *`                                    |                                                             |
| `BCRYPT_COST`                                                   | `12`                                           |                                                             |
| `PLATFORM_ADMIN_EMAILS`                                         | `owner@company.com`                            | Comma list; may edit global pillars, standards, disclosures |

`env.js` validates at boot and exits on any missing value.

## 4. Database Schema (Mongoose)

Rules for all models:

- Primary key is `_id` (ObjectId). ERD "PK id" fields map to `_id`.
- FK fields keep ERD names and are `ObjectId` with `ref`.
- Collection names are the ERD table names (snake_case) via
  `{ collection: '…' }`.
- Timestamps: models with both `created_at` and `updated_at` use
  `timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }`.
- Deviations from ERD are marked **[D-n]** (see `prd.md` §9.1).

### 4.1 `organization`

| Field                      | Type        | Rules                                                        |
| -------------------------- | ----------- | ------------------------------------------------------------ |
| `organization_name`        | String(200) | required, trim, **unique (AK)**                              |
| `organization_code`        | String(50)  | required, uppercase, **unique (AK)**, `/^[A-Z0-9_-]{2,50}$/` |
| `is_active`                | Boolean     | default `true`                                               |
| `created_at`, `updated_at` | Date        | auto                                                         |

### 4.2 `department`

| Field                      | Type                    | Rules             |
| -------------------------- | ----------------------- | ----------------- |
| `organization_id`          | ObjectId → organization | required, indexed |
| `department_name`          | String(150)             | required          |
| `department_code`          | String(50)              | required          |
| `is_active`                | Boolean                 | default `true`    |
| `created_at`, `updated_at` | Date                    | auto              |

Unique index: `(organization_id, department_code)`.

### 4.3 `app_user`

| Field                            | Type                    | Rules                                |
| -------------------------------- | ----------------------- | ------------------------------------ |
| `organization_id`                | ObjectId → organization | required                             |
| `department_id`                  | ObjectId → department   | optional (ERD nullable)              |
| `email`                          | String(255)             | required, lowercase, **unique (AK)** |
| `display_name`                   | String(150)             | required                             |
| `password_hash` **[D-1]**        | String                  | required, `select: false`            |
| `must_change_password` **[D-1]** | Boolean                 | default `false`                      |
| `last_login_at` **[D-1]**        | Date                    |                                      |
| `is_active`                      | Boolean                 | default `true`                       |
| `created_at`, `updated_at`       | Date                    | auto                                 |

### 4.4 `role`

| Field              | Type        | Rules                                                                          |
| ------------------ | ----------- | ------------------------------------------------------------------------------ |
| `role_name`        | String(80)  | required, **unique (AK)**; seeded: `Admin`, `Data Owner`, `Approver`, `Viewer` |
| `role_description` | String(500) |                                                                                |
| `is_active`        | Boolean     | default `true`                                                                 |

No timestamps (matches ERD).

### 4.5 `user_role`

| Field                 | Type                | Rules                   |
| --------------------- | ------------------- | ----------------------- |
| `user_id`             | ObjectId → app_user | required                |
| `role_id`             | ObjectId → role     | required                |
| `assigned_by_user_id` | ObjectId → app_user | nullable (ERD nullable) |
| `assigned_at`         | Date                | default now             |
| `is_active`           | Boolean             | default `true`          |

Unique partial index: `(user_id, role_id)` where `is_active = true`.

### 4.6 `esg_pillar`

| Field                | Type        | Rules                                                             |
| -------------------- | ----------- | ----------------------------------------------------------------- |
| `pillar_code`        | String(20)  | required, **unique** — `E`, `S`, `G`, `GEN`                       |
| `pillar_name`        | String(80)  | required, **unique** — Environmental, Social, Governance, General |
| `pillar_description` | String(500) |                                                                   |
| `is_active`          | Boolean     | default `true`                                                    |

### 4.7 `esg_standard`

| Field           | Type        | Rules                                                           |
| --------------- | ----------- | --------------------------------------------------------------- |
| `standard_code` | String(30)  | required, **unique** (e.g. `GRI`, `IFRS-S1`, `IFRS-S2`, `SASB`) |
| `standard_name` | String(150) | required                                                        |
| `version_label` | String(50)  | required (e.g. `GRI Standards 2021`)                            |
| `issuing_body`  | String(150) |                                                                 |
| `is_active`     | Boolean     | default `true`                                                  |

### 4.8 `standard_pillar`

| Field             | Type                               |
| ----------------- | ---------------------------------- |
| `esg_standard_id` | ObjectId → esg_standard (required) |
| `esg_pillar_id`   | ObjectId → esg_pillar (required)   |

Unique index: `(esg_standard_id, esg_pillar_id)`.

### 4.9 `standard_disclosure`

| Field                    | Type                    | Rules                       |
| ------------------------ | ----------------------- | --------------------------- |
| `esg_standard_id`        | ObjectId → esg_standard | required                    |
| `disclosure_code`        | String(50)              | required (e.g. `GRI 302-1`) |
| `disclosure_title`       | String(255)             | required                    |
| `disclosure_description` | String(1000)            |                             |
| `is_mandatory`           | Boolean                 | default `false`             |

Unique index: `(esg_standard_id, disclosure_code)`.

### 4.10 `kpi`

| Field                      | Type                    | Rules                                                               |
| -------------------------- | ----------------------- | ------------------------------------------------------------------- |
| `organization_id`          | ObjectId → organization | required                                                            |
| `esg_pillar_id`            | ObjectId → esg_pillar   | required                                                            |
| `kpi_code`                 | String(50)              | required, e.g. `ENV-01`                                             |
| `kpi_name`                 | String(255)             | required                                                            |
| `unit_of_measurement`      | String(50)              | required (`kWh`, `%`, `tCO2e`, `m³`, `t`, `hours`, `count`, `rate`) |
| `calculation_method`       | String(1000)            |                                                                     |
| `frequency` **[D-3]**      | String enum             | `Monthly`, `Quarterly`, `Annual`; default `Annual`                  |
| `is_active`                | Boolean                 | default `true`                                                      |
| `created_at`, `updated_at` | Date                    | auto                                                                |

Unique index: `(organization_id, kpi_code)`.

### 4.11 `kpi_standard_disclosure`

| Field                    | Type                                      |
| ------------------------ | ----------------------------------------- |
| `kpi_id`                 | ObjectId → kpi (required)                 |
| `standard_disclosure_id` | ObjectId → standard_disclosure (required) |

Unique index: `(kpi_id, standard_disclosure_id)`.

### 4.12 `reporting_period`

| Field                            | Type                    | Rules                              |
| -------------------------------- | ----------------------- | ---------------------------------- |
| `organization_id`                | ObjectId → organization | required                           |
| `period_name`                    | String(100)             | required (e.g. `FY2026 Q1`)        |
| `period_start_date`              | Date                    | required                           |
| `period_end_date`                | Date                    | required, ≥ start                  |
| `period_status`                  | String enum **[D-6]**   | `In Progress` (default), `Closed`  |
| `closed_at`, `closed_by_user_id` | Date, ObjectId          | set on close (extra audit helpers) |
| `created_at`                     | Date                    | auto (no `updated_at` per ERD)     |

Unique index: `(organization_id, period_name)`.

### 4.13 `kpi_record`

| Field                        | Type                        | Rules                                                                 |
| ---------------------------- | --------------------------- | --------------------------------------------------------------------- |
| `kpi_id`                     | ObjectId → kpi              | required                                                              |
| `reporting_period_id`        | ObjectId → reporting_period | required                                                              |
| `data_owner_user_id`         | ObjectId → app_user         | required                                                              |
| `approver_user_id` **[D-2]** | ObjectId → app_user         | required, ≠ data owner                                                |
| `actual_value`               | Decimal128                  | nullable                                                              |
| `target_value`               | Decimal128                  | nullable                                                              |
| `baseline_value`             | Decimal128                  | nullable                                                              |
| `submission_status`          | String enum                 | `In Progress` (default), `Ready for Approval`, `Approved`, `Rejected` |
| `submitted_at`               | Date                        | nullable                                                              |
| `created_at`, `updated_at`   | Date                        | auto                                                                  |

Unique index: `(kpi_id, reporting_period_id)` (BR-7). Because the ERD has no
`organization_id` on `kpi_record`, organisation scope is derived through
`kpi.organization_id` / `reporting_period.organization_id`. For fast scoping add
denormalised `organization_id` (ObjectId, indexed, set on create). Decimal128 is
serialised to string → number in `toJSON`; values are returned as JSON numbers
with up to 6 decimals.

### 4.14 `evidence`

| Field                          | Type                  | Rules                                    |
| ------------------------------ | --------------------- | ---------------------------------------- |
| `kpi_record_id`                | ObjectId → kpi_record | required                                 |
| `uploaded_by_user_id`          | ObjectId → app_user   | required                                 |
| `file_name`                    | String(255)           | required (original name, sanitised)      |
| `file_url`                     | String(1000)          | required (storage key, not a public URL) |
| `file_hash`                    | String(128)           | SHA-256 hex                              |
| `mime_type`, `file_size_bytes` | String, Number        | extras for validation/UI                 |
| `uploaded_at`                  | Date                  | default now                              |
| `is_active`                    | Boolean               | default `true`                           |

Unique partial index **[D-4]**: `(kpi_record_id, file_hash)` where
`is_active = true`.

### 4.15 `approval`

| Field              | Type                  | Rules                  |
| ------------------ | --------------------- | ---------------------- |
| `kpi_record_id`    | ObjectId → kpi_record | required               |
| `approver_user_id` | ObjectId → app_user   | required               |
| `approval_status`  | String enum           | `Approved`, `Rejected` |
| `comments`         | String(2000)          | required when Rejected |
| `reviewed_at`      | Date                  | default now            |

Insert-only. One row per decision, so a record that was rejected then approved
has two rows.

### 4.16 `audit_log`

| Field             | Type                | Rules                                          |
| ----------------- | ------------------- | ---------------------------------------------- |
| `user_id`         | ObjectId → app_user | required                                       |
| `entity_name`     | String(100)         | required (collection name)                     |
| `record_id`       | ObjectId            | required                                       |
| `action_name`     | String(50)          | required, see action list in `workflow.md` §10 |
| `previous_value`  | String(4000)        | JSON string, truncated with `…` marker         |
| `updated_value`   | String(4000)        | JSON string                                    |
| `organization_id` | ObjectId            | denormalised for scoping and indexing          |
| `created_at`      | Date                | auto                                           |

Mongoose hooks block `updateOne`, `findOneAndUpdate`, `deleteOne`, `deleteMany`
on this model. Never store password hashes or tokens in values.

### 4.17 Index summary

| Collection              | Indexes                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| organization            | `organization_name` unique, `organization_code` unique                                                                                        |
| department              | `(organization_id, department_code)` unique                                                                                                   |
| app_user                | `email` unique; `(organization_id, is_active)`; `department_id`                                                                               |
| user_role               | `(user_id, role_id)` partial unique on active; `user_id`                                                                                      |
| standard_pillar         | `(esg_standard_id, esg_pillar_id)` unique                                                                                                     |
| standard_disclosure     | `(esg_standard_id, disclosure_code)` unique                                                                                                   |
| kpi                     | `(organization_id, kpi_code)` unique; `(organization_id, esg_pillar_id, is_active)`                                                           |
| kpi_standard_disclosure | `(kpi_id, standard_disclosure_id)` unique; `standard_disclosure_id`                                                                           |
| reporting_period        | `(organization_id, period_name)` unique; `(organization_id, period_status)`                                                                   |
| kpi_record              | `(kpi_id, reporting_period_id)` unique; `(organization_id, reporting_period_id, submission_status)`; `data_owner_user_id`; `approver_user_id` |
| evidence                | `(kpi_record_id, file_hash)` partial unique; `kpi_record_id`                                                                                  |
| approval                | `(kpi_record_id, reviewed_at)`                                                                                                                |
| audit_log               | `(organization_id, created_at -1)`; `(entity_name, record_id)`; `user_id`                                                                     |

## 5. Authentication and Authorization

### 5.1 Tokens

- **Access token** (JWT, 15 min): payload
  `{ sub: userId, org: organizationId, roles: ['Admin',…] }`. Sent as
  `Authorization: Bearer <token>`. Held in memory by the frontend.
- **Refresh token** (JWT, 7 days): httpOnly, `SameSite=Strict`, `Secure` in
  prod, path `/api/v1/auth`. Rotated on every refresh. Its hashed `jti` is
  stored in a `refresh_token` helper collection (`user_id`, `jti_hash`,
  `expires_at`, `revoked_at`) so logout and password reset can revoke it. Reuse
  of a revoked token revokes the whole family.

### 5.2 Middleware

1. `authenticate` — verifies the access token, loads the user (`is_active` and
   organisation active), sets `req.user = { id, organization_id, roles }`. Roles
   are re-read from `user_role` on login/refresh only; the token carries them.
2. `authorize(...roles)` — 403 `FORBIDDEN` unless the user has any listed role.
3. Resource-level checks live in services (e.g. "caller is this record's Data
   Owner").

### 5.3 Org scoping

Every service query includes `organization_id: req.user.organization_id` (or
joins to it). An ID from another organisation yields **404**, never 403, to
avoid leaking existence.

## 6. API Conventions

- Base URL: `/api/v1`. JSON only (except uploads, downloads, exports).
- Success:
  `{ "success": true, "data": …, "meta": { "page", "limit", "total", "total_pages" } }`
  (`meta` only on lists).
- Error:
  `{ "success": false, "error": { "code": "STRING", "message": "Human text", "details": [ { "field": "email", "message": "…" } ] } }`
- Pagination query: `page` (≥1, default 1), `limit` (1–100, default 20), `sort`
  (e.g. `-created_at`).
- Search query: `q` (case-insensitive contains on name/code).
- Dates: ISO 8601. IDs: 24-char hex strings.
- Numbers: decimals as JSON numbers.
- Idempotency: state-changing record actions are naturally idempotent via
  transition guards.

### 6.1 Error codes

| HTTP | Code                                                                                                                | When                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 400  | `VALIDATION_ERROR`                                                                                                  | Zod failure; `details[]` lists fields |
| 401  | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS`                                                           |                                       |
| 403  | `FORBIDDEN`, `ACCOUNT_DISABLED`, `SEGREGATION_OF_DUTIES`                                                            |                                       |
| 404  | `NOT_FOUND`                                                                                                         | Missing or other organisation         |
| 409  | `DUPLICATE`, `INVALID_TRANSITION`, `IN_USE`, `STALE_RECORD`, `RECORD_LOCKED`, `PERIOD_CLOSED`, `OPEN_RECORDS_EXIST` |                                       |
| 413  | `FILE_TOO_LARGE`                                                                                                    |                                       |
| 415  | `UNSUPPORTED_FILE_TYPE`                                                                                             |                                       |
| 422  | `EVIDENCE_REQUIRED`, `VALUE_REQUIRED`, `REMARK_REQUIRED`, `OWNER_EQUALS_APPROVER`, `REASON_REQUIRED`                | Business rule failures                |
| 429  | `TOO_MANY_ATTEMPTS`, `RATE_LIMITED`                                                                                 |                                       |
| 500  | `INTERNAL_ERROR`                                                                                                    | No stack trace in response            |

## 7. Endpoint Reference

Legend — **Roles:** A=Admin, DO=Data Owner, AP=Approver, V=Viewer, any=any
authenticated, pub=public.

### 7.1 Auth

| Method | Path                          | Roles  | Body / Params                                                                 | Result                                                                                 |
| ------ | ----------------------------- | ------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| POST   | `/auth/register-organization` | pub    | `organization_name`, `organization_code`, `display_name`, `email`, `password` | 201 `{ organization, user }` (transaction, §8.1)                                       |
| POST   | `/auth/login`                 | pub    | `email`, `password`                                                           | 200 `{ access_token, user }` + refresh cookie                                          |
| POST   | `/auth/refresh`               | cookie | —                                                                             | 200 `{ access_token }`, rotates cookie                                                 |
| POST   | `/auth/logout`                | any    | —                                                                             | 204, revokes refresh                                                                   |
| GET    | `/auth/me`                    | any    | —                                                                             | `{ id, email, display_name, organization, department, roles[], must_change_password }` |
| POST   | `/auth/change-password`       | any    | `current_password`, `new_password`                                            | 204, revokes other refresh tokens                                                      |
| POST   | `/auth/forgot-password`       | pub    | `email`                                                                       | Always 200                                                                             |
| POST   | `/auth/reset-password`        | pub    | `token`, `new_password`                                                       | 204                                                                                    |

Password policy: ≥ 10 chars, one upper, one lower, one digit.

### 7.2 Organisation

| Method | Path                     | Roles | Body                                          | Notes             |
| ------ | ------------------------ | ----- | --------------------------------------------- | ----------------- |
| GET    | `/organizations/current` | any   | —                                             |                   |
| PATCH  | `/organizations/current` | A     | `organization_name?`, `is_active` not allowed | Code is immutable |

### 7.3 Departments

| Method | Path               | Roles | Body / Query                                         |
| ------ | ------------------ | ----- | ---------------------------------------------------- |
| GET    | `/departments`     | any   | `q`, `is_active`, paging                             |
| POST   | `/departments`     | A     | `department_name`, `department_code`                 |
| GET    | `/departments/:id` | any   |                                                      |
| PATCH  | `/departments/:id` | A     | `department_name?`, `department_code?`, `is_active?` |

Deactivation is refused while active users belong to it unless
`reassign_to_department_id` is sent.

### 7.4 Users and Roles

| Method | Path                             | Roles                                                                                                   | Body / Query                                                                                                                  |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/users`                         | A, V (AP/DO: limited list `id, display_name, department` for assignment pickers when `?for=assignment`) | `q`, `department_id`, `role`, `is_active`, paging                                                                             |
| POST   | `/users`                         | A                                                                                                       | `email`, `display_name`, `department_id?`, `role_ids[]` (≥1). Generates temp password, `must_change_password=true`, emails it |
| GET    | `/users/:id`                     | A, V                                                                                                    | includes roles                                                                                                                |
| PATCH  | `/users/:id`                     | A                                                                                                       | `display_name?`, `department_id?`, `is_active?`                                                                               |
| POST   | `/users/:id/roles`               | A                                                                                                       | `role_id` → writes `user_role`                                                                                                |
| DELETE | `/users/:id/roles/:user_role_id` | A                                                                                                       | Sets `is_active=false`. Cannot remove the last active Admin of an organisation                                                |
| GET    | `/roles`                         | any                                                                                                     | seeded roles                                                                                                                  |

Deactivating a user: revoke refresh tokens; refuse if the user is the last
active Admin.

### 7.5 Pillars, Standards, Disclosures

| Method | Path                         | Roles | Body / Notes                                                                      |
| ------ | ---------------------------- | ----- | --------------------------------------------------------------------------------- |
| GET    | `/pillars`                   | any   |                                                                                   |
| PATCH  | `/pillars/:id`               | A     | `pillar_description?`, `is_active?`                                               |
| GET    | `/standards`                 | any   | `q`, `is_active`; includes pillar codes                                           |
| POST   | `/standards`                 | A     | `standard_code`, `standard_name`, `version_label`, `issuing_body?`                |
| PATCH  | `/standards/:id`             | A     | `standard_name?`, `version_label?`, `issuing_body?`, `is_active?`                 |
| PUT    | `/standards/:id/pillars`     | A     | `esg_pillar_ids[]` — replaces `standard_pillar` rows                              |
| GET    | `/standards/:id/disclosures` | any   | `q`, paging                                                                       |
| POST   | `/standards/:id/disclosures` | A     | `disclosure_code`, `disclosure_title`, `disclosure_description?`, `is_mandatory?` |
| PATCH  | `/disclosures/:id`           | A     | same fields (code immutable if mapped to a KPI)                                   |
| DELETE | `/disclosures/:id`           | A     | Blocked with `409 IN_USE` if any `kpi_standard_disclosure` references it          |

Standards and pillars are global reference data (shared by all organisations);
only platform admins edit them in MVP (users whose email is listed in
`PLATFORM_ADMIN_EMAILS`, checked in addition to the Admin role). Organisation
Admins create organisation-level KPIs.

### 7.6 KPIs

| Method | Path                    | Roles | Body / Query                                                                                                                      |
| ------ | ----------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/kpis`                 | any   | `q`, `esg_pillar_id`, `is_active`, `standard_disclosure_id`, paging                                                               |
| POST   | `/kpis`                 | A     | `esg_pillar_id`, `kpi_code`, `kpi_name`, `unit_of_measurement`, `calculation_method?`, `frequency?`, `standard_disclosure_ids[]?` |
| GET    | `/kpis/:id`             | any   | includes mapped disclosures                                                                                                       |
| PATCH  | `/kpis/:id`             | A     | all above except `kpi_code` after first record exists; `is_active`                                                                |
| PUT    | `/kpis/:id/disclosures` | A     | `standard_disclosure_ids[]` — replaces mapping                                                                                    |

Changing `unit_of_measurement` is refused once the KPI has any record.

### 7.7 Reporting Periods

| Method | Path                   | Roles | Body / Query                                                                                                         |
| ------ | ---------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| GET    | `/periods`             | any   | `period_status`, paging; includes record counts                                                                      |
| POST   | `/periods`             | A     | `period_name`, `period_start_date`, `period_end_date`                                                                |
| GET    | `/periods/:id`         | any   |                                                                                                                      |
| PATCH  | `/periods/:id`         | A     | `period_name?`, `period_end_date?` while `In Progress`                                                               |
| POST   | `/periods/:id/records` | A     | `{ assignments: [{ kpi_id, data_owner_user_id, approver_user_id }], copy_from_period_id? }` → creates records (§8.2) |
| POST   | `/periods/:id/close`   | A     | `{ force?: boolean, reason?: string }`                                                                               |

### 7.8 KPI Records

| Method | Path                      | Roles         | Body / Query                                                                                                                                                               |
| ------ | ------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/records`                | any (scoped)  | `reporting_period_id` (required), `submission_status`, `esg_pillar_id`, `department_id`, `data_owner_user_id`, `approver_user_id`, `scope=mine\|my_approvals`, `q`, paging |
| GET    | `/records/:id`            | any (scoped)  | Full record: kpi, disclosures, owner, approver, previous period value, evidence[], approvals[]                                                                             |
| PATCH  | `/records/:id`            | DO (owner)    | `{ actual_value?, target_value?, baseline_value?, updated_at }` (concurrency token)                                                                                        |
| PATCH  | `/records/:id/assignment` | A             | `{ data_owner_user_id?, approver_user_id? }`                                                                                                                               |
| POST   | `/records/:id/submit`     | DO (owner)    | —                                                                                                                                                                          |
| POST   | `/records/:id/approve`    | AP (assigned) | `{ comments? }`                                                                                                                                                            |
| POST   | `/records/:id/reject`     | AP (assigned) | `{ comments }` required ≥ 5 chars                                                                                                                                          |
| POST   | `/records/:id/reopen`     | A             | `{ reason }` required ≥ 5 chars                                                                                                                                            |
| GET    | `/records/:id/approvals`  | any (scoped)  | approval history                                                                                                                                                           |
| GET    | `/records/:id/history`    | any (scoped)  | `audit_log` rows for this record and its evidence                                                                                                                          |

Scoping on `GET /records` and `/records/:id`: Admin and Viewer see all
organisation records. Data Owner sees records where they are owner; Approver
sees records where they are approver. A user with several roles sees the union.

### 7.9 Evidence

| Method | Path                     | Roles        | Notes                                                                                                            |
| ------ | ------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| POST   | `/records/:id/evidence`  | DO (owner)   | `multipart/form-data`, field `file` (one file per request). Returns evidence row                                 |
| GET    | `/records/:id/evidence`  | any (scoped) | active rows                                                                                                      |
| GET    | `/evidence/:id/download` | any (scoped) | Streams file with `Content-Disposition`; `?inline=1` for preview of PDF/image. Authenticated; never a public URL |
| DELETE | `/evidence/:id`          | DO (owner)   | Soft remove (`is_active=false`) only while record editable                                                       |

Allowed MIME: `application/pdf`, `image/png`, `image/jpeg`, `text/csv`,
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
Detected by magic bytes (`file-type`), not only the header or extension. Max
`MAX_FILE_MB`. Stored under key
`org/{organization_id}/record/{record_id}/{uuid}`; original name kept only in
`file_name`.

### 7.10 Dashboard

| Method | Path         | Roles        | Query                                               | Result                                                                                                                                    |
| ------ | ------------ | ------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/dashboard` | any (scoped) | `reporting_period_id` (default: latest In Progress) | `{ period, totals: { total, by_status:{…}, completion_pct, overdue }, by_pillar:[{ pillar_code, total, by_status }], by_department:[…] }` |

### 7.11 Reports and Export

| Method | Path                     | Roles | Query                                                                   | Result                                                                          |
| ------ | ------------------------ | ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| GET    | `/reports/pillar-totals` | A, V  | `reporting_period_id`                                                   | rows per pillar: total, approved, completion %                                  |
| GET    | `/reports/content-index` | A, V  | `reporting_period_id`, `esg_standard_id`                                | rows per disclosure (see `workflow.md` §8.2), `gap: true` flag                  |
| GET    | `/reports/kpi-trend`     | A, V  | `kpi_id`                                                                | `[ { period_name, actual_value, target_value, baseline_value } ]` approved only |
| GET    | `/reports/export`        | A, V  | `reporting_period_id`, `format=csv\|xlsx\|pdf`, `include_all?` (A only) | File download; audit `EXPORT`                                                   |

### 7.12 Audit Log

| Method | Path          | Roles | Query                                                                                            |
| ------ | ------------- | ----- | ------------------------------------------------------------------------------------------------ |
| GET    | `/audit-logs` | A, V  | `user_id`, `entity_name`, `action_name`, `record_id`, `from`, `to`, paging (sorted newest first) |

### 7.13 Tools and Assistant

| Method | Path                    | Roles | Body                                                                                                        | Result                                                           |
| ------ | ----------------------- | ----- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| POST   | `/tools/emissions-calc` | any   | `{ scope: 1\|2\|3, activity_data: number>0, activity_unit: string, emission_factor_kg_per_unit: number≥0 }` | `{ emissions_kg, emissions_tco2e, formula }`                     |
| POST   | `/assistant/query` (P2) | A, V  | `{ question }`                                                                                              | Answer grounded in approved data; returns the record IDs it used |

### 7.14 Health

`GET /health` (public) → `{ status: "ok", db: "up" }`.

## 8. Core Services (logic that must not be skipped)

### 8.1 Register organisation (transaction)

```js
await withTransaction(async (session) => {
    const [org] = await Organization.create([{
        organization_name,
        organization_code,
    }], { session });
    const [user] = await AppUser.create(
        [{ organization_id: org._id, email, display_name, password_hash }],
        { session },
    );
    const adminRole = await Role.findOne({ role_name: "Admin" }).session(
        session,
    );
    await UserRole.create(
        [{
            user_id: user._id,
            role_id: adminRole._id,
            assigned_by_user_id: user._id,
        }],
        { session },
    );
    await audit.log({
        session,
        user_id: user._id,
        organization_id: org._id,
        entity_name: "organization",
        record_id: org._id,
        action_name: "CREATE",
        updated_value: org,
    });
});
```

### 8.2 Generate records for a period

1. Load period; must be `In Progress` and belong to the caller's organisation.
2. For each assignment: KPI active and in organisation; owner and approver
   active, same organisation, owner holds `Data Owner` (or `Admin`), approver
   holds `Approver` (or `Admin`); `owner ≠ approver` else
   `OWNER_EQUALS_APPROVER`.
3. Reject the whole request (409 `DUPLICATE`) if any KPI already has a record in
   this period.
4. If `copy_from_period_id`, fill missing owner/approver/baseline/target from
   that period's record for the same KPI.
5. In a transaction `insertMany` records (`submission_status: 'In Progress'`,
   `organization_id` set) and one audit row per record (`CREATE`).
6. After commit: send assignment emails grouped by user.

### 8.3 Record state machine (`kpiRecord.service.js`)

```js
const ALLOWED = {
    submit: { from: ["In Progress", "Rejected"], to: "Ready for Approval" },
    approve: { from: ["Ready for Approval"], to: "Approved" },
    reject: { from: ["Ready for Approval"], to: "Rejected" },
    reopen: { from: ["Approved"], to: "In Progress" },
};

async function transition(recordId, action, actor, payload) {
    return withTransaction(async (session) => {
        const rec = await KpiRecord.findOne({
            _id: recordId,
            organization_id: actor.organization_id,
        }).session(session);
        if (!rec) throw new ApiError(404, "NOT_FOUND");
        const period = await ReportingPeriod.findById(rec.reporting_period_id)
            .session(session);
        if (period.period_status === "Closed") {
            throw new ApiError(409, "PERIOD_CLOSED");
        }
        const rule = ALLOWED[action];
        if (!rule.from.includes(rec.submission_status)) {
            throw new ApiError(409, "INVALID_TRANSITION", {
                current: rec.submission_status,
            });
        }

        // action-specific guards
        switch (action) {
            case "submit":
                assertIsOwner(actor, rec); // 403
                if (rec.actual_value == null) {
                    throw new ApiError(422, "VALUE_REQUIRED");
                }
                if (
                    await Evidence.countDocuments({
                        kpi_record_id: rec._id,
                        is_active: true,
                    }).session(session) < 1
                ) {
                    throw new ApiError(422, "EVIDENCE_REQUIRED");
                }
                rec.submitted_at = new Date();
                break;
            case "approve":
            case "reject":
                assertIsApprover(actor, rec); // 403
                if (String(actor.id) === String(rec.data_owner_user_id)) {
                    throw new ApiError(403, "SEGREGATION_OF_DUTIES");
                }
                if (
                    action === "reject" &&
                    !(payload.comments || "").trim().match(/.{5,}/)
                ) {
                    throw new ApiError(422, "REMARK_REQUIRED");
                }
                await Approval.create([{
                    kpi_record_id: rec._id,
                    approver_user_id: actor.id,
                    approval_status: action === "approve"
                        ? "Approved"
                        : "Rejected",
                    comments: payload.comments,
                    reviewed_at: new Date(),
                }], { session });
                break;
            case "reopen":
                requireRole(actor, "Admin");
                if (!payload.reason || payload.reason.trim().length < 5) {
                    throw new ApiError(422, "REASON_REQUIRED");
                }
                rec.submitted_at = null;
                break;
        }
        const previous = rec.submission_status;
        rec.submission_status = rule.to;
        await rec.save({ session });
        await audit.log({
            session,
            user_id: actor.id,
            organization_id: actor.organization_id,
            entity_name: "kpi_record",
            record_id: rec._id,
            action_name: action.toUpperCase(),
            previous_value: { submission_status: previous },
            updated_value: {
                submission_status: rule.to,
                comments: payload.comments,
                reason: payload.reason,
            },
        });
        return rec;
    }).then((rec) => {
        notification.afterTransition(action, rec);
        return rec;
    }); // after commit
}
```

Authorisation notes: `assertIsOwner` passes when
`actor.id === rec.data_owner_user_id`; an Admin passes only if Admin is the
record's assigned owner. `assertIsApprover` likewise against `approver_user_id`.
Admin reassigns first if a different person must act.

### 8.4 Update values (`PATCH /records/:id`)

- Only while status is `In Progress` or `Rejected`, period `In Progress`, caller
  is owner.
- Body must include the `updated_at` the client last saw; mismatch →
  `STALE_RECORD`.
- Validation: numbers finite; max 6 decimals; no negatives; if KPI unit is `%`
  then 0–100.
- Audit `UPDATE` with previous and new of only changed fields.

### 8.5 Evidence upload

1. `multer` memory storage, limit `MAX_FILE_MB`.
2. Check record editable and caller is owner; active evidence count <
   `MAX_FILES_PER_RECORD`.
3. Detect MIME by magic bytes; reject others (415).
4. Compute SHA-256; if an active evidence with same hash exists on this record →
   409 `DUPLICATE`.
5. Sanitise `file_name`, store with storage driver, create `evidence`, audit
   `UPLOAD_EVIDENCE`.
6. On DB failure after storing, delete the stored object (compensate).

### 8.6 Close period

1. Admin, period `In Progress`.
2. Count records not `Approved`. If > 0 and not `force` → 409
   `OPEN_RECORDS_EXIST` with the list (`kpi_code`, `status`, owner).
3. If `force`, `reason` required.
4. Set `period_status='Closed'`, `closed_at`, `closed_by_user_id`; audit
   `CLOSE_PERIOD`; email summary after commit.

### 8.7 Dashboard aggregation (sketch)

```js
KpiRecord.aggregate([
    {
        $match: {
            organization_id: orgId,
            reporting_period_id: periodId,
            ...scopeFilter,
        },
    },
    {
        $lookup: {
            from: "kpi",
            localField: "kpi_id",
            foreignField: "_id",
            as: "kpi",
        },
    },
    { $unwind: "$kpi" },
    {
        $facet: {
            by_status: [{
                $group: { _id: "$submission_status", count: { $sum: 1 } },
            }],
            by_pillar: [{
                $group: {
                    _id: { p: "$kpi.esg_pillar_id", s: "$submission_status" },
                    count: { $sum: 1 },
                },
            }],
            total: [{ $count: "n" }],
        },
    },
]);
```

`completion_pct = approved / total × 100` (0 when total is 0). `overdue` =
records not Approved where `period_end_date < now`.

### 8.8 Content index query

Start from `standard_disclosure` of the chosen standard → left-join
`kpi_standard_disclosure` → `kpi` → `kpi_record` filtered by period and
`Approved`. A disclosure with no approved record returns `gap: true`; if
`is_mandatory`, `gap_severity: 'mandatory'`.

### 8.9 Emission calculator

```js
const kg = activity_data * emission_factor_kg_per_unit;
return {
    emissions_kg: kg,
    emissions_tco2e: kg / 1000,
    formula: "Emissions = Activity Data × Emission Factor",
};
```

Example: `10000 × 0.4 = 4000 kg = 4 tCO2e`. Stateless; nothing stored.

### 8.10 Reminder job (`REMINDER_CRON`)

Daily: for each organisation, periods `In Progress` where
`days = ceil((period_end_date − today)/day)` ∈ {7, 1}: group records by owner
(status `In Progress`/`Rejected`) and by approver (status `Ready for Approval`)
→ one email each. Runs as the system user.

### 8.11 Audit helper

`audit.log({ session, user_id, organization_id, entity_name, record_id, action_name, previous_value, updated_value })`:
JSON-stringifies, strips `password_hash`, truncates to 4000 characters, inserts
inside the caller's session.

## 9. Validation (Zod) — field rules

| Field                                            | Rule                              |
| ------------------------------------------------ | --------------------------------- |
| `email`                                          | valid email, ≤ 255, lowercased    |
| `password`, `new_password`                       | 10–128 chars, upper+lower+digit   |
| `organization_code`                              | `/^[A-Z0-9_-]{2,50}$/`            |
| `department_code`, `kpi_code`                    | 2–50, `/^[A-Za-z0-9._-]+$/`       |
| names                                            | trimmed, 1–max length from schema |
| `actual_value`, `target_value`, `baseline_value` | number, ≥ 0, ≤ 1e14, ≤ 6 decimals |
| `period_end_date`                                | ≥ `period_start_date`             |
| `comments`                                       | ≤ 2000; required ≥ 5 on reject    |
| `reason`                                         | 5–500                             |
| IDs                                              | 24-hex ObjectId                   |
| `limit`                                          | 1–100                             |

All input is also passed through `express-mongo-sanitize` and `hpp`.

## 10. Security Checklist

- HTTPS and HSTS (`helmet`); strict CORS to `CLIENT_URL` with credentials.
- Rate limits: `/auth/login` 5/15 min per IP+email; global 300/min per IP.
- Bcrypt cost 12; password hashes never returned (`select:false`).
- Refresh rotation + reuse detection.
- Generic error messages for auth; no user enumeration (forgot-password always
  200).
- Org scoping on every query; 404 for foreign IDs.
- Upload: size limit, magic-byte MIME check, random storage key, private
  storage, authenticated download, `X-Content-Type-Options: nosniff`.
- No raw Mongo operators from client (`mongo-sanitize`); no `$where`.
- Audit log immutable; sensitive values redacted.
- Secrets only via env; `.env` gitignored.
- Dependency audit in CI (`npm audit`).

## 11. Seed Data (`npm run seed`)

| Data                 | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roles                | Admin, Data Owner, Approver, Viewer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Pillars              | E Environmental, S Social, G Governance, GEN General                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Standard             | `GRI` — "GRI Standards", version label `GRI Standards 2021`, issuing body "Global Reporting Initiative"; linked to E, S, G, GEN                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Disclosures (sample) | `GRI 2-9` Governance structure and composition (mandatory); `GRI 205-2` Communication and training about anti-corruption policies; `GRI 302-1` Energy consumption within the organization (mandatory); `GRI 303-3` Water withdrawal; `GRI 305-1` Direct (Scope 1) GHG emissions; `GRI 305-2` Energy indirect (Scope 2) GHG emissions; `GRI 306-4` Waste diverted from disposal; `GRI 403-9` Work-related injuries; `GRI 404-1` Average hours of training per year per employee; `GRI 405-1` Diversity of governance bodies and employees; `GRI 414-1` New suppliers screened using social criteria; `GRI 418-1` Substantiated complaints concerning breaches of customer privacy |
| Other standards      | `IFRS-S1`, `IFRS-S2`, `SASB` (empty disclosure lists to be filled)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| System user          | `system@esg.local` (inactive login, used for jobs)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Demo org (dev only)  | `DEMO` with one user per role and sample KPIs ENV-01…GOV-02 (see `workflow.md` §4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Disclosure codes and titles must be checked against the current published GRI
text before production (GRI revises topic standards).

## 12. Testing Plan

| Level     | Tools                     | What                                                                                                               |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Unit      | Jest                      | Validators, emission calc, transition table, hashing                                                               |
| Service   | Jest + memory replica set | Transactions: register org, generate records, every transition (allowed and refused), close period, evidence rules |
| API       | Supertest                 | Every endpoint: success, 400, 401, 403, 404, 409; RBAC matrix; org isolation                                       |
| Security  | Supertest                 | Foreign-org IDs return 404; owner = approver refused; rate limit; bad MIME                                         |
| Scenarios | Jest                      | The 14 acceptance scenarios in `workflow.md` §12                                                                   |
| Coverage  | target                    | Services ≥ 90%, overall ≥ 80%                                                                                      |

## 13. Deployment

| Item          | Detail                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Containers    | `api` (Node 20 alpine), `mongo` (replica set `rs0`, init script), `mailhog` (dev)                                                |
| Production DB | MongoDB Atlas (replica set), IP allow-list, backups on                                                                           |
| Storage       | S3-compatible bucket, private, server-side encryption                                                                            |
| CI            | Lint → test → build image → `npm audit`                                                                                          |
| Process       | `node src/server.js` behind a reverse proxy (TLS), `NODE_ENV=production`, graceful shutdown on SIGTERM                           |
| Logs          | JSON to stdout; request ID per call; no PII beyond user ID                                                                       |
| Migrations    | Idempotent scripts in `src/seed` and `scripts/migrations`; index creation via `autoIndex` off in prod, `npm run indexes` instead |
| Backups       | Daily DB snapshot, evidence bucket versioning                                                                                    |
