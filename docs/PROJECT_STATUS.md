# RCCP One — Project Status & Context

> This file is the source of truth for project state.
> Update it at the end of every working session.
> Last updated: 2026-02-27

---

## What This App Is

Internal manufacturing planning tool (RCCP = Rough Cut Capacity Planning).
Ingests SAP Excel exports → validates → publishes → creates immutable baselines.
Runs on a Windows VM on the company network. Not a public SaaS app.

---

## Tech Stack (Confirmed)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Database | SQL Server 17 (`localhost\SQLEXPRESS`) | Login: `rccp_app` |
| Backend | Python + FastAPI | Not yet started |
| Frontend | React (TypeScript) | Not yet started |
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
| Phase 5 | Config & masterdata UI, auth/users/roles | Not started |

---

## Phase 1 Build Order

| Step | Task | Status |
|------|------|--------|
| 1 | Architecture review & challenge | Done |
| 2 | Confirm Phase 1 architecture | Done |
| 3 | SQL Server schema (all scripts) | **Complete — ready to deploy** |
| 4 | Backend: file upload, validation, publish, baseline | Not started |
| 5 | Frontend: Planning Data screen | Not started |

---

## Database — Deployment State

### SQL Server Instance
- Server: `localhost\SQLEXPRESS`
- Database: `RCCP_One`
- Login used: `rccp_app`

### How to Deploy (Clean Slate)

Run in this order from the `db/` folder:

```bat
-- 1. Reset any previously deployed tables
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\00_reset_all_tables.sql

-- 2. Schema scripts
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\01_masterdata.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\02_workflow.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\03_planning_data.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\04_views.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\05_item_resource_rules.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\06_resource_requirements.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\07_line_pack_capabilities.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i schema\08_warehouse_capacity.sql

-- 3. Seed data
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i seeds\01_app_settings.sql
sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -i seeds\02_masterdata_sample.sql
```

All scripts are idempotent — safe to re-run (except the reset script which drops all tables).

### Script Summary

| Script | Creates | Notes |
|--------|---------|-------|
| `schema/00_reset_all_tables.sql` | — | Drops all tables. Run before fresh deploy. |
| `schema/01_masterdata.sql` | app_settings, warehouses, plants, pack_types, labour_pools, lines, items | |
| `schema/02_workflow.sql` | import_batches, import_batch_files, import_validation_results, plan_versions | Unchanged from original |
| `schema/03_planning_data.sql` | master_stock, demand_plan, line_capacity_calendar, staffing_plan, oee_daily, portfolio_changes | |
| `schema/04_views.sql` | vw_line_capacity_with_net, vw_batch_file_status, vw_batch_readiness, vw_line_pack_capabilities, vw_master_stock | |
| `schema/05_item_resource_rules.sql` | item_resource_rules | |
| `schema/06_resource_requirements.sql` | resource_types, line_resource_requirements, plant_resource_requirements | Replaces old 06_support_staff_pools.sql |
| `schema/06_support_staff_pools.sql` | — | SUPERSEDED — contains redirect comment only |
| `schema/07_line_pack_capabilities.sql` | line_pack_capabilities | |
| `schema/08_warehouse_capacity.sql` | warehouse_capacity | |
| `seeds/01_app_settings.sql` | Default config values incl. overtime/shift multipliers | |
| `seeds/02_masterdata_sample.sql` | All masterdata: warehouses, plants, lines, items, resource types, requirements, line pack speeds, IRRs | |

---

## Data Model Summary

### Tables (23 total)

**Masterdata**
- `app_settings` — configurable business rules (key-value)
- `warehouses` — physical locations: UKP1 (Gravesend), UKP3 (Rochester), UKP4 (Wakefield), UKP5 (Aberdeen)
- `plants` — manufacturing areas A1–A5, all at UKP1. Linked to `warehouses` via `warehouse_code`.
- `pack_types` — warehouse capacity categories: Small Pack, 60L, Barrel 200L, IBC
- `labour_pools` — shared filling crew groups per plant (`max_concurrent_lines` = physical ceiling)
- `lines` — 14 production lines. Includes `oee_target` (default 0.55) and `available_mins_per_day` (default 420)
- `items` — SKUs with `pack_size_l`, `pack_type_code`, `units_per_pallet`, `sku_status`

**Capacity & Resource Masterdata** (Excel-uploadable, full replace)
- `resource_types` — controlled vocabulary for staff roles (LINE or PLANT scope)
- `line_resource_requirements` — headcount per line per role (e.g. A101 needs 3 Line Operators)
- `plant_resource_requirements` — shared headcount per plant per role (e.g. A1 needs 2 Forklift Drivers)
- `line_pack_capabilities` — pack sizes each line can run and fill speed (bottles/min)
- `warehouse_capacity` — max pallet positions per pack type per warehouse
- `item_resource_rules` — standard hours per unit per item group per line (Phase 2 input)

