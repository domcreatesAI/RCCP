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
├── backend/                   ← Python FastAPI (Phase 1 mostly complete)
│   ├── app/
│   │   ├── main.py            — FastAPI app, CORS, health endpoint
│   │   ├── config.py          — env vars
│   │   ├── database.py        — pyodbc connection factory
│   │   ├── routers/           — auth.py, batches.py, uploads.py, templates.py, masterdata.py, baselines.py
│   │   └── services/          — auth_service.py, batch_service.py, upload_service.py,
│   │                             validation_service.py, template_service.py, masterdata_service.py,
│   │                             publish_service.py, excel_utils.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/                  ← React TypeScript (Phase 1 mostly complete)
│   ├── src/
│   │   ├── api/               — client.ts, auth.ts, batches.ts, uploads.ts, masterdata.ts, baselines.ts
│   │   ├── components/        — layout/ + planning/ sub-folders
│   │   ├── contexts/          — AuthContext.tsx
│   │   ├── pages/             — LoginPage.tsx, PlanningDataPage.tsx
│   │   └── types/             — index.ts
│   ├── package.json
│   └── vite.config.ts         — proxies /api → localhost:8000
├── db/
│   ├── schema/                ← SQL schema scripts (00–09, 11–19)
│   ├── seeds/                 ← 2 seed scripts (app settings + masterdata)
│   └── README.md
└── docs/
    └── PROJECT_STATUS.md      ← current deployment state, open questions, next steps
```

---

## Phase Plan

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Database + Planning Data screen + Upload + Validate + Publish + Baseline | **IN PROGRESS — core complete, masterdata download remaining** |
| Phase 2 | RCCP engine, line risk logic, labour/warehouse-constrained capacity calculations | Not started |
| Phase 3 | Scenario modelling, OEE simulation, cost of additional capacity | Not started |
| Phase 4 | Executive summary, 12-month staff forecast charts, approval workflow | Not started |
| Phase 5 | Config & masterdata UI, auth/users/roles | Not started |

**Only build Phase 1. Do not start Phase 2 until explicitly approved.**

---

## Core Workflow (Phase 1)

1. Upload 6 required Excel files (SAP exports) per planning cycle
2. Run 7-stage validation pipeline per file
3. Publish batch (only when no BLOCKED issues)
4. Create named, immutable baseline from published batch

---

## Planning Data Files (SAP batch uploads)

| File Type | Required? | Notes |
|-----------|-----------|-------|
| `master_stock` | Yes | Renamed from `inventory_snapshots` |
| `production_orders` | Yes | SAP COOIS export — LA (planned) + YPAC (released/firmed) orders |
| `demand_plan` | Yes | Monthly per warehouse; weekly derived at query time |
| `line_capacity_calendar` | Yes | |
| `headcount_plan` | Yes | |
| `portfolio_changes` | Yes | Required but may have 0 data rows (valid) |

## Masterdata Excel Uploads (separate from batch workflow, full replace)

Uploaded via `POST /api/masterdata/{type}`. Synchronous validation (stages 2–6) on every upload.
BLOCKED = rejected, WARNING = imported with caution. Tracked in `masterdata_uploads` table.

| Upload type key | Table(s) updated | Notes |
|----------------|-----------------|-------|
| `line_pack_capabilities` | `line_pack_capabilities` | Fill speeds + pack sizes per line |
| `line_resource_requirements` | `line_resource_requirements` | Headcount per line per role |
| `plant_resource_requirements` | `plant_resource_requirements` | Shared headcount per plant per role |
| `warehouse_capacity` | `warehouse_capacity` | Max pallet positions per pack type |

Note: `resource_requirements.xlsx` (2 tabs) was split into two separate uploads for simplicity.

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
- `headcount_plan` — actual planned headcount; compared against requirements to flag shortfalls

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
- `items` — SKUs with `pack_size_l`, `pack_type_code`, `units_per_pallet`, `sku_status` (1/2/3), `moq`, `mrp_type`
- `resource_types` — controlled vocabulary for staff roles (scope = LINE or PLANT)
- `line_resource_requirements` — headcount per line per role (masterdata upload)
- `plant_resource_requirements` — shared headcount per plant per role (masterdata upload)
- `line_pack_capabilities` — pack sizes + fill speeds per line (masterdata upload)
- `warehouse_capacity` — max pallet positions per pack type per warehouse (masterdata upload)
- `masterdata_uploads` — audit trail for all masterdata file uploads (who, when, how many rows)
- `item_resource_rules` — standard hours/unit per item group per line (Phase 2 input)

**Workflow tables:**
- `import_batches` / `import_batch_files` / `import_validation_results` / `plan_versions`

**Planning data tables (batch-scoped):**
- `master_stock`, `demand_plan`, `line_capacity_calendar`, `headcount_plan`, `portfolio_changes`
- `production_orders` — SAP COOIS export; LA (planned) + YPAC (released/firmed); `net_quantity` computed at import

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

## Current Deployment State (as of 2026-03-11)

**GitHub repo:** `https://github.com/d0m1n/RCCP-One.git` — source of truth. Clone locally; do not develop on Google Drive (npm is too slow).

