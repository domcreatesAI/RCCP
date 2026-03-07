# RCCP One — Project Status & Context

> This file is the source of truth for project state.
> Update it at the end of every working session.
> Last updated: 2026-03-07 (session 8)

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
| Frontend | React 18 + TypeScript | Vite, Tailwind CSS v3, TanStack Query v5, React Router v7, lucide-react, sonner |
| DB Migrations | Python Alembic | Future — scripts are idempotent for now |
| File storage | Local filesystem (VM) | Base dir: `uploads/` relative to backend root |

---

## Phase Plan

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Database + Planning Data screen + Upload + Validate + Publish + Baseline | **IN PROGRESS — core complete** |
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
| 3 | SQL Server schema (scripts 00–09 + seeds) | **Complete — deployed** |
| 4 | Backend: auth, batch management, file upload | **Complete — tested** |
| 5 | Frontend: login + Planning Data screen | **Complete — browser-tested** |
| 6 | Backend: 7-stage validation pipeline (auto + manual re-run) | **Complete** |
| 7 | Frontend: inline validation issue messages per file | **Complete** |
| 8 | Backend + Frontend: Excel template downloads | **Complete** |
| 9 | Backend + Frontend: Masterdata upload section (4 types, stages 2–6 validation) | **Complete** |
| 10 | DB: script 11 (masterdata_uploads table + items.moq + items.mrp_type) | **Complete — deployed** |
| 10a | Frontend: Unified one-card layout (required + masterdata in one table), BatchActionBar at page bottom | **Complete** |
| 10b | Templates: master_stock template; demand_plan PIR format (material_id, plant, M03.2026 month cols); DD/MM/YYYY throughout | **Complete** |
| 10c | Capacity calendar: `scripts/generate_capacity_calendar.py` → 25,564 rows, UK bank holidays 2026–2030 | **Complete** |
| 10d | Validation: top 3 issues per file (STRING_AGG, `<\|>` delimiter, stacked display in frontend) | **Complete** |
| 10e | DB: migrations 12–16 (fix masterdata CK, line_pack OEE col, stored_path col, remove item_status type, remove oee_daily) | **Complete — applied** |
| 11 | Backend: Publish batch endpoint | **Complete** |
| 12 | Backend + Frontend: Create baseline (BatchActionBar) | **Complete** |
| 13 | Backend + Frontend: File content BLOB storage + versioning + masterdata download | **Complete — needs migration 17 on live DB** |
| 14 | Baseline status banner in BatchHeader (green = done, amber = publish without baseline) | **Complete** |
| 15 | production_orders as 6th required batch file (COOIS export) — DB + validation + template + publish | **Complete — migrations 18+19 applied** |
| 16 | Backend: validation enhancements — `initial_demand` in portfolio_changes, stage 8 CROSS_FILE_CHECK (coverage report), template updates, headcount ≥ 0 | **Complete — migration 20 written, needs deployment** |
| 17 | Frontend Phase A shell redesign — dark sidebar, lucide icons, frosted topbar, cycle badge, sonner toasts, react-router v7 | **Complete** |

---

## Database — Deployment State

**Status: Fully deployed — scripts 00–09 + 11 + both seeds + migrations 12–19 applied.**

### How to Deploy (Clean Slate)

Run in this order from the repo root (always use `-C` flag with ODBC Driver 18):

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

All scripts are idempotent — safe to re-run (except 00_reset which drops all tables).

### Script Summary

| Script | Creates | Notes |
|--------|---------|-------|
| `schema/00_reset_all_tables.sql` | — | Drops all tables. Run before fresh deploy. |
| `schema/01_masterdata.sql` | app_settings, warehouses, plants, pack_types, labour_pools, lines, items | |
| `schema/02_workflow.sql` | import_batches, import_batch_files, import_validation_results, plan_versions | |
| `schema/03_planning_data.sql` | master_stock, demand_plan, line_capacity_calendar, headcount_plan, portfolio_changes | oee_daily removed by migration 16 |
| `schema/04_views.sql` | vw_line_capacity_with_net, vw_batch_file_status, vw_batch_readiness, vw_master_stock | |
| `schema/05_item_resource_rules.sql` | item_resource_rules | |
| `schema/06_resource_requirements.sql` | resource_types, line_resource_requirements, plant_resource_requirements | |
| `schema/07_line_pack_capabilities.sql` | line_pack_capabilities + vw_line_pack_capabilities | View co-located with table |
| `schema/08_warehouse_capacity.sql` | warehouse_capacity | |
| `schema/09_users.sql` | users | Also fixes master_stock CHECK constraint on import_batch_files |
| `schema/11_masterdata_uploads.sql` | masterdata_uploads; adds items.moq, items.mrp_type | Idempotent |
| `seeds/01_app_settings.sql` | Default config values incl. overtime/shift multipliers | |
| `seeds/02_masterdata_sample.sql` | All masterdata: warehouses, plants, lines, items, resource types, requirements, line pack speeds | |

**Migrations (applied to existing DB, not needed for clean slate):**

