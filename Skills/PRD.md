# ESG Management System — Product Requirements Document (PRD)

|                    |                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Product**        | ESG Management System (ESG Data Collection, Approval and Reporting Platform)                                            |
| **Stack**          | MERN — MongoDB, Express.js, React, Node.js                                                                              |
| **Version**        | 1.0 (MVP)                                                                                                               |
| **Companion docs** | `workflow.md` (processes), `frontend.md` (UI), `backend.md` (API, DB, security)                                         |
| **Sources**        | ESG ERD, iESG Internship Guide, ESG Research & Solution Doc, "Why Companies Need ESG", Hoshō Digital ESG Reporting deck |

---

## 1. Purpose

Organisations collect ESG data in spreadsheets and emails. Evidence is hard to
find, approvals are hard to prove, and reports cannot be defended in front of
auditors, investors, regulators or large buyers.

This product is **one system** where an organisation:

1. Defines its ESG framework (pillars, standards, disclosures, KPIs).
2. Opens a reporting period (cycle).
3. Assigns every KPI a **Data Owner** and an **Approver**.
4. Collects values with **evidence**.
5. Reviews and approves (or rejects with a remark).
6. Tracks progress on a dashboard.
7. Exports approved data for the ESG report (GRI content index).

Everything is recorded in an **audit trail**.

> One-line summary: **Collect data → Verify → Approve → Measure → Report.**

## 2. Problem Statement

| Problem                                                                        | Consequence                                   |
| ------------------------------------------------------------------------------ | --------------------------------------------- |
| ESG data lives in many files and departments (HR, Finance, Operations, Safety) | Reports are slow and incomplete               |
| No link between a number and its proof (bill, meter reading, HR report)        | Numbers cannot be verified; greenwashing risk |
| No clear owner or approver per number                                          | Nobody is accountable                         |
| No history of who changed what                                                 | Fails assurance/audit                         |
| No view of progress during the cycle                                           | Deadlines missed, gaps found too late         |

## 3. Goals and Non-Goals

### 3.1 Goals (MVP)

- G1. Single source of truth for ESG master data and KPI values.
- G2. Every reported value has an **owner**, **evidence**, an **approver
  decision** and an **audit trail**.
- G3. Role-based access: Admin, Data Owner, Approver, Viewer.
- G4. Live dashboard by status and pillar for the selected period.
- G5. Export of approved data and a GRI content index.
- G6. Multi-organisation capable (every record scoped by `organization_id`).

### 3.2 Non-Goals (MVP)

- Writing the narrative ESG report (we export data and indexes only).
- Materiality survey tool (materiality outcome is captured as the KPI/disclosure
  selection; the survey itself is out of scope).
- Auto-extracting values from documents (AI Builder equivalent) — Phase 2.
- ESG ratings, benchmarking, or carbon-credit features.
- Native mobile apps (the web app is responsive).

## 4. Users and Roles

| Role (`role.role_name`) | Who                                                 | Main jobs                                                                                                              |
| ----------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Admin**               | Sustainability lead / system owner                  | Manage users, departments, master data, open/close periods, assign owners and approvers, reopen records, see audit log |
| **Data Owner**          | Facilities, HR, Finance, Procurement, Safety staff  | Enter value + upload evidence for assigned KPIs, submit for approval, fix rejected values                              |
| **Approver**            | Sustainability lead, compliance, department manager | Review value + evidence, approve or reject with remark                                                                 |
| **Viewer**              | Management, auditors, execs                         | Read-only dashboards, reports, records                                                                                 |

A user may hold several roles (via `user_role`). Effective permissions are the
union of active roles, with the segregation rule in §7.

## 5. Glossary

| Term                     | Meaning                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| Pillar                   | E (Environmental), S (Social), G (Governance); optional General (GEN)   |
| Standard / framework     | Rulebook such as GRI, IFRS S1/S2, SASB                                  |
| Disclosure               | One required item in a standard, e.g. `GRI 302-1`                       |
| KPI                      | The number measured every period, e.g. total electricity consumed (kWh) |
| Material topic           | Topic important enough to report in depth                               |
| Reporting period / cycle | Time being reported (e.g. FY2026 Q1)                                    |
| KPI record               | The value of one KPI in one reporting period                            |
| Evidence                 | Proof file behind a value                                               |
| Baseline / target        | Starting-year value / desired future value                              |
| tCO2e                    | Tonnes of CO2-equivalent                                                |
| Assurance                | Independent check of reported data                                      |

## 6. Feature List

Priority: **P0** = MVP must-have, **P1** = MVP should-have, **P2** = Phase 2.
Module numbers match the internship build plan.

### Module 1 — App Shell and Access

