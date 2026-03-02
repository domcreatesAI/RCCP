-- =============================================================================
-- RCCP One — Remove oee_daily
--
-- oee_daily was an optional planning file that was never fully implemented
-- (no validation schema, no template, no frontend row). This migration removes
-- all traces from the database.
--
-- Changes:
--   1. Drop dbo.oee_daily table
--   2. Remove 'oee_daily' from CK_import_batch_files_type CHECK constraint
--   3. Recreate vw_batch_readiness without the oee_uploaded column
--   4. Delete the oee_missing_severity app_settings row
--
-- Safe to re-run — idempotent throughout.
-- =============================================================================

USE RCCP_One;
GO

-- =============================================================================
-- 1. Drop oee_daily table
-- =============================================================================
DROP TABLE IF EXISTS dbo.oee_daily;
PRINT 'Dropped table: oee_daily (or did not exist)';
GO

-- =============================================================================
-- 2. Update CK_import_batch_files_type — remove 'oee_daily'
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
            'portfolio_changes'
        )
    );
PRINT 'Recreated CK_import_batch_files_type (oee_daily removed)';
GO

-- =============================================================================
-- 3. Recreate vw_batch_readiness — remove oee_uploaded column
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
            'headcount_plan', 'portfolio_changes'
        ) AND ibf.is_current_version = 1
        THEN ibf.file_type
    END)                                    AS required_files_uploaded,
    5                                       AS required_files_expected,
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
                'headcount_plan', 'portfolio_changes'
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

PRINT 'Recreated view: vw_batch_readiness (oee_uploaded column removed)';
GO

-- =============================================================================
-- 4. Remove oee_missing_severity from app_settings
-- =============================================================================
DELETE FROM dbo.app_settings WHERE setting_key = 'oee_missing_severity';
PRINT 'Deleted app_settings row: oee_missing_severity';
GO

PRINT '=== Migration 16 complete: oee_daily removed ===';
GO
