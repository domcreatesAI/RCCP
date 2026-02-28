-- =============================================================================
-- RCCP One — Computed Views
-- Run after 03_planning_data.sql
--
-- Views compute derived values that are intentionally NOT stored in base
-- tables to avoid consistency issues.
--
-- Views:
--   vw_line_capacity_with_net     — net theoretical hours per line per day
--   vw_batch_file_status          — file upload status per batch (Planning Data screen)
--   vw_batch_readiness            — can_publish flag per batch
--   vw_master_stock               — stock snapshot with derived sales_allocated_ea
--
-- NOTE: vw_line_pack_capabilities is defined in 07_line_pack_capabilities.sql
--       because it depends on the line_pack_capabilities table created there.
-- =============================================================================

USE RCCP_One;
GO

-- =============================================================================
-- VW_LINE_CAPACITY_WITH_NET
-- Adds computed net_theoretical_hours to line_capacity_calendar rows.
--
-- net_theoretical_hours = standard_hours
--                         - maintenance_hours
--                         - public_holiday_hours
--                         - planned_downtime_hours
--                         - other_loss_hours
--
-- Joins line and labour pool metadata for convenience.
-- Used by the Phase 2 RCCP engine as the starting point for available capacity.
-- =============================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_line_capacity_with_net')
    DROP VIEW dbo.vw_line_capacity_with_net;
GO

CREATE VIEW dbo.vw_line_capacity_with_net
AS
SELECT
    lcc.calendar_id,
    lcc.batch_id,
    lcc.line_code,
    l.line_name,
    l.plant_code,
    l.labour_pool_code,
    lp.pool_name,
    lp.max_concurrent_lines,
    lcc.calendar_date,
    lcc.is_working_day,
    lcc.standard_hours,
    lcc.planned_hours,
    lcc.maintenance_hours,
    lcc.public_holiday_hours,
    lcc.planned_downtime_hours,
    lcc.other_loss_hours,
    -- Hours available after all scheduled losses
    (
        lcc.standard_hours
        - lcc.maintenance_hours
        - lcc.public_holiday_hours
        - lcc.planned_downtime_hours
        - lcc.other_loss_hours
    )                           AS net_theoretical_hours,
    lcc.notes,
    lcc.created_at
FROM
    dbo.line_capacity_calendar lcc
    INNER JOIN dbo.lines l          ON l.line_code = lcc.line_code
    LEFT  JOIN dbo.labour_pools lp  ON lp.pool_code = l.labour_pool_code;
GO

PRINT 'Created view: vw_line_capacity_with_net';
GO

-- =============================================================================
-- VW_BATCH_FILE_STATUS
-- One row per file type per batch (current version only).
-- Aggregates validation issue counts from import_validation_results.
-- Powers the Planning Data screen file status panels.
-- =============================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_batch_file_status')
    DROP VIEW dbo.vw_batch_file_status;
GO

CREATE VIEW dbo.vw_batch_file_status
AS
SELECT
    ib.batch_id,
    ib.batch_name,
    ib.plan_cycle_date,
    ib.status                       AS batch_status,
    ibf.batch_file_id,
    ibf.file_type,
    ibf.original_filename,
    ibf.stored_file_path,
    ibf.file_size_bytes,
    ibf.upload_version,
    ibf.row_count,
    ibf.validation_status,
    ibf.uploaded_by,
    ibf.uploaded_at,
    SUM(CASE WHEN ivr.severity = 'BLOCKED'  THEN 1 ELSE 0 END) AS blocked_count,
    SUM(CASE WHEN ivr.severity = 'WARNING'  THEN 1 ELSE 0 END) AS warning_count,
    SUM(CASE WHEN ivr.severity = 'INFO'     THEN 1 ELSE 0 END) AS info_count
FROM
    dbo.import_batches ib
    LEFT JOIN dbo.import_batch_files ibf
        ON ibf.batch_id = ib.batch_id
        AND ibf.is_current_version = 1
    LEFT JOIN dbo.import_validation_results ivr
        ON ivr.batch_file_id = ibf.batch_file_id
GROUP BY
    ib.batch_id, ib.batch_name, ib.plan_cycle_date, ib.status,
    ibf.batch_file_id, ibf.file_type, ibf.original_filename, ibf.stored_file_path,
    ibf.file_size_bytes, ibf.upload_version, ibf.row_count, ibf.validation_status,
    ibf.uploaded_by, ibf.uploaded_at;
GO

PRINT 'Created view: vw_batch_file_status';
GO

