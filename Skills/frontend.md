# ESG Management System — Frontend Specification

React single-page app. Consumes the REST API in `backend.md`; follows the rules
and states in `workflow.md`; delivers the features in `prd.md`.

---

## 1. Tech Stack

| Concern      | Choice                                                                         |
| ------------ | ------------------------------------------------------------------------------ |
| Build        | Vite 5 + React 18                                                              |
| Language     | JavaScript (JSX) — TypeScript optional; all shapes below are typed in comments |
| Routing      | React Router 6 (data router)                                                   |
| Server state | TanStack Query v5 (cache, refetch, mutations)                                  |
| Client state | Zustand (auth user, theme, sidebar) — no Redux                                 |
| Forms        | React Hook Form + Zod resolver (same rules as backend §9)                      |
| HTTP         | Axios instance with interceptors                                               |
| UI           | Tailwind CSS + headless primitives (Radix UI: Dialog, Dropdown, Tabs, Tooltip) |
| Icons        | lucide-react                                                                   |
| Charts       | Recharts                                                                       |
| Tables       | TanStack Table v8                                                              |
| Dates        | date-fns                                                                       |
| Toasts       | sonner                                                                         |
| File upload  | react-dropzone                                                                 |
| Tests        | Vitest + React Testing Library + MSW (mock API) + Playwright (E2E)             |
| Quality      | ESLint, Prettier, Husky                                                        |

## 2. Design System

Brand: Hoshō Digital red on white (from the ESG deck).

### 2.1 Tokens (Tailwind theme extension)

| Token       | Value                                | Use                                      |
| ----------- | ------------------------------------ | ---------------------------------------- |
| `brand-600` | `#DC1F26`                            | Primary buttons, active nav, page titles |
| `brand-700` | `#B3151B`                            | Hover                                    |
| `brand-900` | `#5A0A0E`                            | Dark panels, footer gradient end         |
| `brand-50`  | `#FDECEC`                            | Soft backgrounds, chips                  |
| `ink-900`   | `#1F1F1F`                            | Body text                                |
| `ink-500`   | `#6B6B6B`                            | Secondary text                           |
| `line`      | `#E5E5E5`                            | Borders                                  |
| `surface`   | `#FFFFFF`, `surface-muted` `#FAF7F7` | Cards, page                              |
| Font        | Inter / Arial fallback               | Headings 600–700, body 400               |
| Radius      | 12 px cards, 8 px inputs             |                                          |
| Shadow      | `0 1px 3px rgba(0,0,0,.08)`          | Cards                                    |

### 2.2 Status colours (always paired with an icon and text, never colour alone)

| Status             | Chip                         | Icon           |
| ------------------ | ---------------------------- | -------------- |
| In Progress        | Blue `#1D4ED8` on `#DBEAFE`  | `Clock`        |
| Ready for Approval | Amber `#B45309` on `#FEF3C7` | `Hourglass`    |
| Approved           | Green `#15803D` on `#DCFCE7` | `CheckCircle2` |
| Rejected           | Red `#B91C1C` on `#FEE2E2`   | `XCircle`      |
| Closed (period)    | Grey `#374151` on `#E5E7EB`  | `Lock`         |

Pillar badges: **E** green, **S** blue, **G** purple, **GEN** grey (letter +
text label).

### 2.3 Shared components (Module 1)

