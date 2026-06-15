-- Migration 33: add initial_demand to portfolio_changes
--
-- The portfolio_changes upload has always carried an initial_demand column
-- (validated as required for NEW_LAUNCH rows, and the import INSERT already
-- references it), but the table column was never created. Publishing a
-- portfolio file with 0 data rows hid the gap; a file with any rows would fail.
--
-- Adds the column so the value is persisted and can drive the portfolio
-- changes chart on the Executive Summary (initial demand volume for launches).

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.portfolio_changes') AND name = 'initial_demand'
)
BEGIN
    ALTER TABLE dbo.portfolio_changes ADD initial_demand DECIMAL(18,2) NULL;
    PRINT 'Added portfolio_changes.initial_demand';
END
ELSE
BEGIN
    PRINT 'portfolio_changes.initial_demand already exists — skipped';
END
GO

PRINT 'Migration 33 complete';
GO
