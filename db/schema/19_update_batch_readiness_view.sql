-- =============================================================================
-- RCCP One — Add production_orders as 6th required batch file
--
-- Changes:
--   1. Update CK_import_batch_files_type — add 'production_orders'
--   2. Recreate vw_batch_readiness — 5 → 6 required files, add 'production_orders'
--      to file_type IN lists and required_files_expected / threshold
-- =============================================================================

USE RCCP_One;
GO

-- =============================================================================
-- 1. Update CK_import_batch_files_type — add 'production_orders'
-- =============================================================================
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_import_batch_files_type'
      AND parent_object_id = OBJECT_ID('dbo.import_batch_files')
)
BEGIN
    ALTER TABLE dbo.import_batch_files DROP CONSTRAINT CK_import_batch_files_type;
    PRINT 'Dropped CK_import_batch_files_type';
END
GO

ALTER TABLE dbo.import_batch_files
    ADD CONSTRAINT CK_import_batch_files_type CHECK (
        file_type IN (
            'master_stock',
            'demand_plan',
            'line_capacity_calendar',
            'headcount_plan',
            'portfolio_changes',
            'production_orders'
        )
    );
PRINT 'Recreated CK_import_batch_files_type (production_orders added)';
GO

-- =============================================================================
-- 2. Recreate vw_batch_readiness — 6 required files
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
            'headcount_plan', 'portfolio_changes', 'production_orders'
        ) AND ibf.is_current_version = 1
        THEN ibf.file_type
    END)                                    AS required_files_uploaded,
    6                                       AS required_files_expected,
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
                'headcount_plan', 'portfolio_changes', 'production_orders'
            ) AND ibf.is_current_version = 1
            THEN ibf.file_type END) < 6
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

PRINT 'Recreated view: vw_batch_readiness (production_orders added, 6 required files)';
GO

PRINT '=== Migration 19 complete ===';
GO
