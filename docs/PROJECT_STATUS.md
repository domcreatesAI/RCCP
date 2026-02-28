# RCCP One — Project Status & Context

> This file is the source of truth for project state.
> Update it at the end of every working session.
> Last updated: 2026-02-28

---

## What This App Is

Internal manufacturing planning tool (RCCP = Rough Cut Capacity Planning).
Ingests SAP Excel exports → validates → publishes → creates immutable baselines.
Runs on a Windows VM on the company network. Not a public SaaS app.

**GitHub repo:** `https://github.com/d0m1n/RCCP-One.git`
Develop from a local clone — do not develop on Google Drive (npm too slow).

---

## Tech Stack (Confirmed)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Database | SQL Server 17 (`localhost\SQLEXPRESS`) | DB: `RCCP_One`, login: `rccp_app` |
| Backend | Python + FastAPI | pyodbc (sync), bcrypt, PyJWT |
| Frontend | React 18 + TypeScript | Vite, Tailwind CSS v3, TanStack Query v5 |
| DB Migrations | Python Alembic | Future — scripts are idempotent for now |
| File storage | Local filesystem (VM) | Base dir: `uploads/` relative to backend root |

---

## Phase Plan

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Database + Planning Data screen + Upload + Validate + Publish + Baseline | **IN PROGRESS** |
| Phase 2 | RCCP engine, line risk logic, labour/warehouse-constrained capacity | Not started |
| Phase 3 | Scenario modelling, OEE simulation, cost of additional capacity | Not started |
| Phase 4 | Executive summary, 12-month staff forecast, approval workflow | Not started |
| Phase 5 | Config & masterdata UI | Not started |

**Only build Phase 1. Do not start Phase 2 until explicitly approved.**

---

## Phase 1 Build Order

| Step | Task | Status |
|------|------|--------|
| 1 | Architecture review & challenge | Done |
| 2 | Confirm Phase 1 architecture | Done |
| 3 | SQL Server schema (all 10 scripts + seeds) | **Complete — deployed** |
| 4 | Backend: auth, batch management, file upload | **Complete — tested in Swagger** |
| 5 | Frontend: login screen + Planning Data screen scaffold | **Complete — not yet browser-tested** |
| 6 | Frontend: end-to-end browser test (login → upload → verify in DB) | **Next** |
| 7 | Backend: 7-stage validation pipeline | Not started |
| 8 | Backend: Publish batch endpoint | Not started |
| 9 | Backend: Create baseline endpoint | Not started |

---

## Database — Deployment State

**Status: FULLY DEPLOYED** on `localhost\SQLEXPRESS`, database `RCCP_One`.

All 10 schema scripts and both seed scripts have been run successfully.
Users table exists, admin seeded (username: `admin`, password: `admin123`).

### How to Deploy (Clean Slate)

Run in this order from the `db/` folder:

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
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\09_users.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i seeds\01_app_settings.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i seeds\02_masterdata_sample.sql
```

All scripts are idempotent — safe to re-run (except the reset script which drops all tables).

### Script Summary

| Script | Creates | Notes |
|--------|---------|-------|
| `schema/00_reset_all_tables.sql` | — | Drops all tables. Run before fresh deploy. |
| `schema/01_masterdata.sql` | app_settings, warehouses, plants, pack_types, labour_pools, lines, items | |
| `schema/02_workflow.sql` | import_batches, import_batch_files, import_validation_results, plan_versions | file_type CHECK uses `master_stock` |
| `schema/03_planning_data.sql` | master_stock, demand_plan, line_capacity_calendar, headcount_plan, oee_daily, portfolio_changes | |
| `schema/04_views.sql` | vw_line_capacity_with_net, vw_batch_file_status, vw_batch_readiness, vw_master_stock | Note: vw_line_pack_capabilities is in 07 |
| `schema/05_item_resource_rules.sql` | item_resource_rules | |
| `schema/06_resource_requirements.sql` | resource_types, line_resource_requirements, plant_resource_requirements | |
| `schema/07_line_pack_capabilities.sql` | line_pack_capabilities + vw_line_pack_capabilities | View co-located with its table |
| `schema/08_warehouse_capacity.sql` | warehouse_capacity | |
| `schema/09_users.sql` | users | Also fixes master_stock CHECK constraint on import_batch_files |
| `seeds/01_app_settings.sql` | Default config values incl. overtime/shift multipliers | |
| `seeds/02_masterdata_sample.sql` | All masterdata: warehouses, plants, lines, items, resource types, requirements, line pack speeds | |

---

## Backend — State

**Status: Scaffold complete and tested.**

- All endpoints verified working via Swagger UI (`http://localhost:8000/docs`)
- Login confirmed: `admin` / `admin123` → JWT token returned
- Batch creation confirmed: `import_batches` row visible in SSMS

### Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/login` | None | Returns `access_token`, `role` |
| GET | `/api/batches` | JWT | List all batches |
| POST | `/api/batches` | JWT | Create batch (name + plan_cycle_date) |
| GET | `/api/batches/{id}` | JWT | Batch detail + file status from vw_batch_file_status |
| POST | `/api/batches/{id}/files` | JWT | Upload a file (multipart/form-data) |
| GET | `/api/batches/{id}/files` | JWT | List files for batch |
| GET | `/health` | None | Health check |

### Running the backend

```bash
cd backend
py -m venv venv          # Windows: use `py` not `python`
venv\Scripts\activate
pip install -r requirements.txt
# copy .env.example → .env, fill in DB_PASSWORD and JWT_SECRET
uvicorn app.main:app --reload
```

### Known quirks

- Use `py` launcher on Windows, not `python`
- `bcrypt` used directly — passlib is incompatible with Python 3.13 + bcrypt 4.x
- `.env` must be in `backend/` root, not `backend/app/`

---

## Frontend — State

**Status: Scaffolded — login + Planning Data screen built. Not yet browser-tested.**

### What's built

- Login page (username/password → JWT → AuthContext → localStorage)
- Planning Data page: two-panel layout (65% files / 35% validation)
- Batch selector dropdown + "New batch" modal
- File table: 5 required + 1 optional rows with status pills, upload buttons
- Validation panel: 7 stage rows with derived status icons
- Publish Batch bar (disabled when required files missing or BLOCKED)
- 5-second polling on active batch

### Running the frontend

```bash
cd frontend
npm install
npm run dev      # → http://localhost:5173
```

Vite proxies `/api` → `http://localhost:8000`. Backend must be running.

### First browser test checklist

- [ ] Login with `admin` / `admin123` → redirected to Planning Data
- [ ] Create new batch → batch appears in selector
- [ ] Upload a test Excel file → file row updates to PENDING status
- [ ] Confirm rows in SSMS `import_batches` + `import_batch_files`
- [ ] Logout → redirected to login

---

## Data Model Summary

### Tables (24 total)

**Masterdata**
- `app_settings` — configurable business rules (key-value)
- `warehouses` — UKP1 (Gravesend), UKP3 (Rochester), UKP4 (Wakefield), UKP5 (Aberdeen)
- `plants` — manufacturing areas A1–A5, all at UKP1
- `pack_types` — Small Pack, 60L, Barrel 200L, IBC
- `labour_pools` — shared filling crew groups per plant (`max_concurrent_lines` = physical ceiling)
- `lines` — 14 production lines. `oee_target` default 0.55, `available_mins_per_day` default 420
- `items` — SKUs with `pack_size_l`, `pack_type_code`, `units_per_pallet`, `sku_status`

**Capacity & Resource Masterdata** (Excel-uploadable, full replace)
- `resource_types` — controlled vocabulary for staff roles (LINE or PLANT scope)
- `line_resource_requirements` — headcount per line per role
- `plant_resource_requirements` — shared headcount per plant per role
- `line_pack_capabilities` — pack sizes each line can run and fill speed (bottles/min)
- `warehouse_capacity` — max pallet positions per pack type per warehouse
- `item_resource_rules` — standard hours per unit per item group per line (Phase 2 input)

**Auth**
- `users` — username, hashed password, role (admin/user), is_active

