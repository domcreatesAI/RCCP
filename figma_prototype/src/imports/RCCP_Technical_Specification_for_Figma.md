# RCCP One — Technical Specification for Figma Design
> Prepared for UI/UX design handoff. Focused on functionality, data flow, and screen behaviour — not visual styling.
> Last updated: 2026-03-06

---

## 1. What This App Is

**RCCP One** is an internal manufacturing capacity planning tool.
RCCP = Rough Cut Capacity Planning.

The business problem it solves:
- A manufacturing site (Gravesend, UK) has 14 filling lines producing liquid products
- Planning teams need to know, 12–18 months forward: *Can we produce everything we need to, given our equipment, staff, and warehouse space?*
- Every month, they export 6 data files from SAP (their ERP system) and upload them here
- The app validates those files, stores the data, and will eventually compute capacity risks

**It runs on a Windows VM on the company network. It is not a public product.**

---

## 2. The Two Types of Data in the App

The app has two fundamentally different categories of data. Understanding the difference is critical for designing the screens.

### 2A. Masterdata (Slow-changing reference data)
This is the permanent configuration of the factory. It changes rarely — maybe once a quarter.
- What lines exist, what they can run, how fast
- What staff roles are needed per line
- What warehouse capacity exists
- What products (SKUs) exist and their properties

Some masterdata is managed by directly editing the database (warehouses, plants, lines, items).
Some masterdata is uploaded via Excel files through the app — 4 upload types exist (see Section 6).

### 2B. Planning Data (Monthly snapshot uploads from SAP)
Every planning cycle (typically monthly), planners export 6 files from SAP and upload them as a group called a **Batch**.
Each file represents a snapshot of a different dimension of the plan:
- Current stock levels
- Production orders on SAP
- Demand forecast
- Line capacity calendar
- Headcount plan
- Portfolio changes

These 6 files together form one planning cycle's dataset.

---

## 3. Core Workflow — How the App Is Used

The main workflow has 4 steps, performed in order:

```
Step 1: CREATE BATCH
        User creates a named batch for a specific planning month (e.g. "March 2026 Plan")

Step 2: UPLOAD & VALIDATE
        User uploads each of the 6 required SAP export files
        Each file is automatically validated through a 7-stage pipeline on upload
        User can re-upload any file to fix issues (previous versions are kept)
        User can manually re-run validation across all files

Step 3: PUBLISH BATCH
        When all 6 files pass validation (no BLOCKED issues), user publishes the batch
        Publishing imports the validated Excel data into the planning database tables
        Only one batch can be PUBLISHED at a time — the previous published batch is automatically ARCHIVED

Step 4: CREATE BASELINE
        After publishing, user optionally creates a named, immutable baseline
        A baseline is a permanent snapshot of this planning cycle's data
        Only one baseline is "active" at a time
        Baselines cannot be edited — they are the audit record
```

---

## 4. Batch Status Lifecycle

Every batch moves through these states:

```
DRAFT → (files uploaded, validation runs) → VALIDATED → PUBLISHED → ARCHIVED
                                                            ↑
                                              Only one batch can be here at once
```

| Status | Meaning |
|--------|---------|
| DRAFT | Batch created; files being uploaded |
| VALIDATING | Validation pipeline running (transient) |
| VALIDATED | All files uploaded and validated (may have WARNINGs) |
| PUBLISHED | Data imported into planning tables; active plan |
| ARCHIVED | Superseded by a newer published batch |

---

## 5. The 6 Required Batch Files

Each batch requires exactly these 6 files, exported from SAP:

| File | SAP Source | What It Contains | Key Fields |
|------|-----------|-----------------|------------|
| `master_stock` | SAP MM (MB52 report) | Stock snapshot per SKU per warehouse | item_code, warehouse, total_stock_ea, free_stock_ea, safety_stock_ea |
| `production_orders` | SAP COOIS report | Open production orders (planned + released) | order_number, material, plant, order_type (LA/YPAC), order_quantity, delivered_quantity, basic_start_date |
| `demand_plan` | SAP PIR (demand plan) | Monthly demand per SKU per warehouse | material_id, plant, month columns (M03.2026 format) |
| `line_capacity_calendar` | SAP / generated | Daily capacity per production line | line_code, date, is_working_day, planned_hours, losses (maintenance/holiday/downtime) |
| `headcount_plan` | SAP HR / manual | Planned headcount per line per date | line_code, date, planned_headcount, shift_code |
| `portfolio_changes` | Manual / PLM | Product changes in the planning horizon | change_type, effective_date, item_code, description |