**Database: FULLY DEPLOYED** — scripts 00–09 + 11 + both seeds deployed and verified. Migrations 12–19 + 24 applied.

**Backend: Phase 1 complete and end-to-end tested.**
- Stack: FastAPI + pyodbc + bcrypt + PyJWT
- Routers: auth, batches (incl. publish), uploads, templates, masterdata, baselines
- Services: auth, batch, upload, validation, template, masterdata, publish, excel_utils
- All endpoints working — see PROJECT_STATUS.md for full list
- demand_plan: PIR format confirmed (SAP wide-format, `material_id`/`plant` key cols, monthly columns `M03.2026`)
- production_orders: COOIS format (header_row=2, data_start_row=3, LA+YPAC order types, net_quantity computed)
- Validation: `blocked_fk_checks` on production_orders.material (hard BLOCKED if SKU not in dbo.items); summary-format FK checks (one entry per unique missing value, not per row)
- Run from `backend/`: `.\venv\Scripts\uvicorn.exe app.main:app --reload`

**Frontend: Phase 1 complete and end-to-end tested.**
- Login → Planning Data page: 3fr/1fr grid (files table + validation panel)
- Lifecycle stepper: Draft → Validated → Published → Archived; each step turns green when complete
- Unified file table: File (name + description) | Status (centered) | Ver. | Uploaded by | Time | Actions
- BatchActionBar: Re-validate / Reset batch / Publish batch / Create baseline
- Required files: 6 rows (master_stock, production_orders, demand_plan, line_capacity_calendar, headcount_plan, portfolio_changes)
- Template buttons on all 6 required file rows + all 5 masterdata rows
- Run from `frontend/`: `npm run dev` → `http://localhost:5173`

**Capacity calendar pre-filled:** `scripts/generate_capacity_calendar.py` generates `uploads/capacity_calendar_2026_2030.xlsx` — 14 lines × 1,826 days (2026–2030), UK bank holidays hardcoded, DD/MM/YYYY date format.

**Before running the backend (fresh machine setup):**
1. Ensure `rccp_app` SQL login exists with access to `RCCP_One`
2. `cd backend && py -m venv venv`
3. `.\venv\Scripts\python.exe -m pip install -r requirements.txt`
4. Copy `.env.example` → `.env`, fill in `DB_PASSWORD` and `JWT_SECRET`
5. `.\venv\Scripts\uvicorn.exe app.main:app --reload`

**To redeploy DB from scratch** (run from repo root with `-C` flag for ODBC Driver 18):
```bat
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\00_reset_all_tables.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\01_masterdata.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\02_workflow.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\03_planning_data.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\04_views.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\05_item_resource_rules.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\06_resource_requirements.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\07_line_pack_capabilities.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\08_warehouse_capacity.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\09_users.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\11_masterdata_uploads.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\seeds\01_app_settings.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\seeds\02_masterdata_sample.sql
```

**Migrations (apply to existing deployment, in order):**
```bat
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\10_rename_staffing_to_headcount.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\12_fix_masterdata_uploads_ck.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\13_line_pack_oee.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\14_masterdata_stored_path.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\15_remove_item_status_type.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\16_remove_oee_daily.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\17_file_content_versioning.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\18_production_orders.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\19_update_batch_readiness_view.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\24_widen_system_status.sql
```

---

## Open Questions (resolve before continuing)

- **SAP export column headers** for `master_stock` — needed to complete stages 3–6 (currently return INFO)
- `demand_plan`: PIR format confirmed and implemented. Filter PIR to UK plants (UKP1/3/4/5) before upload.
- `standard_hourly_rate` for all 5 resource types (Phase 3 cost calculations)
- `bottles_per_minute` for lines A202, A302–A308, A401, A501, A502
- Resource requirements for Plants A2–A5
- Actual warehouse capacity (pallet positions) per pack type per warehouse
- `standard_hours_per_unit` in item_resource_rules — all values are placeholders
- **MOQ** — `items.moq` column exists; populated via `master_stock` upload (moq field maps to items.moq)
- Confirm migrations 16 + 17 applied on live DB (code is complete, may not have been run)

---

## Coding Rules

- Clean, maintainable code over clever code
- Modular structure — do not build everything in one file
- Do not build Phase 2+ features early
- Challenge weak designs before implementing
- Auth is in Phase 1 — `created_by` fields are nullable strings (auth came in late, existing rows remain nullable)
- Separate concerns: routes / services / db access layers in backend
