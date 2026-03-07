-- =============================================================================
-- RCCP One — Migration 20: Validation Enhancements
--
-- Changes:
--   1. line_resource_requirements.headcount_required: allow 0 (team leaders can be 0)
--   2. plant_resource_requirements.headcount_required: allow 0
--   3. portfolio_changes: add initial_demand column (required for NEW_LAUNCH rows)
-- =============================================================================

USE RCCP_One;
GO

-- =============================================================================
-- 1. line_resource_requirements — allow headcount_required = 0
--    Previously: CHECK (headcount_required > 0)
--    Now:        CHECK (headcount_required >= 0)   (team leaders may be 0)
-- =============================================================================
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_lrr_headcount'
      AND parent_object_id = OBJECT_ID('dbo.line_resource_requirements')
)
BEGIN
    ALTER TABLE dbo.line_resource_requirements DROP CONSTRAINT CK_lrr_headcount;
    PRINT 'Dropped CK_lrr_headcount from line_resource_requirements';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_lrr_headcount'
      AND parent_object_id = OBJECT_ID('dbo.line_resource_requirements')
)
BEGIN
    ALTER TABLE dbo.line_resource_requirements
        ADD CONSTRAINT CK_lrr_headcount CHECK (headcount_required >= 0);
    PRINT 'Added CK_lrr_headcount (>= 0) to line_resource_requirements';
END
GO

-- =============================================================================
-- 2. plant_resource_requirements — allow headcount_required = 0
--    Previously: CHECK (headcount_required > 0)
--    Now:        CHECK (headcount_required >= 0)
-- =============================================================================
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_prr_headcount'
      AND parent_object_id = OBJECT_ID('dbo.plant_resource_requirements')
)
BEGIN
    ALTER TABLE dbo.plant_resource_requirements DROP CONSTRAINT CK_prr_headcount;
    PRINT 'Dropped CK_prr_headcount from plant_resource_requirements';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_prr_headcount'
      AND parent_object_id = OBJECT_ID('dbo.plant_resource_requirements')
)
BEGIN
    ALTER TABLE dbo.plant_resource_requirements
        ADD CONSTRAINT CK_prr_headcount CHECK (headcount_required >= 0);
    PRINT 'Added CK_prr_headcount (>= 0) to plant_resource_requirements';
END
GO

-- =============================================================================
-- 3. portfolio_changes — add initial_demand column
--    Required (> 0) for NEW_LAUNCH rows; NULL for all other change types.
--    Enforced at application layer (validation stage 6), not by DB constraint,
--    because the requirement is conditional on change_type.
-- =============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.portfolio_changes')
      AND name = 'initial_demand'
)
BEGIN
    ALTER TABLE dbo.portfolio_changes
        ADD initial_demand DECIMAL(18,4) NULL;
    PRINT 'Added initial_demand column to portfolio_changes';
END
ELSE
    PRINT 'initial_demand column already exists on portfolio_changes. Skipped.';
GO

PRINT '=== Migration 20 complete ===';
GO
