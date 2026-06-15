-- Migration 32: allow headcount_required = 0 on resource requirement tables
--
-- The completeness check requires every active line to have a row for every
-- LINE-scope role (and every plant for every PLANT-scope role). A line that
-- needs no team leader or no palletiser still needs a row, with headcount = 0.
-- The original CHECK constraints used (> 0), which rejected those 0 rows and
-- caused the import to fail with a 500 after validation had already passed.
--
-- Change both constraints from (> 0) to (>= 0).

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_lrr_headcount')
BEGIN
    ALTER TABLE dbo.line_resource_requirements DROP CONSTRAINT CK_lrr_headcount;
    PRINT 'Dropped CK_lrr_headcount';
END
GO
ALTER TABLE dbo.line_resource_requirements
    ADD CONSTRAINT CK_lrr_headcount CHECK (headcount_required >= 0);
PRINT 'Re-added CK_lrr_headcount as (>= 0)';
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_prr_headcount')
BEGIN
    ALTER TABLE dbo.plant_resource_requirements DROP CONSTRAINT CK_prr_headcount;
    PRINT 'Dropped CK_prr_headcount';
END
GO
ALTER TABLE dbo.plant_resource_requirements
    ADD CONSTRAINT CK_prr_headcount CHECK (headcount_required >= 0);
PRINT 'Re-added CK_prr_headcount as (>= 0)';
GO

PRINT 'Migration 32 complete — headcount_required may now be 0';
GO