-- =============================================================================
-- VW_BATCH_READINESS
-- One row per batch. Aggregates validation status across all current files.
-- blocked_files > 0 → cannot publish.
-- =============================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_batch_readiness')
    DROP VIEW dbo.vw_batch_readiness;
GO

CREATE VIEW dbo.vw_batch_readiness
AS
SELECT
    ib.batch_id,
    ib.batch_name,
    ib.plan_cycle_date,
    ib.status,
    COUNT(DISTINCT CASE
        WHEN ibf.file_type IN (
            'master_stock', 'demand_plan', 'line_capacity_calendar',
            'staffing_plan', 'portfolio_changes'
        ) AND ibf.is_current_version = 1
        THEN ibf.file_type
    END)                                    AS required_files_uploaded,
    5                                       AS required_files_expected,
    MAX(CASE WHEN ibf.file_type = 'oee_daily' AND ibf.is_current_version = 1
        THEN 1 ELSE 0 END)                  AS oee_uploaded,
    SUM(CASE WHEN ibf.is_current_version = 1 AND ibf.validation_status = 'BLOCKED'
        THEN 1 ELSE 0 END)                  AS blocked_files,
    SUM(CASE WHEN ibf.is_current_version = 1 AND ibf.validation_status = 'WARNING'
        THEN 1 ELSE 0 END)                  AS warning_files,
    SUM(CASE WHEN ibf.is_current_version = 1 AND ibf.validation_status = 'PASS'
        THEN 1 ELSE 0 END)                  AS passed_files,
    CASE
        WHEN COUNT(DISTINCT CASE
            WHEN ibf.file_type IN (
                'master_stock', 'demand_plan', 'line_capacity_calendar',
                'staffing_plan', 'portfolio_changes'
            ) AND ibf.is_current_version = 1
            THEN ibf.file_type END) < 5
        THEN 0
        WHEN SUM(CASE WHEN ibf.is_current_version = 1 AND ibf.validation_status = 'BLOCKED'
            THEN 1 ELSE 0 END) > 0
        THEN 0
        ELSE 1
    END                                     AS can_publish
FROM
    dbo.import_batches ib
    LEFT JOIN dbo.import_batch_files ibf ON ibf.batch_id = ib.batch_id
GROUP BY
    ib.batch_id, ib.batch_name, ib.plan_cycle_date, ib.status;
GO

PRINT 'Created view: vw_batch_readiness';
GO

-- =============================================================================
-- VW_MASTER_STOCK
-- Adds the derived sales_allocated_ea field to master_stock rows.
-- Also joins item metadata (description, pack size, pack type)
-- and warehouse name for convenience.
--
-- sales_allocated_ea = total_stock_ea - free_stock_ea
--   (stock committed to existing sales orders — not available to commit further)
--
-- stock_cover: how many EA of headroom above safety stock.
--   Negative = below safety stock target (highlighted in RCCP).
-- =============================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_master_stock')
    DROP VIEW dbo.vw_master_stock;
GO

CREATE VIEW dbo.vw_master_stock
AS
SELECT
    ms.stock_id,
    ms.batch_id,
    ms.warehouse_code,
    w.warehouse_name,
    ms.item_code,
    i.item_description,
    i.item_type,
    i.item_group_code,
    i.pack_size_l,
    i.pack_type_code,
    i.units_per_pallet,
    i.sku_status,
    ms.snapshot_date,
    ms.mrp_type,
    ms.total_stock_ea,
    ms.free_stock_ea,
    -- Stock committed to sales orders (derived — not stored)
    (ms.total_stock_ea - ms.free_stock_ea)              AS sales_allocated_ea,
    ms.safety_stock_ea,
    -- Headroom above safety stock (negative = below target)
    CASE
        WHEN ms.safety_stock_ea IS NOT NULL
        THEN ms.free_stock_ea - ms.safety_stock_ea
        ELSE NULL
    END                                                 AS free_stock_vs_safety_ea,
    -- Litres equivalent (for higher-level reporting)
    CASE
        WHEN i.pack_size_l IS NOT NULL
        THEN ROUND(ms.total_stock_ea * i.pack_size_l, 2)
        ELSE NULL
    END                                                 AS total_stock_litres,
    ms.source_row_number,
    ms.created_at
FROM
    dbo.master_stock ms
    INNER JOIN dbo.warehouses w ON w.warehouse_code = ms.warehouse_code
    INNER JOIN dbo.items i      ON i.item_code = ms.item_code;
GO

PRINT 'Created view: vw_master_stock';
GO