| Component                              | Props (main)                                                    | Notes                                                                        |
| -------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `AppShell`                             | —                                                               | Header + Sidebar + `<Outlet/>`                                               |
| `Sidebar`                              | role-driven items                                               | Collapsible; active item highlighted                                         |
| `Header`                               | —                                                               | Logo, period selector (global), user menu (profile, change password, logout) |
| `Button`                               | `variant: primary\|secondary\|danger\|ghost`, `loading`, `icon` | Disabled + spinner while loading                                             |
| `StatusChip`                           | `status`                                                        | Table above                                                                  |
| `PillarBadge`                          | `code`                                                          |                                                                              |
| `DataTable`                            | `columns, data, isLoading, pagination, onSort`                  | Sticky header, empty and error states                                        |
| `FilterBar`                            | filter definitions                                              | Syncs to URL query string                                                    |
| `FormField`                            | `label, error, hint, required`                                  | Accessible label + error `aria-describedby`                                  |
| `ConfirmDialog`                        | `title, message, confirmLabel, requireReason?`                  | Used for reject, reopen, close, deactivate                                   |
| `FileDropzone`                         | `accept, maxSizeMB, maxFiles, onUpload`                         | Shows progress, errors                                                       |
| `EmptyState`, `ErrorState`, `Skeleton` |                                                                 | Every data view has all three                                                |
| `RequireRole`                          | `roles, children`                                               | Hides or blocks by role                                                      |
| `Toast`                                | —                                                               | sonner wrapper                                                               |

## 3. Folder Structure

```
frontend/
├─ src/
│  ├─ main.jsx
│  ├─ App.jsx                    # providers: QueryClient, Router, Toaster
│  ├─ routes/index.jsx           # route tree + guards
│  ├─ api/
│  │  ├─ client.js               # axios + interceptors
│  │  ├─ auth.api.js, users.api.js, departments.api.js, standards.api.js,
│  │  │  kpis.api.js, periods.api.js, records.api.js, evidence.api.js,
│  │  │  dashboard.api.js, reports.api.js, audit.api.js, tools.api.js
│  ├─ hooks/                     # useAuth, useRoles, usePeriod, useRecord, …
│  ├─ store/                     # authStore.js, uiStore.js (zustand)
│  ├─ components/                # shared (see §2.3)
│  ├─ features/
│  │  ├─ auth/                   # LoginPage, RegisterOrgPage, ForgotPage, ResetPage
│  │  ├─ dashboard/
│  │  ├─ periods/
│  │  ├─ records/                # MyTasks, ApprovalQueue, RecordPage
│  │  ├─ masterdata/             # departments, users, standards, kpis
│  │  ├─ reports/
│  │  ├─ audit/
│  │  ├─ tools/                  # EmissionsCalculator
│  │  └─ profile/
│  ├─ lib/                       # formatters, constants, zod schemas
│  └─ styles/index.css
├─ tests/ (unit, e2e)
├─ .env.example                  # VITE_API_URL
└─ vite.config.js                # dev proxy /api → http://localhost:5000
```

## 4. Session, Auth and API Client

| Item                       | Behaviour                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Access token               | Kept in memory (Zustand, **not** localStorage)                                                                                                  |
| Refresh                    | httpOnly cookie. On app load: call `POST /auth/refresh` → then `GET /auth/me`. While this runs show a full-page splash                          |
| Axios request interceptor  | Adds `Authorization: Bearer`                                                                                                                    |
| Axios response interceptor | On `401 TOKEN_EXPIRED`: one shared refresh call (queue other requests), retry once. On refresh failure: clear store, go to `/login?next=<path>` |
| Error mapping              | `error.code` → friendly message map in `lib/errors.js`; unknown → generic with request ID                                                       |
| `VALIDATION_ERROR`         | `details[]` set as field errors via `setError`                                                                                                  |
| Withcredentials            | `true` on the client                                                                                                                            |

Store shape:
`{ user: { id, email, display_name, organization, department, roles[], must_change_password } | null, accessToken, status: 'loading'|'authed'|'anon' }`.

If `must_change_password` is true, every route redirects to `/change-password`
until done.

## 5. Routes and Access