| ID    | Feature                        | Pri | Acceptance criteria                                                                                                                                       |
| ----- | ------------------------------ | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-101 | Organisation onboarding        | P0  | Visitor registers an organisation (name, unique code) and first Admin (name, email, password). Organisation and Admin are created together or not at all  |
| F-102 | Login / logout / token refresh | P0  | Email + password login. Wrong credentials → generic error. Access token 15 min, refresh token 7 days in httpOnly cookie. Logout invalidates refresh token |
| F-103 | Password reset                 | P1  | Reset link by email, valid 30 min, single use                                                                                                             |
| F-104 | Role detection and navigation  | P0  | After login the sidebar shows only the screens allowed for the user's roles. Direct URL access to a forbidden screen shows "Access denied"                |
| F-105 | Theme and shared components    | P0  | Hoshō red theme, shared header, sidebar, buttons, tables, status chips, dialogs, toasts                                                                   |
| F-106 | Profile                        | P1  | User sees own name, email, department, roles; can change password                                                                                         |

### Module 2 — Master Data and Settings

| ID    | Feature               | Pri | Acceptance criteria                                                                                                                                                                                                                                                                                 |
| ----- | --------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-201 | Department management | P0  | Admin creates/edits/deactivates departments. `department_code` unique per organisation                                                                                                                                                                                                              |
| F-202 | User management       | P0  | Admin creates users (email unique), assigns department and roles, deactivates/reactivates. Deactivated users cannot log in; history stays                                                                                                                                                           |
| F-203 | Role assignment       | P0  | Admin assigns/revokes roles. Each assignment stores `assigned_by_user_id` and `assigned_at`. Revoke = `is_active=false` (never delete)                                                                                                                                                              |
| F-204 | ESG pillars           | P0  | Seeded E, S, G (+GEN). Admin may edit description or deactivate; codes immutable                                                                                                                                                                                                                    |
| F-205 | ESG standards         | P0  | Platform admin manages standards (code, name, version label, issuing body) and links each to pillars. Standards, pillars and disclosures are global reference data shared by all organisations (the ERD has no `organization_id` on them); organisation Admins can view them and build KPIs on them |
| F-206 | Standard disclosures  | P0  | Platform admin manages disclosures per standard (code, title, description, mandatory flag). Code unique per standard                                                                                                                                                                                |
| F-207 | KPI management        | P0  | Admin creates KPIs: code (unique per organisation), name, pillar, unit, calculation method. Maps a KPI to one or more disclosures. Deactivate instead of delete                                                                                                                                     |
| F-208 | Seed content          | P1  | One command loads roles, pillars, GRI standard, sample disclosures and sample KPIs                                                                                                                                                                                                                  |

### Module 3 — Dashboard and Cycles

| ID    | Feature                               | Pri | Acceptance criteria                                                                                                                                                                                               |
| ----- | ------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-301 | Create reporting period               | P0  | Name, start date, end date (end ≥ start; no overlap with another non-closed period of the same name). Status starts `In Progress`                                                                                 |
| F-302 | Open the cycle (generate KPI records) | P0  | Admin picks KPIs and assigns a Data Owner and Approver per KPI (bulk assign by department; or copy from a previous period). System creates one KPI record per KPI with status `In Progress` and notifies owners   |
| F-303 | Dashboard                             | P0  | For the selected period: total KPIs, count by status (In Progress / Ready for Approval / Approved / Rejected), completion %, by-pillar progress, table of records with Data Owner, Approver, Status, Date Started |
| F-304 | Dashboard filters                     | P0  | Filter by status, pillar, department, data owner, approver; search by KPI code/name                                                                                                                               |
| F-305 | Close period                          | P0  | Closes the period and locks all records. Blocked while any record is not Approved unless Admin forces with a reason                                                                                               |
| F-306 | My Tasks                              | P0  | Data Owner sees assigned records; Approver sees records awaiting approval                                                                                                                                         |

### Module 4 — KPI Entry and Approval

| ID    | Feature                | Pri | Acceptance criteria                                                                                                                                                                                                                    |
| ----- | ---------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-401 | KPI entry              | P0  | Data Owner enters actual value, target value, baseline value. Decimal up to 6 places. Percent KPIs limited to 0–100                                                                                                                    |
| F-402 | Evidence upload        | P0  | Upload PDF, image, XLSX, CSV, DOCX up to 10 MB, max 10 per record. Server stores file, computes SHA-256 hash, rejects exact duplicates on the same record. Evidence can be viewed, downloaded, removed (soft) while record is editable |
| F-403 | Submit for approval    | P0  | Allowed only if actual value exists and ≥1 active evidence. Status → `Ready for Approval`. Approver notified                                                                                                                           |
| F-404 | Approve                | P0  | Approver approves. Status → `Approved`, record locked. Approval row written with decision and time                                                                                                                                     |
| F-405 | Reject with remark     | P0  | Remark mandatory (min 5 chars). Status → `Rejected`. Owner notified with remark                                                                                                                                                        |
| F-406 | Resubmit               | P0  | Owner fixes value/evidence and submits again. Full approval history stays visible                                                                                                                                                      |
| F-407 | Reopen approved record | P1  | Admin only, reason mandatory. Status → `In Progress`; audit logged                                                                                                                                                                     |
| F-408 | Email notifications    | P1  | Events: assignment, submitted, approved, rejected, reminder 7 and 1 days before `period_end_date` for unfinished records                                                                                                               |
| F-409 | Value change history   | P0  | Record screen shows audit timeline (who, what, old → new, when)                                                                                                                                                                        |

