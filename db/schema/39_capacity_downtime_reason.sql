-- Migration 39: simplify line_capacity_calendar loss columns to downtime + reason
--
-- The four loss columns (maintenance_hours, public_holiday_hours,
-- planned_downtime_hours, other_loss_hours) were informational only and are
-- replaced by a single downtime_hours + downtime_reason pair. Downtime now
-- SUBTRACTS from capacity in the engine (available = planned_hours - downtime_hours).
--
-- The four old columns are left in place (NOT NULL DEFAULT 0) but deprecated —
-- the importer stops populating them and the engine ignores them. They (and
-- vw_line_capacity_with_net) can be dropped in a later migration.

USE RCCP;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.line_capacity_calendar') AND name = 'downtime_hours'
)
BEGIN
    ALTER TABLE dbo.line_capacity_calendar ADD downtime_hours DECIMAL(8,2) NULL
        CONSTRAINT CK_line_cap_downtime CHECK (downtime_hours IS NULL OR downtime_hours >= 0);
    PRINT 'Added line_capacity_calendar.downtime_hours';
END
ELSE
    PRINT 'line_capacity_calendar.downtime_hours already exists — skipped';
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.line_capacity_calendar') AND name = 'downtime_reason'
)
BEGIN
    ALTER TABLE dbo.line_capacity_calendar ADD downtime_reason NVARCHAR(100) NULL;
    PRINT 'Added line_capacity_calendar.downtime_reason';
END
ELSE
    PRINT 'line_capacity_calendar.downtime_reason already exists — skipped';
GO

PRINT 'Migration 39 complete';
GO
