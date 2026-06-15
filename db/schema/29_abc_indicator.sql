-- Migration 29: ABC indicator per item + app_settings default
--
-- Adds items.abc_indicator (populated on every master_stock upload).
-- Adds the included_abc_indicators setting (comma-separated list of codes
-- that contribute to RCCP capacity calculations).
-- Default = A,B,C,G,L  — excludes F (Finance block), T (Temp unavail), X (Discontinued)

-- 1. Add column to items
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.items') AND name = 'abc_indicator'
)
BEGIN
    ALTER TABLE dbo.items ADD abc_indicator VARCHAR(1) NULL;
    PRINT 'Added items.abc_indicator';
END
ELSE
BEGIN
    PRINT 'items.abc_indicator already exists — skipped';
END
GO

-- 2. Seed the setting (safe to re-run: MERGE won't duplicate)
MERGE dbo.app_settings AS t
USING (SELECT 'included_abc_indicators' AS k, 'A,B,C,G,L' AS v) AS s
    ON t.setting_key = s.k
WHEN NOT MATCHED THEN
    INSERT (setting_key, setting_value) VALUES (s.k, s.v);
GO

PRINT 'Migration 29 complete';
