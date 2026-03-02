# RCCP One — Project Status & Context

> This file is the source of truth for project state.
> Update it at the end of every working session.
> Last updated: 2026-03-02 (session 5)

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
| 11 | Backend: Publish batch endpoint | **Next** |
| 12 | Backend: Create baseline endpoint | Not started |

---

## Database — Deployment State

**Status: Fully deployed — scripts 00–09 + 11 + both seeds deployed and verified. Migrations 12–16 applied.**

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
| `schema/03_planning_data.sql` | master_stock, demand_plan, line_capacity_calendar, headcount_plan, oee_daily, portfolio_changes | oee_daily removed by migration 16 |
| `schema/04_views.sql` | vw_line_capacity_with_net, vw_batch_file_status, vw_batch_readiness, vw_master_stock | |
| `schema/05_item_resource_rules.sql` | item_resource_rules | |
| `schema/06_resource_requirements.sql` | resource_types, line_resource_requirements, plant_resource_requirements | |
| `schema/07_line_pack_capabilities.sql` | line_pack_capabilities + vw_line_pack_capabilities | View co-located with table |
| `schema/08_warehouse_capacity.sql` | warehouse_capacity | |
| `schema/09_users.sql` | users | Also fixes master_stock CHECK constraint on import_batch_files |
| `schema/11_masterdata_uploads.sql` | masterdata_uploads; adds items.moq, items.mrp_type | Idempotent |
| `seeds/01_app_settings.sql` | Default config values incl. overtime/shift multipliers | |
| `seeds/02_masterdata_sample.sql` | All masterdata: warehouses, plants, lines, items, resource types, requirements, line pack speeds | |

**Migrations (applied to existing DB, not needed for clean slate after running base scripts + migration 16):**

| Script | Changes |
|--------|---------|
| `schema/10_rename_staffing_to_headcount.sql` | Renames staffing_plan → headcount_plan column/type references |
| `schema/12_fix_masterdata_uploads_ck.sql` | Fixes CHECK constraint on masterdata_uploads.upload_type |
| `schema/13_line_pack_oee.sql` | Adds OEE target column to line_pack_capabilities |
| `schema/14_masterdata_stored_path.sql` | Adds stored_file_path column to masterdata_uploads |
| `schema/15_remove_item_status_type.sql` | Removes item_status from masterdata upload type CHECK constraint |
| `schema/16_remove_oee_daily.sql` | Drops oee_daily table, removes from CK constraint + vw_batch_readiness, deletes app_settings seed row |

---

## Backend — State

**Status: Phase 1 workflow complete. Publish + Baseline endpoints still to build.**

### Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/login` | None | Returns `access_token`, `role` |
| GET | `/api/batches` | JWT | List all batches |
| POST | `/api/batches` | JWT | Create batch (name + plan_cycle_date) |
| GET | `/api/batches/{id}` | JWT | Batch detail + file status + top 3 issues per file |
| POST | `/api/batches/{id}/files` | JWT | Upload file → auto-validates → returns updated status |
| POST | `/api/batches/{id}/validate` | JWT | Re-run validation on all current files |
| GET | `/api/templates/{file_type}` | JWT | Download Excel template (.xlsx); all 5 batch file types |
| GET | `/api/masterdata/status` | JWT | Last upload info for all 4 masterdata types |
| POST | `/api/masterdata/{type}` | JWT | Upload + validate (stages 2–6) + full-replace import |
| GET | `/api/masterdata/{type}/template` | JWT | Download masterdata template; all 4 types |
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

**Status: Phase 1 workflow complete. Publish + Baseline UI still to build.**

### What's built

- Login page (username/password → JWT → AuthContext → localStorage)
- Planning Data page: single-column layout
  - Batch selector dropdown + "New batch" modal
  - **Unified card**: one table with shared columns (File, Status, Ver., Uploaded by, Time, Actions)
    - Required files section (5 rows): status pill + top 3 inline issues + template button
    - Masterdata section (4 rows): same columns; Ver. = row count from last import
  - "Re-validate" button + "Publish batch" button in action bar at **page bottom** (separated from table)
- Template download button on all 5 required file rows + all 4 masterdata rows
- demand_plan: PIR SAP format — `material_id`, `plant`, 12 rolling month cols (`M03.2026` format)
- 5-second polling on active batch

### Running the frontend

```bash
cd frontend
npm run dev      # → http://localhost:5173
```

Vite proxies `/api` → `http://localhost:8000`. Backend must be running.

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

- [x] **DB script 11** — deployed and verified
- [x] **demand_plan SAP column headers** — PIR format confirmed and implemented. Columns: `material_id`, `plant` + 12 rolling month cols `M03.2026`. Filter PIR export to UK plants before upload.
- [x] **oee_daily** — removed entirely (never fully implemented). Migration 16 applied.
- [x] **item_master / item_status** masterdata types — removed. MOQ now populated via `master_stock` upload.
- [ ] **SAP export column headers** for `master_stock` — stages 3–6 currently return INFO. Once confirmed: update `FILE_SCHEMAS["master_stock"]` in `validation_service.py` + update placeholder template.
- [ ] **`standard_hourly_rate`** for all 5 resource types — needed before Phase 3 cost calculations
- [ ] **`bottles_per_minute`** for lines A202, A302–A308, A401, A501, A502 — confirm with engineering; upload via `line_pack_capabilities` masterdata
- [ ] **Resource requirements** for Plants A2–A5 — upload via `plant_resource_requirements` masterdata
- [ ] **Warehouse capacity** (pallet positions per pack type per warehouse) — upload via `warehouse_capacity` masterdata
- [ ] **`standard_hours_per_unit`** in item_resource_rules — all values are placeholders (Phase 2)

---

## Next Session Starting Point

**Immediate task:** Run migration 16 on the live DB, then build Publish batch.

```bat
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\16_remove_oee_daily.sql
```

**Remaining Phase 1 tasks (in order):**
1. **Publish batch** — `POST /api/batches/{id}/publish`
   - Gate: all 5 batch files validated (no BLOCKED) + all 4 masterdata types have a non-BLOCKED upload
   - Enforce only one PUBLISHED batch at a time (archive previous)
   - Update batch status to PUBLISHED, record published_at + published_by
   - Import batch file data into planning tables (master_stock, demand_plan, etc.)
   - Frontend: wire up Publish button in BatchActionBar
2. **Create baseline** — `POST /api/baselines`
   - Named, immutable snapshot of a published batch
   - One active baseline at a time
   - Frontend: "Create baseline" button on published batch
3. **master_stock SAP column headers** — get from user or SAP export; update `FILE_SCHEMAS["master_stock"]` + template