**Special rules:**
- `portfolio_changes` can have 0 data rows — an empty file is valid (means "no changes this cycle")
- `production_orders` has two order types: LA = planned/MRP proposals; YPAC = released/firmed orders
- `production_orders.production_line` is nullable — LA orders have a line; YPAC often don't
- `demand_plan` is wide-format: each month is a column (e.g. `M03.2026`, `M04.2026`, ...)
- `master_stock` upload has a side-effect: it updates the items masterdata table with mrp_type, pack_size, units_per_pallet, moq, sku_status (COALESCE — only updates blanks)

---

## 6. The 4 Masterdata Upload Types

Separate from the batch workflow, 4 masterdata files can be uploaded at any time via `POST /api/masterdata/{type}`.
Each upload is a **full replace** — all existing rows deleted and replaced with the new file's data.
These uploads go through validation stages 2–6 (not the full 7-stage pipeline).

| Upload Type Key | Table(s) Updated | What It Defines |
|----------------|-----------------|----------------|
| `line_pack_capabilities` | `line_pack_capabilities` | Which pack sizes each filling line can run, and at what speed (bottles/minute) |
| `line_resource_requirements` | `line_resource_requirements` | How many people of each role type are needed to run each line |
| `plant_resource_requirements` | `plant_resource_requirements` | Shared headcount required at the plant level (e.g. forklift drivers) |
| `warehouse_capacity` | `warehouse_capacity` | Maximum pallet positions per pack type per warehouse |

Each upload is tracked in `masterdata_uploads` — who uploaded it, when, how many rows, what file.
Users can also download the most recently uploaded version of each masterdata file.

---

## 7. The 7-Stage Validation Pipeline

Every batch file upload triggers this pipeline automatically. Results are stored in `import_validation_results`.

| Stage | Name | What It Checks | Blocking? |
|-------|------|---------------|-----------|
| 1 | REQUIRED_FILE_CHECK | Are all 6 required files present in this batch? | WARNING if not |
| 2 | TEMPLATE_STRUCTURE_CHECK | Can the file be opened as Excel? Does it have a header row? | BLOCKED if not |
| 3 | FIELD_MAPPING_CHECK | Are all required columns present? Are optional columns present? | BLOCKED if required missing; WARNING if optional missing |
| 4 | DATA_TYPE_CHECK | Are values the right type (date, number, yes/no, enum)? | BLOCKED if wrong type |
| 5 | REFERENCE_CHECK | Do item codes and warehouse codes exist in the masterdata tables? | BLOCKED if not found |
| 6 | BUSINESS_RULE_CHECK | Domain rules (no negative stock, valid order quantities, valid portfolio change types, etc.) | BLOCKED if violated |
| 7 | BATCH_READINESS | Summary: is the batch ready to publish? | BLOCKED if any file has issues |

**Severity levels:**
- `PASS` — check passed
- `WARNING` — issue found but not blocking (publish is allowed with warnings)
- `BLOCKED` — must be resolved before batch can be published
- `INFO` — informational only (used when a stage is skipped)

**Publish gate:**
- All 6 required files must be present
- No file can have a BLOCKED validation result
- All 4 masterdata types must have at least one successful upload on record

**Per-file validation status** (stored on `import_batch_files`):
- `PENDING` → `PASS` | `WARNING` | `BLOCKED`
- Stage 7 (batch-level) does NOT affect per-file status — only stages 2–6 determine a file's own status

---

## 8. File Versioning

When a user re-uploads a file of the same type into the same batch:
- The old file's `is_current_version` is set to `0` (kept for audit)
- A new record is created with `upload_version` incremented (v1, v2, v3...)
- Validation runs only on the current version
- The version number is shown in the UI

---

