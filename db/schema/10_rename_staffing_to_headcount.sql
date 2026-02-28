-- =============================================================================
-- RCCP One — Migration: rename staffing_plan → headcount_plan
-- Run once against the live database.
-- Safe to run: checks existence before acting.
-- =============================================================================

USE RCCP_One;
GO

-- 1. Rename the table
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'staffing_plan')
BEGIN
    EXEC sp_rename 'dbo.staffing_plan', 'headcount_plan';
    PRINT 'Renamed table: staffing_plan → headcount_plan';
END
ELSE
    PRINT 'Table staffing_plan not found — skipped (may already be renamed).';
GO

-- 2. Rename primary key constraint
IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'PK_staffing_plan')
BEGIN
    EXEC sp_rename 'dbo.PK_staffing_plan', 'PK_headcount_plan', 'OBJECT';
    PRINT 'Renamed PK: PK_staffing_plan → PK_headcount_plan';
END
GO

-- 3. Rename foreign key constraints
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_staffing_plan_batch')
BEGIN
    EXEC sp_rename 'dbo.FK_staffing_plan_batch', 'FK_headcount_plan_batch', 'OBJECT';
    PRINT 'Renamed FK: FK_staffing_plan_batch → FK_headcount_plan_batch';
END
GO

IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_staffing_plan_line')
BEGIN
    EXEC sp_rename 'dbo.FK_staffing_plan_line', 'FK_headcount_plan_line', 'OBJECT';
    PRINT 'Renamed FK: FK_staffing_plan_line → FK_headcount_plan_line';
END
GO

-- 4. Rename check constraints
IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_staffing_plan_headcount')
BEGIN
    EXEC sp_rename 'dbo.CK_staffing_plan_headcount', 'CK_headcount_plan_headcount', 'OBJECT';
    PRINT 'Renamed CK: CK_staffing_plan_headcount → CK_headcount_plan_headcount';
END
GO

IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_staffing_plan_hours')
BEGIN
    EXEC sp_rename 'dbo.CK_staffing_plan_hours', 'CK_headcount_plan_hours', 'OBJECT';
    PRINT 'Renamed CK: CK_staffing_plan_hours → CK_headcount_plan_hours';
END
GO

-- 5. Rename indexes
IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_staffing_batch_line')
BEGIN
    EXEC sp_rename 'dbo.headcount_plan.IX_staffing_batch_line', 'IX_headcount_batch_line', 'INDEX';
    PRINT 'Renamed index: IX_staffing_batch_line → IX_headcount_batch_line';
END
GO

IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_staffing_batch_date')
BEGIN
    EXEC sp_rename 'dbo.headcount_plan.IX_staffing_batch_date', 'IX_headcount_batch_date', 'INDEX';
    PRINT 'Renamed index: IX_staffing_batch_date → IX_headcount_batch_date';
END
GO

-- 6. Update the file_type CHECK constraint on import_batch_files
--    (drop old, add new with headcount_plan)
IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_import_batch_files_type')
BEGIN
    ALTER TABLE dbo.import_batch_files DROP CONSTRAINT CK_import_batch_files_type;
    PRINT 'Dropped old CK_import_batch_files_type constraint.';
END
GO

ALTER TABLE dbo.import_batch_files
ADD CONSTRAINT CK_import_batch_files_type CHECK (
    file_type IN (
        'master_stock',
        'demand_plan',
        'line_capacity_calendar',
        'headcount_plan',
        'oee_daily',
        'portfolio_changes'
    )
);
PRINT 'Added updated CK_import_batch_files_type constraint (headcount_plan).';
GO

PRINT '=== Migration 10 complete: staffing_plan renamed to headcount_plan ===';
GO
