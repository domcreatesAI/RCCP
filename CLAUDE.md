# RCCP One — Project Context for AI Assistants

> This file is auto-loaded by Claude Code on any machine.
> It is also useful context for Windsurf, Cursor, Copilot, or any AI assistant.
> **Always read `docs/PROJECT_STATUS.md` first** — it has the current deployment state and open questions.

---

## What This Project Is

Internal manufacturing planning app — **Rough Cut Capacity Planning (RCCP)**.
- Ingests Excel files exported from SAP
- Validates and stores planning data
- Supports capacity planning decisions over a 12–18 month horizon
- Runs on a Windows VM on a company network (not a public SaaS app)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Database | SQL Server 17 (`localhost\SQLEXPRESS`, database `RCCP_One`) |
| Backend | Python + FastAPI |
| Frontend | React (TypeScript) |
| File storage | Local filesystem — `uploads/` relative to backend root |
| DB Migrations | Python Alembic (future) |

---

## Project Structure

```
RCCP-One/
├── CLAUDE.md                  ← you are here
├── backend/                   ← Python FastAPI (not yet implemented)
├── frontend/                  ← React TypeScript (not yet implemented)
├── db/
│   ├── schema/                ← 9 SQL schema scripts (00–08)
│   ├── seeds/                 ← 2 seed scripts (app settings + masterdata)
│   └── README.md
└── docs/
    └── PROJECT_STATUS.md      ← current deployment state, open questions, next steps
```

---

## Phase Plan

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Database + Planning Data screen + Upload + Validate + Publish + Baseline | **IN PROGRESS** |
| Phase 2 | RCCP engine, line risk logic, labour/warehouse-constrained capacity calculations | Not started |
| Phase 3 | Scenario modelling, OEE simulation, cost of additional capacity | Not started |
| Phase 4 | Executive summary, 12-month staff forecast charts, approval workflow | Not started |
| Phase 5 | Config & masterdata UI, auth/users/roles | Not started |

**Only build Phase 1. Do not start Phase 2 until explicitly approved.**

---

## Core Workflow (Phase 1)

1. Upload 5 required + 1 optional Excel files (SAP exports) per planning cycle
2. Run 7-stage validation pipeline per file
3. Publish batch (only when no BLOCKED issues)
4. Create named, immutable baseline from published batch

---

## Planning Data Files (SAP batch uploads)

| File Type | Required? | Notes |
|-----------|-----------|-------|
| `master_stock` | Yes | Renamed from `inventory_snapshots` |
| `demand_plan` | Yes | Monthly per warehouse; weekly derived at query time |
| `line_capacity_calendar` | Yes | |
| `staffing_plan` | Yes | |
| `portfolio_changes` | Yes | Required but may have 0 data rows (valid) |
| `oee_daily` | Optional | Missing = WARNING, not BLOCKED |

## Masterdata Excel Uploads (separate from batch workflow, full replace)

| File | Updates |
|------|---------|
| `line_pack_capabilities.xlsx` | `line_pack_capabilities` table |
| `resource_requirements.xlsx` (2 tabs) | `line_resource_requirements` + `plant_resource_requirements` |
| `warehouse_master.xlsx` | `warehouse_capacity` table |
| `sku_status.xlsx` | `items.sku_status` column |

---

## Key Design Rules

- `net_theoretical_hours` — **computed in a view**, never stored
- `litres_per_minute` — **computed in a view** (`pack_size_l × bottles_per_minute`), never stored
- `sales_allocated_ea` — **computed in a view** (`total_stock_ea - free_stock_ea`), never stored
- Weekly demand — **derived at query time** (`demand_quantity / CEILING(days_in_month / 7.0)`); stored as monthly
- Files stored on **filesystem** (not as BLOBs) — paths stored in DB
- Re-uploads are **versioned** — previous versions kept, `is_current_version` toggled
- Only **one PUBLISHED batch** at a time — enforced at application layer
- Only **one active baseline** at a time — enforced at application layer
- `plan_cycle_date` must be 1st of the month — enforced by DB CHECK constraint
- No inline row editing in Phase 1 — corrections = fix source file + re-upload
- **Do not silently make major design decisions** — explain changes before implementing

---

## Capacity Model

**Physical ceiling:**
- `labour_pools.max_concurrent_lines` — max lines that can run simultaneously (space/equipment limit, not headcount)

**Headcount constraints (Phase 2):**
- `line_resource_requirements` — people needed per line (Line Operators, Team Leaders)
- `plant_resource_requirements` — shared people per plant (Forklift Drivers, Robot Operators, Material Handlers)
- `staffing_plan` — actual planned headcount from SAP; compared against requirements to flag shortfalls

**Warehouse space constraint (Phase 2):**
- `warehouse_capacity` — max pallet positions per pack type per warehouse
- `items.units_per_pallet` — converts stock EA to pallets for the check

**Cost of additional capacity (Phase 3):**
- `resource_types.standard_hourly_rate` × `app_settings.overtime_rate_multiplier` or `additional_shift_rate_multiplier`

**OEE simulation (Phase 3):**
- `lines.oee_target` — default 0.55 (55%); Phase 3 scenarios override this per line

---

## Validation Pipeline (7 Stages)

| Stage | Name |
|-------|------|
| 1 | REQUIRED_FILE_CHECK |
| 2 | TEMPLATE_STRUCTURE_CHECK |
| 3 | FIELD_MAPPING_CHECK |
| 4 | DATA_TYPE_CHECK |
| 5 | REFERENCE_CHECK |
| 6 | BUSINESS_RULE_CHECK |
| 7 | BATCH_READINESS |

Severities: `PASS`, `WARNING`, `BLOCKED`, `INFO`
Publish is blocked if any file has severity = `BLOCKED`.