## 9. Baselines

A baseline is created from a PUBLISHED batch. It is:
- Named by the user (e.g. "March 2026 — Board Submission")
- Immutable — the linked batch data must not change after baseline creation
- "Active" — only one baseline is active at a time; creating a new baseline deactivates the previous one
- An audit record — it links to the batch_id, so the underlying data is always traceable

One batch can produce at most one baseline.

---

## 10. Data Model — All Tables and Their Relationships

### 10A. Masterdata Tables (permanent factory configuration)

```
app_settings
  - Key-value config store (planning_horizon_months=18, max_upload_size_mb=50, etc.)
  - No foreign keys
  - Phase 5 will add a UI to edit these

warehouses
  - Physical locations: UKP1 (Gravesend/manufacturing), UKP3 (Rochester), UKP4 (Wakefield), UKP5 (Aberdeen)
  - All 14 filling lines are at UKP1
  - Referenced by: plants, master_stock, demand_plan

plants
  - Manufacturing areas within UKP1: A1, A2, A3, A4, A5
  - Each plant is a group of filling lines sharing space and crew
  - FK → warehouses (warehouse_code)
  - Referenced by: labour_pools, lines, items, plant_resource_requirements, production_orders

pack_types
  - Warehouse capacity categories: SMALL_PACK (1L/2L/5L), 60L, BARREL_200L, IBC
  - Used to group items for warehouse space checking
  - Referenced by: items, warehouse_capacity

labour_pools
  - Groups of filling lines that share a workforce within a plant
  - max_concurrent_lines = physical ceiling (space/equipment) on how many lines can run simultaneously
  - This is NOT a headcount limit — it is a physical constraint
  - FK → plants
  - Referenced by: lines

lines
  - 14 production filling lines (A101, A102... A501, A502)
  - oee_target = Overall Equipment Effectiveness target (default 0.55 = 55%)
  - available_mins_per_day = standard shift length (default 420 = 7 hours)
  - FK → plants, labour_pools
  - Referenced by: line_capacity_calendar, headcount_plan, line_resource_requirements, line_pack_capabilities, item_resource_rules

items
  - Products (SKUs) — must match SAP material numbers exactly
  - item_group_code = planning family (e.g. "4L", "5L") — used to group items for capacity rules
  - pack_size_l = volume in litres (used to convert EA to litres)
  - pack_type_code = which warehouse category this SKU belongs to
  - units_per_pallet = EA per pallet (for stock → pallet conversion for warehouse capacity)
  - sku_status = SAP lifecycle: 1=In Design, 2=Phasing Out, 3=Obsolete
  - moq = minimum order quantity
  - mrp_type = SAP planning type (PD, MK, etc.)
  - FK → plants, pack_types
  - Referenced by: master_stock, demand_plan, portfolio_changes, item_resource_rules, production_orders

resource_types
  - Controlled vocabulary for staff roles
  - scope = LINE (required per line, e.g. Line Operator, Team Leader) or PLANT (shared, e.g. Forklift Driver)
  - standard_hourly_rate = cost per hour (Phase 3 cost calculations)
  - Referenced by: line_resource_requirements, plant_resource_requirements

masterdata_uploads
  - Audit log of every masterdata Excel upload
  - Records: type, filename, row_count, severity, uploaded_by, uploaded_at, stored_file_path
  - Also stores file_content (BLOB) for download
  - version_number per type — incremented on each re-upload
```

### 10B. Capacity & Resource Masterdata (uploaded via Excel)

