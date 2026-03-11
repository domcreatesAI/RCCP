-- =============================================================================
-- RCCP One — SKU Masterdata Redesign
-- Migration 20
--
-- Changes:
--   1. items — make plant_code nullable (SKU master is now the source of truth,
--              not inferred from master_stock)
--   2. items — add abc_indicator, unit_cost
--   3. items — add primary/secondary/tertiary/quaternary line assignments
--   4. masterdata_uploads — add 'sku_masterdata' to CK_mu_type constraint
--
-- Workflow impact:
--   - Upload sku_masterdata (5th masterdata type) BEFORE uploading batch files.
--     sku_masterdata populates dbo.items via MERGE (upsert by item_code).
--   - master_stock batch file is now a pure stock snapshot:
--     material, plant, unrestrictedstock, unrestricted_-_sales, safety_stock.
--     SKU attributes (pack_type, volume, rounding_value, moq, mrp_type etc.)
--     are no longer read from master_stock — they come from sku_masterdata.
--   - MB52 is deferred — unit_cost lives on items and is populated by
--     sku_masterdata (manual) until a dedicated MB52 upload is built.
-- =============================================================================

USE RCCP_One;
GO

-- =============================================================================
-- 1. items.plant_code — make nullable
--    Previously NOT NULL; SKU masterdata upload sets this, but a SKU may exist
--    before a plant is assigned.
-- =============================================================================

-- Drop FK first (required before altering the column)
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_items_plant'
      AND parent_object_id = OBJECT_ID('dbo.items')
)
BEGIN
    ALTER TABLE dbo.items DROP CONSTRAINT FK_items_plant;
    PRINT 'Dropped constraint: FK_items_plant';
END
ELSE
    PRINT 'Constraint FK_items_plant not found — skipped.';
GO

-- Alter column to allow NULL
ALTER TABLE dbo.items ALTER COLUMN plant_code VARCHAR(20) NULL;
PRINT 'Altered items.plant_code to allow NULL.';
GO

-- Re-add FK (now nullable — no action on delete)
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_items_plant'
      AND parent_object_id = OBJECT_ID('dbo.items')
)
BEGIN
    ALTER TABLE dbo.items ADD CONSTRAINT FK_items_plant
        FOREIGN KEY (plant_code) REFERENCES dbo.plants (plant_code)
        ON UPDATE CASCADE
        ON DELETE NO ACTION;
    PRINT 'Re-added constraint: FK_items_plant (nullable).';
END
ELSE
    PRINT 'Constraint FK_items_plant already exists — skipped.';
GO

-- =============================================================================
-- 2. items.abc_indicator
--    SAP ABC classification (A, B, C, or '#' for not classified).
-- =============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.items') AND name = 'abc_indicator'
)
BEGIN
    ALTER TABLE dbo.items ADD abc_indicator VARCHAR(5) NULL;
    PRINT 'Added column: items.abc_indicator';
END
ELSE
    PRINT 'Column items.abc_indicator already exists. Skipped.';
GO

-- =============================================================================
-- 3. items.unit_cost
--    Standard cost per EA in GBP. Populated by sku_masterdata upload.
--    Defers need for MB52 batch file — can be filled manually for now.
-- =============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.items') AND name = 'unit_cost'
)
BEGIN
    ALTER TABLE dbo.items ADD unit_cost DECIMAL(18, 4) NULL;
    PRINT 'Added column: items.unit_cost';
END
ELSE
    PRINT 'Column items.unit_cost already exists. Skipped.';
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.items') AND name = 'CK_items_unit_cost'
)
BEGIN
    ALTER TABLE dbo.items ADD CONSTRAINT CK_items_unit_cost CHECK (unit_cost IS NULL OR unit_cost >= 0);
    PRINT 'Added constraint: CK_items_unit_cost';
END
ELSE
    PRINT 'Constraint CK_items_unit_cost already exists. Skipped.';
GO

-- =============================================================================
-- 4. items — line assignments (primary through quaternary)
--    A SKU may be runnable on up to 4 lines. primary = preferred, others = capable.
--    All nullable — not all SKUs have a designated line at the time of masterdata load.
-- =============================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.items') AND name = 'primary_line_code'
)
BEGIN
    ALTER TABLE dbo.items ADD primary_line_code VARCHAR(20) NULL;
    PRINT 'Added column: items.primary_line_code';
