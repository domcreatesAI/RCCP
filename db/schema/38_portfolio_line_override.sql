-- Migration 38: add line_code override to portfolio_changes
--
-- Portfolio changes are now a SKU-level *flag list* that selects the SKUs being
-- phased in / out. Their monthly volume & hours are derived from the production
-- plan (production_orders) for information only.
--
-- The SKU normally routes to a line via items.primary_line_code. line_code here
-- is an OPTIONAL override — for a launch on a line the SKU is not yet routed to,
-- or a line-level change. When blank, the engine falls back to the SKU routing.
--
-- initial_demand (migration 33) is now DEPRECATED and unused — left in place to
-- avoid data loss; removable in a later migration.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.portfolio_changes') AND name = 'line_code'
)
BEGIN
    ALTER TABLE dbo.portfolio_changes ADD line_code VARCHAR(50) NULL;
    PRINT 'Added portfolio_changes.line_code';
END
ELSE
BEGIN
    PRINT 'portfolio_changes.line_code already exists — skipped';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_portfolio_changes_line'
)
BEGIN
    ALTER TABLE dbo.portfolio_changes
        ADD CONSTRAINT FK_portfolio_changes_line FOREIGN KEY (line_code)
            REFERENCES dbo.lines (line_code)
            ON UPDATE NO ACTION ON DELETE NO ACTION;
    PRINT 'Added FK_portfolio_changes_line';
END
ELSE
BEGIN
    PRINT 'FK_portfolio_changes_line already exists — skipped';
END
GO

PRINT 'Migration 38 complete';
GO