```
line_pack_capabilities
  - Which pack sizes each line can run, and at what fill speed (bottles/minute)
  - litres_per_minute is NOT stored — computed in view as pack_size_l × bottles_per_minute
  - FK → lines
  - Used by Phase 2 RCCP engine for throughput calculations

line_resource_requirements
  - How many people of each LINE-scope role are needed to run each line
  - e.g. Line A101 requires 3 Line Operators and 1 Team Leader
  - FK → lines, resource_types
  - Phase 2: compared against headcount_plan to flag staffing shortfalls

plant_resource_requirements
  - Shared headcount needed at the plant level regardless of how many lines are running
  - e.g. Plant A1 requires 1 Robot Operator, 2 Forklift Drivers
  - FK → plants, resource_types
  - Phase 2: constrains which lines can run when shared staff are insufficient

warehouse_capacity
  - Maximum pallet positions per pack type per warehouse
  - e.g. UKP1 has 5000 positions for SMALL_PACK
  - FK → warehouses, pack_types
  - Phase 2: compared against stock pallets to flag warehouse space risk

item_resource_rules
  - Standard hours to produce one unit per item group per line
  - e.g. "4L bottles on Line A101 = 0.002 hours per EA"
  - FK → lines (item_group_code on items, not FK)
  - Phase 2 RCCP engine: Required Hours = Demand Quantity × standard_hours_per_unit
```

### 10C. Auth Table

```
users
  - username (unique), hashed_password, role (admin | user), is_active
  - admin: full access including masterdata uploads, user management
  - user: planning workflow only (batch create/upload/validate/publish/baseline)
  - JWT tokens issued on login (HS256, configurable expiry)
```

### 10D. Workflow / Control Tables

```
import_batches
  - One row per planning cycle upload set
  - batch_name, plan_cycle_date (must be 1st of the month), status
  - published_at, published_by recorded on publish
  - Only one batch can be PUBLISHED at a time (enforced in application layer)

import_batch_files
  - One row per file upload per batch
  - upload_version incremented on re-upload; previous version's is_current_version = 0
  - stored_file_path: where the Excel file is stored on the filesystem
  - file_content: BLOB backup of the file (for download without filesystem access)
  - validation_status: PENDING | PASS | WARNING | BLOCKED
  - FK → import_batches (cascade delete)

import_validation_results
  - One row per validation finding (one file upload can have many findings)
  - validation_stage (1–7), stage_name, severity, field_name, row_number, message, sample_value
  - Cleared and re-written on every validation run (not appended)
  - FK → import_batch_files (cascade delete)

plan_versions
  - Named baselines (BASELINE or SNAPSHOT)
  - is_active_baseline: only one active at a time (enforced at application layer)
  - locked_at: timestamp — data must not change after this
  - FK → import_batches (no cascade — baseline must outlive batch status changes)
  - One batch can produce at most one plan version (UNIQUE on batch_id)
```

### 10E. Planning Data Tables (SAP data, scoped to a batch)

All planning data tables have `batch_id` FK → `import_batches`. Data is written on Publish, deleted on Reset.

```
master_stock
  - Stock snapshot per SKU per warehouse per date
  - total_stock_ea: total physical stock (from SAP)
  - free_stock_ea: stock available to commit (after sales order allocations)
  - safety_stock_ea: target minimum stock level
  - sales_allocated_ea is NOT stored — computed in view as (total_stock_ea - free_stock_ea)
  - snapshot_date = plan_cycle_date of the batch (set at import)
  - Key: (batch_id, warehouse_code, item_code, snapshot_date)

production_orders
  - Open production orders from SAP COOIS report
  - order_type: LA (MRP planned/proposed) or YPAC (released/firmed)
  - net_quantity = MAX(0, order_quantity - delivered_quantity) — computed at import
  - production_line: nullable (LA usually has one; YPAC often doesn't)
  - system_status: REL (released), CRTD (created), or NULL (MRP proposal)

demand_plan
  - Monthly demand per SKU per warehouse
  - Stored as monthly; weekly figures derived at query time: demand_quantity / CEILING(days_in_month / 7.0)
  - period_type: MONTHLY (current) — will support WEEKLY when SAP provides it
  - Key: (batch_id, warehouse_code, item_code, period_start_date)

line_capacity_calendar
  - Daily capacity inputs per production line
  - standard_hours, planned_hours, maintenance_hours, public_holiday_hours, planned_downtime_hours, other_loss_hours
  - net_theoretical_hours NOT stored — computed in view as: standard - maintenance - holiday - downtime - other losses
  - Must cover at least 12 months forward (validated at stage 6)
  - Key: (batch_id, line_code, calendar_date)

headcount_plan
  - Planned headcount per line per date
  - planned_headcount, available_hours, shift_code
  - Phase 2: compared against line_resource_requirements to identify shortfalls
  - Key: (batch_id, line_code, plan_date) — shift_code optional

portfolio_changes
  - Product portfolio changes in the planning horizon
  - change_type: NEW_LAUNCH | DISCONTINUE | REFORMULATION | LINE_CHANGE | OTHER
  - item_code: nullable (some changes are plant/line-level, not item-specific)
  - Can have 0 rows (no changes = valid)
```

