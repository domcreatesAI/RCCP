# RCCP One — Database Scripts

## Run Order

Always run scripts in this exact order. Each script is idempotent (safe to re-run — it checks for existence before creating).

```
1. schema/00_create_database.sql    → Creates the RCCP_One database
2. schema/01_masterdata.sql         → app_settings, plants, labour_pools, lines, items
3. schema/02_workflow.sql           → import_batches, import_batch_files,
                                      import_validation_results, plan_versions
4. schema/03_planning_data.sql      → inventory_snapshots, demand_plan,
                                      line_capacity_calendar, staffing_plan,
                                      oee_daily, portfolio_changes
5. schema/04_views.sql              → vw_line_capacity_with_net,
                                      vw_batch_file_status, vw_batch_readiness
6. schema/05_item_resource_rules.sql → ALTER items (add item_group_code),
                                       ALTER labour_pools (add operators_per_line),
                                       item_resource_rules
7. schema/06_support_staff_pools.sql → support_staff_pools,
                                       support_staff_line_assignments
8. seeds/01_app_settings.sql        → Default configuration values
9. seeds/02_masterdata_sample.sql   → Real plants, lines, items, rules for dev/testing
```

**Note:** Script 00 must be run as `sa` or a sysadmin login. Scripts 01–09 run in the context of `RCCP_One` database.

## How to Run (sqlcmd)

```bat
REM Step 1 — Create database (run as sysadmin)
sqlcmd -S YOUR_SERVER -E -i schema\00_create_database.sql

REM Steps 2–9 — Schema and seeds
sqlcmd -S YOUR_SERVER -d RCCP_One -E -i schema\01_masterdata.sql
sqlcmd -S YOUR_SERVER -d RCCP_One -E -i schema\02_workflow.sql
sqlcmd -S YOUR_SERVER -d RCCP_One -E -i schema\03_planning_data.sql
sqlcmd -S YOUR_SERVER -d RCCP_One -E -i schema\04_views.sql
sqlcmd -S YOUR_SERVER -d RCCP_One -E -i schema\05_item_resource_rules.sql
sqlcmd -S YOUR_SERVER -d RCCP_One -E -i schema\06_support_staff_pools.sql
sqlcmd -S YOUR_SERVER -d RCCP_One -E -i seeds\01_app_settings.sql
sqlcmd -S YOUR_SERVER -d RCCP_One -E -i seeds\02_masterdata_sample.sql
```

Replace `YOUR_SERVER` with your SQL Server instance name (e.g. `localhost`, `.\SQLEXPRESS`, `MYVM\SQLSERVER2019`).

`-E` uses Windows Authentication. If using SQL login: replace with `-U sa -P yourpassword`.

## Table Summary

### Masterdata (lean, Phase 1)
| Table | Purpose |
|-------|---------|
| `plants` | Manufacturing sites |
| `labour_pools` | Shared filling crew groups (`max_concurrent_lines`, `operators_per_line`) |
| `lines` | Production lines, linked to plant and labour pool |
| `items` | Products / SKUs (with `item_group_code` for planning families) |
| `item_resource_rules` | Std hours per unit per item group per line (Phase 2 RCCP input) |
| `support_staff_pools` | Shared support roles (material handlers, forklift drivers) per plant |
| `support_staff_line_assignments` | Which lines each support staff pool serves (many-to-many) |
| `app_settings` | Configurable business rules (horizon months, period type, etc.) |

### Workflow / Control
| Table | Purpose |
|-------|---------|
| `import_batches` | One batch = one planning cycle upload set |
| `import_batch_files` | Each uploaded file (versioned, re-upload supported) |
| `import_validation_results` | Per-file validation findings (7-stage pipeline) |
| `plan_versions` | Named, immutable baselines created from published batches |

### Planning Data
| Table | Purpose |
|-------|---------|
| `inventory_snapshots` | Stock on hand / in transit per item per date |
| `demand_plan` | Monthly (or weekly) demand per item, 12–18 months |
| `line_capacity_calendar` | Daily line availability inputs (losses tracked separately) |
| `staffing_plan` | Planned headcount and hours per line per day |
| `oee_daily` | OEE components per line per day (optional upload) |
| `portfolio_changes` | Product changes within the planning horizon (required, can be empty) |

### Views
| View | Purpose |
|------|---------|
| `vw_line_capacity_with_net` | `line_capacity_calendar` + computed `net_theoretical_hours` + pool info |
| `vw_batch_file_status` | Current file upload status summary per batch |
| `vw_batch_readiness` | Overall batch readiness: blocked count, can_publish flag |

## Key Design Decisions

- **`net_theoretical_hours` is not stored** — it is computed in `vw_line_capacity_with_net` to prevent data consistency issues.
- **Files are stored on the filesystem**, not as BLOBs. Paths are recorded in `import_batch_files.stored_file_path`.
- **Re-uploads** increment `upload_version` and set `is_current_version = 0` on the previous row.
- **`portfolio_changes`** is a required file but 0 data rows is valid (no changes this cycle).
- **`plan_cycle_date`** must always be the 1st of the month (enforced by CHECK constraint).
- **Only one active baseline** at a time — enforced by application logic on `plan_versions.is_active_baseline`.
- **`support_staff_pools` vs `labour_pools`**: `labour_pools` models primary filling crew (operators who run the machines). `support_staff_pools` models shared support roles (material handlers, forklift drivers) that serve multiple lines simultaneously. Both constrain concurrent lines in Phase 2 RCCP.
- **Support staff formula**: `FLOOR(staff_count * lines_per_staff)` = max lines this pool can support. Combined with `max_concurrent_lines` from `labour_pools`, the effective constraint is the minimum.
- **`operators_per_line`** on `labour_pools` is NULL on initial seed — must be populated from manufacturing engineering before Phase 2 calculations.

## Migrations

Schema migrations (after initial deployment) will use Alembic (Python).
Migration scripts go in `db/migrations/`. See backend README for setup.