### Module 5 — Reports and Assistant

| ID    | Feature                     | Pri | Acceptance criteria                                                                                                                      |
| ----- | --------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| F-501 | Totals by pillar and period | P0  | Table + chart: KPI counts and completion per pillar; per-period comparison for one KPI                                                   |
| F-502 | GRI content index           | P0  | For a period: each disclosure with its mapped KPIs, approved value, unit, and status. Disclosures with no approved KPI are flagged "Gap" |
| F-503 | Export                      | P0  | CSV and XLSX of approved records for a period; PDF summary (P1). Only `Approved` records are exported by default                         |
| F-504 | Emissions calculator        | P1  | Activity data × emission factor → kg and tCO2e. Stateless helper next to a Scope 1/2/3 explainer                                         |
| F-505 | Audit log viewer            | P0  | Admin/Viewer filters by user, entity, action, date range                                                                                 |
| F-506 | AI assistant                | P2  | Natural-language questions answered from the organisation's own approved data only                                                       |

## 7. Business Rules (non-negotiable)

| #     | Rule                                                                                                                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-1  | A value reaches a report **only** if its status is `Approved`.                                                                                                                            |
| BR-2  | A record cannot be submitted without an actual value and at least one active evidence file.                                                                                               |
| BR-3  | A reject **requires** a remark.                                                                                                                                                           |
| BR-4  | **Segregation of duties:** the Approver of a record can never be the same user as its Data Owner, and nobody can approve a record they own. Enforced at assignment and again at approval. |
| BR-5  | Approved records are read-only. Only an Admin reopen (with reason) changes this.                                                                                                          |
| BR-6  | Closed periods are read-only.                                                                                                                                                             |
| BR-7  | One KPI record per KPI per reporting period (unique).                                                                                                                                     |
| BR-8  | Nothing is hard-deleted: users, departments, KPIs, standards, evidence, roles use `is_active=false`.                                                                                      |
| BR-9  | Every create/update/status change/evidence action/login is written to `audit_log` with previous and new value. Audit entries are append-only.                                             |
| BR-10 | Every query is scoped by the caller's `organization_id`; cross-organisation access is impossible.                                                                                         |
| BR-11 | A disclosure marked `is_mandatory` with no approved KPI is shown as a gap in the content index.                                                                                           |
| BR-12 | Users, KPIs, evidence and approvals must all belong to the same organisation as the record.                                                                                               |

## 8. Status Model (summary — details in `workflow.md`)

```
In Progress ──submit──► Ready for Approval ──approve──► Approved
     ▲                        │                            │
     │                     reject                       reopen (Admin)
     │                        ▼                            │
     └────────── fix ──── Rejected                         │
     ▲──────────────────────────────────────────────────────┘
```

Reporting period status: `In Progress` → `Closed`.

## 9. Data Model Summary

16 collections (from the ERD). Full field-level schema is in `backend.md`.

| Group                   | Collections                                                            |
| ----------------------- | ---------------------------------------------------------------------- |
| Organisation and people | `organization`, `department`, `app_user`, `role`, `user_role`          |
| ESG framework           | `esg_pillar`, `esg_standard`, `standard_pillar`, `standard_disclosure` |
| KPIs                    | `kpi`, `kpi_standard_disclosure`                                       |
| Cycle and data          | `reporting_period`, `kpi_record`, `evidence`, `approval`               |
| Control                 | `audit_log`                                                            |

Relationships (from ERD): organisation 1—N
department/app_user/kpi/reporting_period; department 1—N app_user; app_user 1—N
user_role (assigns), role 1—N user_role; esg_standard N—M esg_pillar via
standard_pillar; esg_standard 1—N standard_disclosure; kpi N—M
standard_disclosure via kpi_standard_disclosure; kpi 1—N kpi_record;
reporting_period 1—N kpi_record; app_user 1—N kpi_record (owns); kpi_record 1—N
evidence (uploads) and 1—N approval (reviews); app_user 1—N audit_log
(performs).

### 9.1 Deliberate deviations from the ERD