**Workflow / Control**
- `import_batches` — one batch = one planning cycle upload set
- `import_batch_files` — individual file uploads (versioned, re-upload supported)
- `import_validation_results` — 7-stage validation pipeline results
- `plan_versions` — named, immutable baselines

**Planning Data** (SAP imports, scoped to a batch)
- `master_stock` — stock snapshot per SKU per warehouse (`total_stock_ea`, `free_stock_ea`, `safety_stock_ea`)
- `demand_plan` — monthly demand per SKU per warehouse (weekly derived at query time)
- `line_capacity_calendar` — daily planned hours per line
- `staffing_plan` — planned headcount per line per day
- `oee_daily` — actual/forecast OEE per line per day (optional)
- `portfolio_changes` — product launches/discontinuations (required, 0 rows valid)

**Views**
- `vw_line_capacity_with_net` — adds `net_theoretical_hours` to line capacity calendar
- `vw_batch_file_status` — powers the Planning Data screen file panels
- `vw_batch_readiness` — `can_publish` flag per batch
- `vw_line_pack_capabilities` — computed `litres_per_minute` and `effective_mins_per_day`
- `vw_master_stock` — adds `sales_allocated_ea`, `free_stock_vs_safety_ea`, `total_stock_litres`

---

## Masterdata Excel Uploads (separate from batch workflow)

| File | Updates | Pattern |
|------|---------|---------|
| `line_pack_capabilities.xlsx` | `line_pack_capabilities` | Full replace |
| `resource_requirements.xlsx` (2 tabs) | `line_resource_requirements` + `plant_resource_requirements` | Full replace |
| `warehouse_master.xlsx` | `warehouse_capacity` | Full replace |
| `sku_status.xlsx` | `items.sku_status` | Upsert by item_code |

---

## Key Design Decisions

1. `net_theoretical_hours` computed in view, not stored
2. `litres_per_minute` computed in view, not stored (= `pack_size_l × bottles_per_minute`)
3. `sales_allocated_ea` computed in view, not stored (= `total_stock_ea - free_stock_ea`)
4. Files stored on filesystem, paths in DB — not BLOBs
5. `oee_target` is per line (not per pack size) — Phase 3 scenarios override it
6. `available_mins_per_day` is per line — standard shift length
7. Weekly demand derived at query time: `demand_quantity / CEILING(days_in_month / 7.0)`
8. `resource_types` controlled vocabulary — new roles = new row, no schema change
9. `pack_types` controlled vocabulary — new pack types = new row, no schema change
10. `support_staff_pools` / `support_staff_line_assignments` removed — replaced by `resource_requirements` model
11. Only one PUBLISHED batch at a time — enforced at application layer
12. Only one active baseline — enforced at application layer
13. `plan_cycle_date` must be 1st of month — enforced by CHECK constraint
14. All schema scripts idempotent (IF NOT EXISTS)
15. Warehouse space constraint captured in Phase 1 schema — calculations in Phase 2
16. Cost of additional capacity: `standard_hourly_rate` on `resource_types` × multipliers in `app_settings`

---

## Pending Items / Open Questions

- [ ] **`standard_hourly_rate`** for all 5 resource types — needed before Phase 3 cost calculations
- [ ] **`units_per_pallet`** for 1L (101221) and 4L (101233) items — confirm with warehouse
- [ ] **`bottles_per_minute`** for lines A202, A302–A308, A401, A501, A502 — confirm with engineering
- [ ] **Resource requirements** for Plants A2–A5 — data not yet provided
- [ ] **Warehouse capacity** (pallet positions per pack type per warehouse) — confirm with warehouse team
- [ ] **`standard_hours_per_unit`** in item_resource_rules — all values are placeholders
- [ ] **Item resource rules** for Plants A2–A5 — placeholder rules exist only for A1
- [ ] **`plant_code`** for semi-finished items 500014, 500027 — set to A1 as placeholder
- [ ] **Upload base path** — confirm actual VM path for file storage
- [ ] **Figma / screen designs** — Planning Data screen design not yet shared
- [ ] **SAP export column headers** — needed to build Stage 3 (FIELD_MAPPING_CHECK) validation

---

## Next Session Starting Point

Current priority: **run the reset + deploy scripts on the DB, then start backend.**

Backend structure to define:
- File upload endpoint (Excel → filesystem + DB row)
- 7-stage validation pipeline
- Separate masterdata upload endpoints (line pack capabilities, resource requirements, warehouse capacity, SKU status)
- Publish batch endpoint
- Create baseline endpoint
- Template download
- Source file download
- Batch pack download (.zip)