---

## 11. Database Views (Computed, Never Stored)

These views compute derived values. They are what the RCCP engine will query in Phase 2.

| View | What It Adds |
|------|-------------|
| `vw_master_stock` | `sales_allocated_ea` (= total - free), `free_stock_vs_safety_ea` (headroom above safety stock), `total_stock_litres` (stock × pack_size_l). Joins item and warehouse metadata. |
| `vw_line_capacity_with_net` | `net_theoretical_hours` (= standard - maintenance - holiday - downtime - other losses). Joins line and labour_pool metadata. |
| `vw_line_pack_capabilities` | `litres_per_minute` (= pack_size_l × bottles_per_minute), `effective_mins_per_day` (= available_mins_per_day × oee_target). Only active rows. |
| `vw_batch_file_status` | Per-file status with aggregated BLOCKED/WARNING/INFO counts. Powers the Planning Data screen. |
| `vw_batch_readiness` | One row per batch: `can_publish` flag (1/0), counts of required files uploaded, blocked files, warning files, passed files. |

---

## 12. API Endpoints (Backend)

All endpoints except login and health require a JWT Bearer token.

### Auth
| Method | Path | What It Does |
|--------|------|-------------|
| POST | `/api/auth/login` | Submit username + password → returns `access_token` + `role` |

### Batches
| Method | Path | What It Does |
|--------|------|-------------|
| GET | `/api/batches` | List all batches (newest first) |
| POST | `/api/batches` | Create a new batch (name + plan_cycle_date) |
| GET | `/api/batches/{id}` | Get batch detail + file status + top 3 validation issues per file |
| POST | `/api/batches/{id}/files` | Upload a file into a batch → auto-validates → returns updated status |
| POST | `/api/batches/{id}/validate` | Re-run validation on all current files in the batch |
| POST | `/api/batches/{id}/publish` | Publish the batch (gate-checked; imports data into planning tables) |
| POST | `/api/batches/{id}/reset` | Reset batch to DRAFT (deletes all files and validation results) |

### Templates (Excel download templates for each file type)
| Method | Path | What It Does |
|--------|------|-------------|
| GET | `/api/templates/{file_type}` | Download blank Excel template for any of the 6 batch file types |

### Masterdata
| Method | Path | What It Does |
|--------|------|-------------|
| GET | `/api/masterdata/status` | Last upload info for all 4 masterdata types |
| POST | `/api/masterdata/{type}` | Upload + validate (stages 2–6) + full-replace import |
| GET | `/api/masterdata/{type}/template` | Download blank Excel template for any of the 4 masterdata types |
| GET | `/api/masterdata/{type}/download` | Download the last uploaded file for any of the 4 masterdata types |

### Baselines
| Method | Path | What It Does |
|--------|------|-------------|
| GET | `/api/baselines` | List all baselines |
| POST | `/api/baselines` | Create a named baseline from a PUBLISHED batch |

### System
| Method | Path | What It Does |
|--------|------|-------------|
| GET | `/api/health` | Database connection check |

---

## 13. Screens — Functional Description

### Screen 1: Login Page
- Username + password form
- On success: stores JWT in localStorage, redirects to Planning Data page
- On failure: shows error message
- No registration (users are managed by admin — Phase 5 UI)

### Screen 2: Planning Data Page (Main Screen)
This is the primary working screen. It has several functional zones:

**Zone A: Batch Selector (top)**
- Dropdown listing all batches (name + status + plan_cycle_date)
- "New Batch" button → modal: batch name + plan cycle date (must be 1st of month)
- Selecting a batch loads that batch's file status

**Zone B: Baseline Status Banner (below selector)**
- Green banner: "Active baseline exists: [baseline name]"
- Amber banner: "Batch is published — no baseline created yet"
- No banner if batch is not published