| Script | Changes |
|--------|---------|
| `schema/10_rename_staffing_to_headcount.sql` | Renames staffing_plan → headcount_plan column/type references |
| `schema/12_fix_masterdata_uploads_ck.sql` | Fixes CHECK constraint on masterdata_uploads.upload_type |
| `schema/13_line_pack_oee.sql` | Adds OEE target column to line_pack_capabilities |
| `schema/14_masterdata_stored_path.sql` | Adds stored_file_path column to masterdata_uploads |
| `schema/15_remove_item_status_type.sql` | Removes item_status from masterdata upload type CHECK constraint |
| `schema/16_remove_oee_daily.sql` | Drops oee_daily table, removes from CK constraint + vw_batch_readiness, deletes app_settings seed row |
| `schema/17_file_content_versioning.sql` | Adds file_content VARBINARY(MAX) to import_batch_files + masterdata_uploads; version_number to masterdata_uploads |
| `schema/18_production_orders.sql` | Creates dbo.production_orders table (6th batch file type) |
| `schema/19_update_batch_readiness_view.sql` | Updates CK_import_batch_files_type + vw_batch_readiness for 6 required files |

---

## Backend — State

**Status: Phase 1 core complete.**

### Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/login` | None | Returns `access_token`, `role` |
| GET | `/api/batches` | JWT | List all batches |
| POST | `/api/batches` | JWT | Create batch (name + plan_cycle_date) |
| GET | `/api/batches/{id}` | JWT | Batch detail + file status + top 3 issues per file |
| POST | `/api/batches/{id}/files` | JWT | Upload file → auto-validates → returns updated status |
| POST | `/api/batches/{id}/validate` | JWT | Re-run validation on all current files |
| GET | `/api/templates/{file_type}` | JWT | Download Excel template (.xlsx); all 6 batch file types |
| GET | `/api/masterdata/status` | JWT | Last upload info for all 4 masterdata types |
| POST | `/api/masterdata/{type}` | JWT | Upload + validate (stages 2–6) + full-replace import |
| GET | `/api/masterdata/{type}/template` | JWT | Download masterdata template; all 4 types |
| GET | `/api/masterdata/{type}/download` | JWT | Download last uploaded masterdata file |
| GET | `/api/baselines` | JWT | List all baselines |
| POST | `/api/baselines` | JWT | Create named baseline from a PUBLISHED batch |
| GET | `/api/health` | None | DB connection check |

### Running the backend (Windows)

```bat
cd backend
py -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env   (fill in DB_PASSWORD and JWT_SECRET)
.\venv\Scripts\uvicorn.exe app.main:app --reload
```

### Known quirks

- Use `py` launcher on Windows, not `python`
- On PowerShell, call executables directly (`.\venv\Scripts\python.exe`) — activate.bat doesn't persist
- `bcrypt` used directly — passlib is incompatible with Python 3.13 + bcrypt 4.x
- `.env` must be in `backend/` root, not `backend/app/`
- sqlcmd requires `-C` flag on this machine (ODBC Driver 18 enforces SSL by default)

---

## Frontend — State

**Status: Phase 1 core complete. Phase A shell redesign complete.**

### What's built

- Login page (username/password → JWT → AuthContext → localStorage)
- Planning Data page: single-column layout
  - Batch selector dropdown + "New batch" modal
  - **BatchHeader**: baseline status banner at top (green = baseline exists; amber = published, no baseline yet)
  - **Unified card**: one table with shared columns (File, Status, Ver., Uploaded by, Time, Actions)
    - Required files section (6 rows: master_stock, production_orders, demand_plan, line_capacity_calendar, headcount_plan, portfolio_changes)
    - Masterdata section (4 rows): same columns; Ver. = row count from last import
  - **BatchActionBar** at page bottom: Re-validate / Reset batch / Publish batch / Create baseline
- Template download button on all 6 required file rows + all 4 masterdata rows
- 5-second polling on active batch

### Phase A shell (complete)

- **Sidebar**: dark navy gradient (`#0F172A→#1E293B`), lucide icons, indigo gradient active state, user avatar with initials + online dot, LogOut icon
- **AppShell topbar**: frosted glass (`bg-white/80 backdrop-blur-xl`), breadcrumb, live cycle badge (batch name + status from API), bell/help buttons, user avatar
- **react-router v7**: migrated from `react-router-dom` v6 (same API, renamed package)
- **sonner**: `<Toaster richColors />` in App.tsx — `toast.success/error()` available everywhere
- **lucide-react**: replaces all hand-crafted inline SVGs

### Running the frontend

```bash
cd frontend
npm run dev      # → http://localhost:5173
```

Vite proxies `/api` → `http://localhost:8000`. Backend must be running.

---

## Data Model Summary

### Tables (25 total)