| Path                                         | Page                                                                                     | Roles         | Module |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------- | ------ |
| `/login`                                     | Login                                                                                    | public        | 1      |
| `/register`                                  | Register organisation                                                                    | public        | 1      |
| `/forgot-password`, `/reset-password?token=` | Reset                                                                                    | public        | 1      |
| `/change-password`                           | Forced/voluntary change                                                                  | any           | 1      |
| `/`                                          | Redirect: Admin/Viewer → `/dashboard`; Data Owner → `/my-tasks`; Approver → `/approvals` | any           | 1      |
| `/dashboard`                                 | Dashboard                                                                                | any           | 3      |
| `/periods`                                   | Periods list                                                                             | any           | 3      |
| `/periods/new`                               | New period wizard                                                                        | A             | 3      |
| `/periods/:id`                               | Period detail (records, close)                                                           | any           | 3      |
| `/my-tasks`                                  | Data Owner tasks                                                                         | DO, A         | 3      |
| `/approvals`                                 | Approval queue                                                                           | AP, A         | 3      |
| `/records/:id`                               | KPI record (entry / review)                                                              | scoped        | 4      |
| `/master/departments`                        | Departments                                                                              | A (view: any) | 2      |
| `/master/users`                              | Users and roles                                                                          | A             | 2      |
| `/master/standards`                          | Standards + disclosures                                                                  | A (view: any) | 2      |
| `/master/kpis`                               | KPIs and mappings                                                                        | A (view: any) | 2      |
| `/reports`                                   | Pillar totals, trends                                                                    | A, V          | 5      |
| `/reports/content-index`                     | GRI content index                                                                        | A, V          | 5      |
| `/audit`                                     | Audit log                                                                                | A, V          | 5      |
| `/tools/emissions`                           | Emissions calculator                                                                     | any           | 5      |
| `/profile`                                   | My profile                                                                               | any           | 1      |
| `/assistant` (P2)                            | AI assistant panel                                                                       | A, V          | 5      |
| `*`                                          | Not found                                                                                | —             | 1      |