END
ELSE
    PRINT 'Column items.primary_line_code already exists. Skipped.';
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.items') AND name = 'secondary_line_code'
)
BEGIN
    ALTER TABLE dbo.items ADD secondary_line_code VARCHAR(20) NULL;
    PRINT 'Added column: items.secondary_line_code';
END
ELSE
    PRINT 'Column items.secondary_line_code already exists. Skipped.';
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.items') AND name = 'tertiary_line_code'
)
BEGIN
    ALTER TABLE dbo.items ADD tertiary_line_code VARCHAR(20) NULL;
    PRINT 'Added column: items.tertiary_line_code';
END
ELSE
    PRINT 'Column items.tertiary_line_code already exists. Skipped.';
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.items') AND name = 'quaternary_line_code'
)
BEGIN
    ALTER TABLE dbo.items ADD quaternary_line_code VARCHAR(20) NULL;
    PRINT 'Added column: items.quaternary_line_code';
END
ELSE
    PRINT 'Column items.quaternary_line_code already exists. Skipped.';
GO

-- FKs for line assignments (all nullable — no cascade)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_items_primary_line' AND parent_object_id = OBJECT_ID('dbo.items'))
BEGIN
    ALTER TABLE dbo.items ADD CONSTRAINT FK_items_primary_line
        FOREIGN KEY (primary_line_code) REFERENCES dbo.lines (line_code)
        ON UPDATE NO ACTION ON DELETE NO ACTION;
    PRINT 'Added FK: FK_items_primary_line';
END
ELSE PRINT 'FK_items_primary_line already exists. Skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_items_secondary_line' AND parent_object_id = OBJECT_ID('dbo.items'))
BEGIN
    ALTER TABLE dbo.items ADD CONSTRAINT FK_items_secondary_line
        FOREIGN KEY (secondary_line_code) REFERENCES dbo.lines (line_code)
        ON UPDATE NO ACTION ON DELETE NO ACTION;
    PRINT 'Added FK: FK_items_secondary_line';
END
ELSE PRINT 'FK_items_secondary_line already exists. Skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_items_tertiary_line' AND parent_object_id = OBJECT_ID('dbo.items'))
BEGIN
    ALTER TABLE dbo.items ADD CONSTRAINT FK_items_tertiary_line
        FOREIGN KEY (tertiary_line_code) REFERENCES dbo.lines (line_code)
        ON UPDATE NO ACTION ON DELETE NO ACTION;
    PRINT 'Added FK: FK_items_tertiary_line';
END
ELSE PRINT 'FK_items_tertiary_line already exists. Skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_items_quaternary_line' AND parent_object_id = OBJECT_ID('dbo.items'))
BEGIN
    ALTER TABLE dbo.items ADD CONSTRAINT FK_items_quaternary_line
        FOREIGN KEY (quaternary_line_code) REFERENCES dbo.lines (line_code)
        ON UPDATE NO ACTION ON DELETE NO ACTION;
    PRINT 'Added FK: FK_items_quaternary_line';
END
ELSE PRINT 'FK_items_quaternary_line already exists. Skipped.';
GO

-- =============================================================================
-- 5. masterdata_uploads — add 'sku_masterdata' to CK_mu_type constraint
-- =============================================================================

-- Drop existing constraint
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_mu_type'
      AND parent_object_id = OBJECT_ID('dbo.masterdata_uploads')
)
BEGIN
    ALTER TABLE dbo.masterdata_uploads DROP CONSTRAINT CK_mu_type;
    PRINT 'Dropped old CK_mu_type.';
END
GO

-- Recreate with sku_masterdata included
ALTER TABLE dbo.masterdata_uploads
    ADD CONSTRAINT CK_mu_type CHECK (masterdata_type IN (
        'line_pack_capabilities',
        'line_resource_requirements',
        'plant_resource_requirements',
        'warehouse_capacity',
        'sku_masterdata',
        'item_master',
        'item_status'
    ));
PRINT 'Recreated CK_mu_type — sku_masterdata now included.';
GO

PRINT '=== Migration 20 complete ===';
GO