**Masterdata**
- `app_settings` — configurable business rules (key-value)
- `warehouses` — UKP1 (Gravesend), UKP3 (Rochester), UKP4 (Wakefield), UKP5 (Aberdeen)
- `plants` — manufacturing areas A1–A5, all at UKP1
- `pack_types` — Small Pack, 60L, Barrel 200L, IBC
- `labour_pools` — shared filling crew groups per plant (`max_concurrent_lines` = physical ceiling)
- `lines` — 14 production lines. `oee_target` default 0.55, `available_mins_per_day` default 420
- `items` — SKUs with `pack_size_l`, `pack_type_code`, `units_per_pallet`, `sku_status`, `moq`, `mrp_type`
- `masterdata_uploads` — audit trail: every masterdata upload (type, filename, row_count, who, when)

**Capacity & Resource Masterdata** (uploadable via `/api/masterdata/{type}`, full replace with validation)
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
- `master_stock`, `demand_plan`, `line_capacity_calendar`, `headcount_plan`, `portfolio_changes`
- `production_orders` — SAP COOIS export; LA (planned) + YPAC (released/firmed); net_quantity computed at import

**Views**
- `vw_line_capacity_with_net` — adds `net_theoretical_hours`
- `vw_batch_file_status` — powers the Planning Data screen file panels
- `vw_batch_readiness` — `can_publish` flag per batch (requires 6 files)
- `vw_line_pack_capabilities` — computed `litres_per_minute` and `effective_mins_per_day`
- `vw_master_stock` — adds `sales_allocated_ea`, `free_stock_vs_safety_ea`, `total_stock_litres`

---

## Key Design Decisions

1. `net_theoretical_hours` computed in view, not stored
2. `litres_per_minute` computed in view, not stored (= `pack_size_l × bottles_per_minute`)
3. `sales_allocated_ea` computed in view, not stored (= `total_stock_ea - free_stock_ea`)
4. Files stored on filesystem, paths in DB — not BLOBs (except file_content backup added in migration 17)
5. File re-uploads are versioned — `is_current_version` toggled, old versions kept
6. `oee_target` is per line (not per pack size) — Phase 3 scenarios override it
7. Weekly demand derived at query time: `demand_quantity / CEILING(days_in_month / 7.0)`
8. Only one PUBLISHED batch at a time — enforced at application layer
9. Only one active baseline — enforced at application layer
10. `plan_cycle_date` must be 1st of month — enforced by CHECK constraint
11. Auth (JWT, roles) moved from Phase 5 to Phase 1 at user request
12. production_orders: `production_line` nullable — LA orders have line, YPAC may not; no warning issued
13. production_orders: `net_quantity = MAX(0, order_quantity - delivered_quantity)` computed at import

---

## Pending Items / Open Questions

- [x] **DB script 11** — deployed and verified
- [x] **demand_plan SAP column headers** — PIR format confirmed and implemented
- [x] **oee_daily** — removed entirely (migration 16 applied)
- [x] **production_orders (COOIS)** — added as 6th required batch file (migrations 18+19 applied)
- [ ] **Migrations 16 + 17** — confirm applied on live DB (16: remove oee_daily; 17: file content versioning)
- [ ] **Migration 20** — `db/schema/20_validation_enhancements.sql` — adds `initial_demand` to `portfolio_changes`, fixes headcount CHECK constraints to `≥ 0`. **Run before testing validation enhancements.**
  ```bat
  sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\20_validation_enhancements.sql
  ```
- [ ] **SAP export column headers** for `master_stock` — stages 3–6 currently return INFO. Update `FILE_SCHEMAS["master_stock"]` + template once confirmed.
- [ ] **`standard_hourly_rate`** for all 5 resource types — needed before Phase 3 cost calculations
- [ ] **`bottles_per_minute`** for lines A202, A302–A308, A401, A501, A502 — confirm with engineering; upload via `line_pack_capabilities` masterdata
- [ ] **Resource requirements** for Plants A2–A5 — upload via `plant_resource_requirements` masterdata
- [ ] **Warehouse capacity** (pallet positions per pack type per warehouse) — upload via `warehouse_capacity` masterdata
- [ ] **`standard_hours_per_unit`** in item_resource_rules — all values are placeholders (Phase 2)

---

## Next Session Starting Point

**Phase 1 backend + Phase A frontend shell complete. Next:**

1. **Deploy migration 20** on live DB:
   ```bat
   sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\20_validation_enhancements.sql
   ```
2. **Confirm migrations 16 + 17** applied on live DB
3. **Phase B** — Planning Data page redesign:
   - 3fr/2fr grid layout (files table left, validation accordion panel right)
   - Richer file rows with better status display
   - Gradient action bar buttons (indigo publish, emerald baseline)
   - Coverage report collapsible panel
4. End-to-end test: upload all 6 files, validate, publish, create baseline

**Open items (not blocking):**
- master_stock SAP column headers — update `FILE_SCHEMAS["master_stock"]` + template once confirmed
- Masterdata data population (resource requirements, warehouse capacity, line speeds for remaining lines)

**Figma reference design** is at `RCCP/figma_prototype/` — used for Phase A–D redesign. Key files:
- `src/app/components/Layout.tsx` — sidebar + topbar reference (Phase A — done)
- `src/app/components/planning-data/PlanningData.tsx` — Phase B reference (880 lines)
- Phases C+ use `motion` (animations), Phase D uses dashboard/scenarios/config pages
