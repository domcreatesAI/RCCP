-- =============================================================================
-- RCCP One — Add oee_target to line_pack_capabilities + update view
--
-- Change: OEE is now supplied per line per pack size combination via the
-- line_pack_capabilities masterdata upload, rather than as a per-batch
-- oee_daily file. This allows more granular OEE targets (e.g. small packs
-- run at 65% OEE, large packs at 75% OEE on the same line).
--
-- The column is nullable. If NULL, vw_line_pack_capabilities falls back to
-- lines.oee_target (the line-level default, currently 0.55 for all lines).
--
-- Safe to re-run — all sections are idempotent.
--
-- NOTE: The ADD COLUMN and ADD CONSTRAINT steps are intentionally in separate
-- batches (separated by GO). SQL Server precompiles each batch, so if the
-- column and constraint were in the same batch the column name would not yet
-- be resolvable during compilation.
-- =============================================================================

USE RCCP_One;
GO

-- ---------------------------------------------------------------------------
-- 1a. Add oee_target column (nullable)
--     This batch must complete before the CHECK constraint batch runs.
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.line_pack_capabilities') AND name = 'oee_target'
)
BEGIN
    ALTER TABLE dbo.line_pack_capabilities
        ADD oee_target DECIMAL(5,4) NULL;
    PRINT 'Added column: line_pack_capabilities.oee_target';
END
ELSE
    PRINT 'Column line_pack_capabilities.oee_target already exists. Skipped.';
GO

-- ---------------------------------------------------------------------------
-- 1b. Add CHECK constraint — separate batch so oee_target is known at compile time
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_lpc_oee'
      AND parent_object_id = OBJECT_ID('dbo.line_pack_capabilities')
)
BEGIN
    ALTER TABLE dbo.line_pack_capabilities
        ADD CONSTRAINT CK_lpc_oee
            CHECK (oee_target IS NULL OR (oee_target > 0 AND oee_target <= 1));
    PRINT 'Added constraint: CK_lpc_oee';
END
ELSE
    PRINT 'Constraint CK_lpc_oee already exists. Skipped.';
GO

-- ---------------------------------------------------------------------------
-- 2. Recreate vw_line_pack_capabilities to use per-capability OEE
--    with fallback to lines.oee_target when capability oee_target is NULL.
-- ---------------------------------------------------------------------------
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_line_pack_capabilities')
    DROP VIEW dbo.vw_line_pack_capabilities;
GO

CREATE VIEW dbo.vw_line_pack_capabilities
AS
SELECT
    lpc.capability_id,
    lpc.line_code,
    l.line_name,
    l.plant_code,
    l.labour_pool_code,
    -- Per-capability OEE with fallback to line-level default
    COALESCE(lpc.oee_target, l.oee_target)                                          AS oee_target,
    l.available_mins_per_day,
    lpc.pack_size_l,
    lpc.bottles_per_minute,
    -- Litres per minute: derived from pack size × bottle speed
    ROUND(lpc.pack_size_l * lpc.bottles_per_minute, 4)                              AS litres_per_minute,
    -- Effective minutes after OEE adjustment (uses capability OEE if set, else line default)
    ROUND(l.available_mins_per_day * COALESCE(lpc.oee_target, l.oee_target), 2)     AS effective_mins_per_day,
    lpc.is_active,
    lpc.updated_at,
    lpc.updated_by
FROM
    dbo.line_pack_capabilities lpc
    INNER JOIN dbo.lines l ON l.line_code = lpc.line_code
WHERE
    lpc.is_active = 1;
GO

PRINT 'Recreated view: vw_line_pack_capabilities (with per-capability oee_target)';
GO