---

## Database Schema Reference

**Masterdata tables (19 total):**
- `app_settings` — key-value config store
- `warehouses` — physical locations: UKP1 (Gravesend/manufacturing), UKP3, UKP4, UKP5
- `plants` — manufacturing areas A1–A5 (all at UKP1); linked to warehouses via `warehouse_code`
- `pack_types` — warehouse capacity categories: SMALL_PACK, 60L, BARREL_200L, IBC
- `labour_pools` — filling crew groups; `max_concurrent_lines` = physical ceiling
- `lines` — 14 production lines; include `oee_target` (default 0.55) and `available_mins_per_day` (default 420)
- `items` — SKUs with `pack_size_l`, `pack_type_code`, `units_per_pallet`, `sku_status` (1/2/3)
- `resource_types` — controlled vocabulary for staff roles (scope = LINE or PLANT)
- `line_resource_requirements` — headcount per line per role (Excel upload)
- `plant_resource_requirements` — shared headcount per plant per role (Excel upload)
- `line_pack_capabilities` — pack sizes + fill speeds per line (Excel upload)
- `warehouse_capacity` — max pallet positions per pack type per warehouse (Excel upload)
- `item_resource_rules` — standard hours/unit per item group per line (Phase 2 input)

**Workflow tables:**
- `import_batches` / `import_batch_files` / `import_validation_results` / `plan_versions`

**Planning data tables (batch-scoped):**
- `master_stock`, `demand_plan`, `line_capacity_calendar`, `staffing_plan`, `oee_daily`, `portfolio_changes`

**Views:**
- `vw_line_capacity_with_net` — adds `net_theoretical_hours`
- `vw_batch_file_status` — file upload status per batch
- `vw_batch_readiness` — `can_publish` flag per batch
- `vw_line_pack_capabilities` — computed `litres_per_minute`, `effective_mins_per_day`
- `vw_master_stock` — adds `sales_allocated_ea`, `free_stock_vs_safety_ea`, `total_stock_litres`

**Removed tables (replaced):**
- `support_staff_pools` → replaced by `plant_resource_requirements`
- `support_staff_line_assignments` → replaced by `plant_resource_requirements`

---

## Naming Conventions

- Boolean fields: `is_active`, `is_working_day`, `is_current_version` (not `active_flag`)
- Quantities: `demand_quantity`, `quantity_on_hand` (not `qty_`)
- Hours: `standard_hours_per_unit` (not `std_hrs_per_unit`)
- Headcount: `headcount_required` (not `fte_required`)

---

## Auth Design (added to Phase 1)

Auth was originally deferred to Phase 5 but is being built in Phase 1.

- **App auth:** Username + password → JWT token (PyJWT, HS256)
- **Roles:** `admin` (full access) | `user` (planning workflow only)
- **DB connection:** SQL Server auth (`rccp_app` login, credentials in `.env`)
- **Default admin:** username `admin`, password `admin123` — change after first login
- **Admin-gated (future):** app settings, masterdata uploads, user management

---

## Current Deployment State (as of 2026-02-27)

**Database: FULLY DEPLOYED** — all 10 schema scripts (00–09) and both seed scripts run successfully.
- All tables, views, and seed data in place on `localhost\SQLEXPRESS`, database `RCCP_One`
- `09_users.sql` run — users table created, admin seeded, master_stock constraint fixed

**Backend: scaffold complete and tested** — auth, batch management, file upload endpoints built and verified working.
- Stack: FastAPI + pyodbc + bcrypt + PyJWT
- Run from `backend/`: `uvicorn app.main:app --reload`
- Login (`admin`/`admin123`), batch creation, DB connection all confirmed working

**Frontend: not yet implemented.**

**Before running the backend:**
1. Run `db/schema/09_users.sql` in SSMS
2. Create `rccp_app` SQL login in SSMS:
   ```sql
   CREATE LOGIN rccp_app WITH PASSWORD = 'your_password';
   CREATE USER rccp_app FOR LOGIN rccp_app;
   ALTER ROLE db_datareader ADD MEMBER rccp_app;
   ALTER ROLE db_datawriter ADD MEMBER rccp_app;
   GRANT EXECUTE TO rccp_app;
   ```
3. `cd backend && python -m venv venv && venv\Scripts\activate`
4. `pip install -r requirements.txt`
5. Copy `.env.example` → `.env`, fill in `DB_PASSWORD` and `JWT_SECRET`
6. `uvicorn app.main:app --reload`

**To redeploy from scratch** (all scripts are idempotent):
```bat
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\00_reset_all_tables.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\01_masterdata.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\02_workflow.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\03_planning_data.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\04_views.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\05_item_resource_rules.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\06_resource_requirements.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\07_line_pack_capabilities.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\08_warehouse_capacity.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i seeds\01_app_settings.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i seeds\02_masterdata_sample.sql
```

---

## Open Questions (resolve before continuing)

- SAP export column headers for all 6 file types — needed for Stage 3 (FIELD_MAPPING_CHECK) validation
- Figma / Planning Data screen design — not yet shared
- `standard_hourly_rate` for all 5 resource types
- `units_per_pallet` for 1L (101221) and 4L (101233) items
- `bottles_per_minute` for lines A202, A302–A308, A401, A501, A502
- Resource requirements for Plants A2–A5
- Actual warehouse capacity (pallet positions) per pack type per warehouse
- `standard_hours_per_unit` in item_resource_rules — all values are placeholders

---

## Coding Rules

- Clean, maintainable code over clever code
- Modular structure — do not build everything in one file
- Do not build Phase 2+ features early
- Challenge weak designs before implementing
- No auth/user accounts in Phase 1 — `created_by` fields are nullable strings
- Separate concerns: routes / services / db access layers in backend