**Workflow / Control**
- `import_batches` — one batch = one planning cycle upload set
- `import_batch_files` — individual file uploads (versioned, re-upload supported)
- `import_validation_results` — 7-stage validation pipeline results
- `plan_versions` — named, immutable baselines

**Planning Data** (SAP imports, scoped to a batch)
- `master_stock`, `demand_plan`, `line_capacity_calendar`, `headcount_plan`, `oee_daily`, `portfolio_changes`

**Views**
- `vw_line_capacity_with_net` — adds `net_theoretical_hours`
- `vw_batch_file_status` — powers the Planning Data screen file panels
- `vw_batch_readiness` — `can_publish` flag per batch
- `vw_line_pack_capabilities` — computed `litres_per_minute` and `effective_mins_per_day`
- `vw_master_stock` — adds `sales_allocated_ea`, `free_stock_vs_safety_ea`, `total_stock_litres`

---

## Key Design Decisions

1. `net_theoretical_hours` computed in view, not stored
2. `litres_per_minute` computed in view, not stored (= `pack_size_l × bottles_per_minute`)
3. `sales_allocated_ea` computed in view, not stored (= `total_stock_ea - free_stock_ea`)
4. Files stored on filesystem, paths in DB — not BLOBs
5. File re-uploads are versioned — `is_current_version` toggled, old versions kept
6. `oee_target` is per line (not per pack size) — Phase 3 scenarios override it
7. Weekly demand derived at query time: `demand_quantity / CEILING(days_in_month / 7.0)`
8. Only one PUBLISHED batch at a time — enforced at application layer
9. Only one active baseline — enforced at application layer
10. `plan_cycle_date` must be 1st of month — enforced by CHECK constraint
11. Auth (JWT, roles) moved from Phase 5 to Phase 1 at user request

---

## Pending Items / Open Questions

- [ ] **SAP export column headers** for all 6 file types — needed for Stage 3 (FIELD_MAPPING_CHECK)
- [ ] **`standard_hourly_rate`** for all 5 resource types — needed before Phase 3 cost calculations
- [ ] **`units_per_pallet`** for 1L (101221) and 4L (101233) items — confirm with warehouse
- [ ] **`bottles_per_minute`** for lines A202, A302–A308, A401, A501, A502 — confirm with engineering
- [ ] **Resource requirements** for Plants A2–A5 — data not yet provided
- [ ] **Warehouse capacity** (pallet positions per pack type per warehouse) — confirm with warehouse team
- [ ] **`standard_hours_per_unit`** in item_resource_rules — all values are placeholders
- [ ] **Upload base path** — confirm actual VM path for file storage (currently `uploads/`)
- [ ] **MOQ (Minimum Order Quantity)** — needed for Phase 2 to calculate realistic production load on lines. A run must meet MOQ before it contributes load. Decide: per-item (`items.moq_ea`) or per-line-per-item (`line_pack_capabilities.moq_ea`)? Confirm with production/planning team.

---

## Next Session Starting Point

**Immediate:** Run frontend browser test against live backend — verify end-to-end flow.

**After browser test passes — next backend tasks:**
1. 7-stage validation pipeline (stub stages 1–7, return results to `import_validation_results`)
2. Publish batch endpoint (`POST /api/batches/{id}/publish`)
3. Create baseline endpoint (`POST /api/baselines`)
4. Masterdata upload endpoints (line pack capabilities, resource requirements, warehouse capacity, SKU status)
5. Template download + source file download

**Validation pipeline notes:**
- Stage 1 (REQUIRED_FILE_CHECK): all 5 required file types uploaded → PASS
- Stage 2 (TEMPLATE_STRUCTURE_CHECK): Excel has expected sheets → needs SAP column headers
- Stage 3 (FIELD_MAPPING_CHECK): column names match → needs SAP column headers
- Stage 4 (DATA_TYPE_CHECK): correct types per column
- Stage 5 (REFERENCE_CHECK): FKs exist (e.g. item codes in items table)
- Stage 6 (BUSINESS_RULE_CHECK): date ranges, no negative stock, etc.
- Stage 7 (BATCH_READINESS): summary — can publish?