**Zone C: Unified File Table**
The central table shows all 10 rows in two sections:

Section 1 — Required Files (6 rows, in this order):
1. master_stock
2. production_orders
3. demand_plan
4. line_capacity_calendar
5. headcount_plan
6. portfolio_changes

Section 2 — Masterdata (4 rows):
1. line_pack_capabilities
2. line_resource_requirements
3. plant_resource_requirements
4. warehouse_capacity

Shared columns for all 10 rows:
- **File** (file type label)
- **Status** badge: PENDING | PASS | WARNING | BLOCKED (colour-coded)
- **Ver.** (upload version number; for masterdata = row count from last import)
- **Uploaded by** (username)
- **Time** (upload timestamp)
- **Actions** (buttons per row — see below)

Per-row Actions (Required Files):
- Upload button (always available — triggers file picker)
- Template download button (always available — downloads the blank Excel template)
- Inline validation issues (top 3 issues shown, with total issue count)

Per-row Actions (Masterdata):
- Upload button
- Template download button
- Download last uploaded file button
- Row count shown as "version" equivalent

**Zone D: Batch Action Bar (page bottom)**
Four action buttons, conditionally enabled:
- **Re-validate**: re-runs validation on all current files (enabled when files are uploaded)
- **Reset Batch**: deletes all uploaded files and resets batch to DRAFT (always available; confirms before executing)
- **Publish Batch**: enabled only when batch can_publish = 1 (all 6 files present, no BLOCKEDs, all masterdata uploaded)
- **Create Baseline**: enabled only when batch status = PUBLISHED and no baseline exists yet

**Polling:** The page polls every 5 seconds when a batch is active, to update file status after background operations.

---

## 14. User Roles

| Role | Access |
|------|--------|
| `admin` | Full access: all batch operations + masterdata uploads + (future) user management + (future) app settings |
| `user` | Planning workflow: create/manage batches, upload files, validate, publish, create baselines. Cannot manage masterdata uploads (future Phase 5 restriction) |

Currently both roles have full access to all Phase 1 features. Role restriction is prepared for Phase 5.

---

## 15. Business Rules Encoded in the System

These rules are enforced by either the DB schema or the validation pipeline:

| Rule | Where Enforced |
|------|---------------|
| plan_cycle_date must be 1st of the month | DB CHECK constraint |
| Only one PUBLISHED batch at a time | Application layer (on publish, previous PUBLISHED → ARCHIVED) |
| Only one active baseline at a time | Application layer (on create baseline, previous is_active_baseline → 0) |
| One batch → at most one baseline | DB UNIQUE constraint on plan_versions.batch_id |
| Files re-uploads are versioned, not overwritten | Application layer + is_current_version flag |
| Publish requires all 4 masterdata types uploaded | Application layer (publish gate check) |
| free_stock_ea clamped to ≥ 0 at import | Application layer (negative = back-order, stored as 0) |
| demand quantities cannot be negative | Validation stage 6 |
| planned_hours must be 0–24 | Validation stage 6 |
| order_quantity must be > 0 | Validation stage 6 |
| sku_status must be 1, 2, or 3 (or blank) | Validation stage 6 |
| item codes and warehouse codes must exist in masterdata | Validation stage 5 |
| oee_target must be > 0 and ≤ 1 | DB CHECK constraint |
| max_concurrent_lines ≥ 1 | DB CHECK constraint |
| line_capacity_calendar must cover 12+ months forward | (Validation stage 6 — planned, current app_setting) |
| File size ≤ 50 MB | App setting (max_upload_size_mb) |

---

## 16. Key Derived / Computed Values (Never Stored)

These values appear in the UI and RCCP engine outputs but are never stored in base tables:

| Value | Formula | Where Computed |
|-------|---------|---------------|
| `net_theoretical_hours` | standard_hours - maintenance - holiday - downtime - other_losses | View: `vw_line_capacity_with_net` |
| `litres_per_minute` | pack_size_l × bottles_per_minute | View: `vw_line_pack_capabilities` |
| `effective_mins_per_day` | available_mins_per_day × oee_target | View: `vw_line_pack_capabilities` |
| `sales_allocated_ea` | total_stock_ea - free_stock_ea | View: `vw_master_stock` |
| `free_stock_vs_safety_ea` | free_stock_ea - safety_stock_ea | View: `vw_master_stock` |
| `total_stock_litres` | total_stock_ea × pack_size_l | View: `vw_master_stock` |
| `net_quantity` (production orders) | MAX(0, order_quantity - delivered_quantity) | Computed at import (stored in DB) |
| Weekly demand | demand_quantity ÷ CEILING(days_in_month ÷ 7.0) | Query time (monthly stored, weekly derived) |
| `can_publish` | all 6 files present + no BLOCKED issues | View: `vw_batch_readiness` |

---

## 17. Configuration (app_settings Table)

| Key | Default | Meaning |
|-----|---------|---------|
| `planning_horizon_months` | 18 | How many months forward planning data must cover |
| `min_horizon_warn_months` | 12 | Minimum months before a WARNING is issued on capacity calendar |
| `demand_period_type` | MONTHLY | Demand granularity (MONTHLY or WEEKLY) |
| `batch_cycle_day` | 1 | Day of month plan_cycle_date must fall on |
| `upload_base_dir` | uploads | Filesystem path for uploaded files |
| `max_upload_size_mb` | 50 | Max file size per upload |
| `overtime_rate_multiplier` | 1.5 | Cost multiplier for overtime (Phase 3) |
| `additional_shift_rate_multiplier` | 1.25 | Cost multiplier for extra shifts (Phase 3) |
| `app_version` | 1.0.0 | App version string |

---

## 18. File Storage Model

- Uploaded Excel files are stored on the **local filesystem** in the `uploads/` directory relative to the backend
- The file path is stored in the database (`stored_file_path` column)
- The file binary is also stored as a VARBINARY BLOB in the database (`file_content` column) — added as a backup in migration 17
- When users download a masterdata file, the BLOB is served from the database (no filesystem dependency)
- Re-uploads create a new filesystem file AND a new DB record (old file stays on disk, `is_current_version = 0`)

---

## 19. Future Phases (Design Context)

These phases are planned but not yet built. Design should leave room for them:

| Phase | What It Adds |
|-------|-------------|
| Phase 2 | RCCP calculation engine: compares capacity vs demand, flags line risks, calculates labour shortfalls and warehouse space breaches |
| Phase 3 | Scenario modelling: "what if we improve OEE to 65%?", "what if we add a weekend shift?". Cost of additional capacity calculations using hourly rates. |
| Phase 4 | Executive summary dashboards, 12-month staff forecast charts, approval workflow for publishing |
| Phase 5 | Config & masterdata UI (edit lines, items, resource types via the app rather than direct DB scripts), user management screen |

---

## 20. Physical Factory Context (Helps Understand the Data)

- **Site**: All manufacturing at UKP1 (Gravesend). 4 distribution warehouses: UKP1, UKP3 (Rochester), UKP4 (Wakefield), UKP5 (Aberdeen)
- **Plants**: 5 manufacturing areas at UKP1: A1, A2, A3, A4, A5
- **Lines**: 14 filling lines total. Examples: A101, A102 (Plant A1); A201, A202 (Plant A2); A301–A308 (Plant A3); A401 (Plant A4); A501, A502 (Plant A5)
- **Products**: Liquid products in various pack sizes — 1L, 2L, 4L, 5L (Small Pack); 60L drums; 200L barrels (Barrel_200L); IBCs
- **OEE**: Overall Equipment Effectiveness — a manufacturing KPI. Default target 55% (lines run at 55% of theoretical maximum due to changeovers, downtime, etc.)
- **Standard shift**: 420 minutes = 7 hours per day
- **Labour pools**: Groups of lines sharing a workforce. `max_concurrent_lines` = how many in the pool can physically run at the same time
- **MRP types**: SAP planning types. PD = needs planning; MK = consumption-based; ZN = discontinued (ZN items should be filtered before upload)
- **SAP order types**: LA = MRP-generated planned orders (proposals); YPAC = released/firmed orders (real production orders)