The ERD is the source of truth. These additions are needed to make a working
MERN system and need team sign-off:

| #   | Change                                                                                    | Why                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | `app_user.password_hash`, `last_login_at`                                                 | ERD has no credentials. The original used Microsoft sign-in; MERN needs its own auth (SSO can be added later)                                                                     |
| D-2 | `kpi_record.approver_user_id` (FK, NOT NULL)                                              | The cycle design says "assign a Data Owner **and** an Approver per KPI". The ERD only records the approver at decision time in `approval`, so it cannot hold a pending assignment |
| D-3 | `kpi.frequency` (Monthly / Quarterly / Annual)                                            | The internship KPI anatomy includes frequency                                                                                                                                     |
| D-4 | `evidence.file_hash` unique **per KPI record** (compound), not globally                   | A globally unique hash would stop two organisations uploading the same public document                                                                                            |
| D-5 | INT keys → MongoDB `ObjectId` (`_id`); FK fields keep ERD names (`organization_id`, etc.) | MongoDB native keys                                                                                                                                                               |
| D-6 | `reporting_period.period_status` values fixed to `In Progress`, `Closed`                  | ERD only gives the default                                                                                                                                                        |

## 10. Non-Functional Requirements

| Area            | Requirement                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security        | HTTPS only; bcrypt (cost 12) passwords; JWT access + refresh; RBAC on every route; input validation; rate limiting on auth; file type and size checks; org scoping on every query |
| Performance     | List endpoints paginated (default 20, max 100); dashboard under 1.5 s for 5,000 records; indexes in `backend.md`                                                                  |
| Reliability     | Status transitions and audit writes occur in one MongoDB transaction (replica set required)                                                                                       |
| Auditability    | Complete, append-only audit trail; evidence hashes stored                                                                                                                         |
| Usability       | Responsive (≥360 px); keyboard accessible; WCAG AA contrast; clear empty/error/loading states                                                                                     |
| Data quality    | GRI principles built in: accuracy (validation), verifiability (evidence), completeness (gap flags), comparability (period comparison), timeliness (reminders)                     |
| Maintainability | ESLint + Prettier, layered backend (route → controller → service → model), tests per `backend.md`                                                                                 |
| Compliance note | Regulation references (ISSB, BRSR, CSRD) are informational; the product does not give legal advice                                                                                |

## 11. Success Metrics

| Metric                                    | Target                               |
| ----------------------------------------- | ------------------------------------ |
| Records with evidence at submission       | 100% (enforced)                      |
| Records approved before period close      | ≥ 95%                                |
| Median time Ready for Approval → decision | ≤ 3 working days                     |
| Rejection rate after first submission     | tracked; trend down cycle on cycle   |
| Disclosure gaps at close                  | trend to 0 for mandatory disclosures |

## 12. Assumptions and Risks

| Assumption / Risk                              | Mitigation                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| Teams will upload real evidence                | Hard rule BR-2                                                      |
| Standards change (GRI revises topic standards) | `version_label` on `esg_standard`; never overwrite, add new version |
| MongoDB transactions need replica set          | Docker compose ships single-node replica set; Atlas in production   |
| Evidence files may be sensitive                | Private storage, signed/authenticated download only                 |
| Emission factors vary by country/year          | MVP calculator takes factor as input; factor library is Phase 2     |
| Reg rules vary                                 | Show mapping only; advise users to check the regulator              |

## 12.1 Phase 2 Backlog

- AI document reader to pre-fill value from uploaded bill/invoice.
- AI assistant (F-506) with strictly read-only, org-scoped data access.
- Emission factor library and automatic Scope 1/2/3 calculation.
- Microsoft Entra / Google SSO.
- In-app notification centre and Slack/Teams webhooks.
- Materiality assessment workflow (survey, scoring, matrix).
- Assurance workspace for external auditors (read-only, time-boxed).
- Multi-framework crosswalk (GRI ↔ ISSB ↔ BRSR).

## 13. Delivery Plan

| Stage | Scope                                                      | Done when                                                |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------- |
| 1     | Module 1 + Module 2 (shell, auth, master data)             | Admin can log in, create users, KPIs, mappings           |
| 2     | Module 3 (periods, assignment, dashboard)                  | A period can be opened and tracked                       |
| 3     | Module 4 (entry, evidence, approval, notifications)        | A record travels In Progress → Approved with audit trail |
| 4     | Module 5 (reports, export, audit viewer)                   | Content index and exports match approved data            |
| 5     | Hardening: test as every role, security review, seed, demo | All P0 acceptance criteria pass                          |

Module acceptance = every row's acceptance criteria in §6 verified as each role.

## 14. Out-of-Scope Reminder

This product measures and reports. It does not decide which topics are material,
certify data, or replace an external assurance provider.