Guards: `ProtectedRoute` (needs auth) → `RoleRoute roles={[…]}` (shows "Access
denied" page with a link home). Sidebar items are derived from the same route
table, so hidden and blocked always match. The server still enforces everything.

### 5.1 Sidebar by role

| Item                                              | Admin | Data Owner                       | Approver                   | Viewer                     |
| ------------------------------------------------- | ----- | -------------------------------- | -------------------------- | -------------------------- |
| Dashboard                                         | ✔     | ✔                                | ✔                          | ✔                          |
| My Tasks                                          | ✔     | ✔                                |                            |                            |
| Approval Queue                                    | ✔     |                                  | ✔                          |                            |
| Periods                                           | ✔     | ✔                                | ✔                          | ✔                          |
| Master Data (Departments, Users, Standards, KPIs) | ✔     | view-only items: Standards, KPIs | view-only: Standards, KPIs | view-only: Standards, KPIs |
| Reports                                           | ✔     |                                  |                            | ✔                          |
| Audit Log                                         | ✔     |                                  |                            | ✔                          |
| Emissions Calculator                              | ✔     | ✔                                | ✔                          | ✔                          |

## 6. Screens (field-by-field)

### 6.1 Login (`/login`)

| Element       | Rules                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email         | required, email format                                                                                                                            |
| Password      | required, show/hide toggle                                                                                                                        |
| Submit        | calls `POST /auth/login`; loading state; on `INVALID_CREDENTIALS` show "Email or password is incorrect"; on `TOO_MANY_ATTEMPTS` show wait message |
| Links         | Forgot password, Register organisation                                                                                                            |
| After success | go to `next` query param or `/`                                                                                                                   |

### 6.2 Register organisation (`/register`)

Fields: Organisation name (≤200), Organisation code (auto-uppercased, pattern
`A-Z 0-9 _ -`, 2–50), Your name, Email, Password (strength meter: 10+, upper,
lower, digit), Confirm password (must match). Server errors `DUPLICATE` map to
the right field. Success → toast + `/login`.

### 6.3 Setup checklist (Admin dashboard banner)

Shown until all done: Add departments → Add users → Review standards → Add KPIs
→ Create first period. Each step links to its screen and shows ✔ when data
exists (derived from list counts).

### 6.4 Dashboard (`/dashboard`)

Global **period selector** in the header (default: latest In Progress;
remembered in `uiStore` and URL `?period=`).

| Block         | Content                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| KPI tiles     | Total KPIs, In Progress, Ready for Approval, Approved, Rejected, Overdue. Click a tile → filters the table below |
| Completion    | Donut or radial: Approved ÷ Total, with %                                                                        |
| By pillar     | Stacked bar per pillar (E, S, G, GEN) by status                                                                  |
| By department | Horizontal bar of completion % (Admin/Viewer only)                                                               |
| Records table | Columns: KPI code, KPI name, Pillar, Data Owner, Approver, Status, Date Started, Submitted At. Sort, paginate    |
| Filters       | Status, Pillar, Department, Data Owner, Approver, search `q`; synced to URL                                      |
| States        | Loading skeletons; "No period yet" empty state with CTA (Admin) or message (others); error with retry            |
| Data          | `GET /dashboard`, `GET /records`                                                                                 |

Scope: Data Owners and Approvers see their own records only (server-scoped);
tile labels say "My KPIs".

### 6.5 Periods list (`/periods`)

Table: Name, Start, End, Status chip, KPIs, Approved %. Row click → detail.
Admin: "New period" button.

### 6.6 New period wizard (`/periods/new`, Admin)

| Step             | UI                                                                                                                                                                                                                                                       | Validation                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Details       | Name, Start date, End date                                                                                                                                                                                                                               | Name required; end ≥ start                                                                                                                   |
| 2. Select KPIs   | Table of active KPIs with checkbox, pillar filter, "Select all in pillar"                                                                                                                                                                                | ≥ 1 KPI                                                                                                                                      |
| 3. Assign people | Table: KPI, Data Owner (searchable select, users with role Data Owner), Approver (select, role Approver). Toolbar: **Copy from previous period** (select period), **Bulk assign by department** (choose dept + owner + approver → apply to checked rows) | Each row needs both; owner ≠ approver (inline error `OWNER_EQUALS_APPROVER`)                                                                 |
| 4. Review        | Summary counts per owner and per pillar                                                                                                                                                                                                                  | —                                                                                                                                            |
| Submit           | `POST /periods` then `POST /periods/:id/records`                                                                                                                                                                                                         | If the second call fails, show error and keep the created period so the Admin can retry assignments from the period detail page ("Add KPIs") |
| Success          | Toast "N KPI records created, owners notified" → period detail                                                                                                                                                                                           |                                                                                                                                              |

Wizard keeps its state in memory; leaving with unsaved changes asks for
confirmation.

### 6.7 Period detail (`/periods/:id`)

Header: name, dates, status chip, progress bar. Tabs: **Records** (same table as
dashboard, filters) · **Summary** (by pillar) · **Activity** (audit rows for
this period). Admin actions: **Add KPIs**, **Reassign** (row menu), **Close
period** (ConfirmDialog; if `OPEN_RECORDS_EXIST` show list and a "Force close"
checkbox + required reason).

### 6.8 My Tasks (`/my-tasks`)

Cards or table of records where I am owner. Group tabs: **To do** (In Progress),
**Rejected** (red dot, shown first), **Waiting** (Ready for Approval), **Done**
(Approved). Each row: KPI, period, due date (period end), status, "Open" button.
Badge count in sidebar = To do + Rejected.

### 6.9 Approval Queue (`/approvals`)

Table of records where I am approver with status Ready for Approval: KPI,
Pillar, Owner, Value + unit, Submitted At (oldest first), evidence count. Row →
record page. Tabs: **Pending**, **Decided** (Approved/Rejected by me).

### 6.10 KPI Record page (`/records/:id`) — the main screen

Layout: header + two columns (left: data, right: evidence & history).

**Header:** KPI code + name, pillar badge, period name, status chip, Data Owner,
Approver, mapped disclosure chips (e.g. `GRI 302-1`).

**Info panel:** unit, calculation method, frequency, previous period value and %
change.

**Value form (left)**

| Field          | Control                       | Rules                                                                                                                 |
| -------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Actual value   | number input with unit suffix | Required to submit; ≥ 0; ≤ 6 decimals; `%` unit → 0–100                                                               |
| Target value   | number                        | optional, same rules                                                                                                  |
| Baseline value | number                        | optional, same rules                                                                                                  |
| Save draft     | button                        | `PATCH /records/:id` with `updated_at`; success toast; `STALE_RECORD` → dialog "Someone changed this record. Reload." |

Form is editable only if: status is In Progress or Rejected **and** I am the
owner **and** period is In Progress. Otherwise read-only with a lock icon and
reason ("Approved", "Closed period", "Waiting for approver").

**Evidence panel (right)**

- `FileDropzone` (PDF, PNG, JPG, CSV, XLSX, DOCX; ≤ 10 MB; max 10) — visible
  only when editable.
- List: icon, file name, size, uploaded by, date, **Preview** (PDF/image in
  dialog via `download?inline=1`), **Download**, **Remove** (editable only,
  confirm).
- Errors: `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`, `DUPLICATE` mapped to plain
  messages.

**Action bar (sticky bottom)**

| Viewer is… | Status                 | Buttons                                                                                                              |
| ---------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Owner      | In Progress / Rejected | **Save draft**, **Submit for approval** (disabled until value exists and ≥1 evidence; tooltip shows what is missing) |
| Owner      | Ready for Approval     | Info: "Waiting for {approver}"                                                                                       |
| Approver   | Ready for Approval     | **Approve** (optional comment dialog), **Reject** (dialog, remark required ≥ 5 chars, counter)                       |
| Admin      | Approved, period open  | **Reopen** (dialog, reason required)                                                                                 |
| Anyone     | Approved / Closed      | none                                                                                                                 |

**Rejection banner:** when status is Rejected, a red banner at top shows the
latest approver comment, approver name and time.

**Approver review aids:** side-by-side value vs evidence; warning chip "Changed
+X% vs previous period" when |change| > 50%.

**History (tabs):** _Approvals_ (from `/records/:id/approvals`: decision,
approver, comment, time) · _Activity_ (from `/records/:id/history`: who, what,
old → new, time).

### 6.11 Departments (`/master/departments`)

Table: Code, Name, Users, Status. Admin: Add/Edit in a side drawer (Name ≤150,
Code unique). Deactivate with ConfirmDialog (if users exist, require choosing
another department).

### 6.12 Users (`/master/users`, Admin)

Table: Name, Email, Department, Roles (chips), Status, Last login. Filters:
role, department, status, search. Drawer **Add user**: Name, Email, Department
(optional), Roles (multi-select, ≥1). Info text: "A temporary password will be
emailed." Row actions: Edit, Add/Remove role (shows who assigned and when),
Deactivate/Reactivate. Blocks: removing the last Admin shows the server message.

### 6.13 Standards (`/master/standards`)

Master–detail: left list of standards (code, name, version, issuer, status),
right tabs **Overview** (edit, linked pillars multi-select) and **Disclosures**
(table: code, title, mandatory flag, #KPIs mapped; add/edit drawer).
Non-platform-admins see read-only. Disclosure delete disabled with tooltip when
mapped (`IN_USE`).

### 6.14 KPIs (`/master/kpis`)

Table: Code, Name, Pillar, Unit, Frequency, Disclosures (chips), Status.
Filters: pillar, disclosure, status, search. Drawer **Add/Edit KPI**: Pillar
(select), Code, Name, Unit (select + custom), Frequency, Calculation method
(textarea ≤1000), Disclosures (multi-select grouped by standard). Code and unit
lock once the KPI has records (shows hint). Deactivate with confirm.

### 6.15 Reports (`/reports`)

Filters: Period. Blocks: **Pillar totals** (table + stacked bar), **KPI trend**
(choose KPI → line chart of actual vs target across periods with baseline line),
**Export** card (format CSV/XLSX/PDF, "Include non-approved" checkbox visible to
Admin only) → triggers download via blob.

### 6.16 GRI Content Index (`/reports/content-index`)

Period + Standard selectors. Table: Disclosure code, Title, KPI(s), Value +
unit, Owner, Approver, Evidence count, Status. **Gap** rows are highlighted
(mandatory gaps in red). Toolbar: "Show gaps only", export.

### 6.17 Audit Log (`/audit`)

Filters: user, entity, action, record ID, date range. Table: time, user, entity,
action chip, record, **View change** (expands previous vs updated JSON,
pretty-printed diff). Paginated, newest first.

### 6.18 Emissions calculator (`/tools/emissions`)

Left: three explainer cards (Scope 1 direct, Scope 2 purchased energy, Scope 3
value chain). Right: form — Scope (select), Activity data (>0), Activity unit
(text), Emission factor kg CO₂e per unit (≥0) with note "Illustrative; use your
country's published factor". Output: kg and tCO₂e, formula line, **Copy value**.
Worked example button fills 10,000 kWh × 0.4 = 4 tCO₂e. Calls
`POST /tools/emissions-calc`.

### 6.19 Profile and Change password

Read-only name, email, department, roles. Change password form: current, new
(policy), confirm.

### 6.20 AI Assistant (Phase 2)

Right-side drawer chat; sends `POST /assistant/query`; shows answer plus linked
records used; disclaimer "Answers use only your approved data."

## 7. Data Fetching Rules

| Query key                                                                     | Endpoint       | Stale time | Invalidated by              |
| ----------------------------------------------------------------------------- | -------------- | ---------- | --------------------------- |
| `['me']`                                                                      | `/auth/me`     | session    | login, role change          |
| `['periods']`                                                                 | `/periods`     | 60 s       | create/close                |
| `['dashboard', periodId]`                                                     | `/dashboard`   | 30 s       | any record mutation         |
| `['records', filters]`                                                        | `/records`     | 30 s       | record mutations            |
| `['record', id]`                                                              | `/records/:id` | 0          | patch, evidence, transition |
| `['kpis', filters]`, `['standards']`, `['departments']`, `['users', filters]` | master data    | 5 min      | respective mutations        |
| `['audit', filters]`                                                          | `/audit-logs`  | 0          | —                           |

Mutations use `onSuccess` → invalidate related keys; transitions never use
optimistic updates (the server decides).

## 8. Validation (mirrors backend)

Shared Zod schemas in `lib/schemas.js`: email, password policy, codes, decimals
(≤ 6 places, ≥ 0), reason/remark (≥ 5), dates (end ≥ start). Frontend validation
is for speed; the server is the authority and its `details[]` always wins.

## 9. UX States Checklist (every screen)

- Loading: skeleton, not spinner-only.
- Empty: explanation + next action.
- Error: message, request ID, Retry.
- Forbidden: "You do not have access" with link home.
- Long operations (upload, export): progress or disabled button with spinner.
- Destructive actions: ConfirmDialog.
- Unsaved changes: prompt on leave (record form, wizard).
- Toasts: success short, errors persistent until closed.

## 10. Accessibility and Responsiveness

- Semantic landmarks, one `h1` per page, focus moves to the page title on route
  change.
- All controls keyboard operable; visible focus ring (`brand-600`).
- Contrast AA; status never colour-only.
- Dialogs trap focus and restore it.
- Tables scroll horizontally on small screens; on < 768 px lists render as
  cards; sidebar becomes a drawer.
- Form errors announced via `aria-live="polite"`.

## 11. Performance

- Route-level code splitting (`React.lazy`) for reports, audit, standards.
- Server pagination only; no client-side filtering of big lists.
- Debounce search 300 ms.
- Charts lazy-loaded.
- Evidence preview loaded on demand.

## 12. Frontend Testing

| Level             | What                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | Formatters, Zod schemas, `StatusChip`, role helpers                                                                                                           |
| Component         | Record action bar for each (role × status) combination from §6.10; wizard validation; FileDropzone limits                                                     |
| Integration (MSW) | Login/refresh flow, forbidden routes, submit disabled without evidence, reject requires remark                                                                |
| E2E (Playwright)  | Register → create KPI → open period → owner submits with file → approver rejects → owner fixes → approver approves → admin closes → content index shows value |

## 13. Environment

`VITE_API_URL=/api/v1` (dev proxy to `http://localhost:5000`). Build output
served by Nginx or the same Express app (`express.static`) with SPA fallback to
`index.html`.
