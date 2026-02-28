-- =============================================================================
-- RCCP One — Masterdata Upload Tracking + Items Schema Extensions
-- Run after 01_masterdata.sql
--
-- Changes:
--   1. masterdata_uploads   — tracks every masterdata file upload (type, who, when)
--   2. items.moq            — minimum order quantity (from SAP item master report)
--   3. items.mrp_type       — MRP planning type (from SAP item master report, not stock snapshot)
--
-- NOTE: items.moq and items.mrp_type are populated by the item_master masterdata
--       upload. They are NOT included in the master_stock batch snapshot.
--       master_stock.mrp_type remains in that table for backwards compatibility
--       but will be left NULL going forward (data comes from item_master instead).
-- =============================================================================

USE RCCP_One;
GO

-- =============================================================================
-- MASTERDATA_UPLOADS
-- Audit trail for all masterdata file uploads.
-- One row per upload event, per masterdata type.
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'masterdata_uploads')
BEGIN
    CREATE TABLE dbo.masterdata_uploads (
        upload_id           INT             IDENTITY(1,1)   NOT NULL,
        masterdata_type     VARCHAR(50)     NOT NULL,           -- e.g. line_pack_capabilities
        original_filename   VARCHAR(255)    NOT NULL,
        row_count           INT             NULL,               -- rows imported (NULL if upload failed validation)
        uploaded_at         DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),
        uploaded_by         VARCHAR(100)    NULL,

        CONSTRAINT PK_masterdata_uploads    PRIMARY KEY (upload_id),
        CONSTRAINT CK_mu_type               CHECK (masterdata_type IN (
            'line_pack_capabilities',
            'line_resource_requirements',
            'plant_resource_requirements',
            'warehouse_capacity',
            'item_master',
            'item_status'
        ))
    );

    CREATE INDEX IX_mu_type ON dbo.masterdata_uploads (masterdata_type);
    CREATE INDEX IX_mu_uploaded_at ON dbo.masterdata_uploads (uploaded_at DESC);

    PRINT 'Created table: masterdata_uploads';
END
ELSE
    PRINT 'Table masterdata_uploads already exists. Skipped.';
GO

-- =============================================================================
-- ITEMS — add moq column
-- Minimum Order Quantity from SAP item master.
-- Populated by item_master masterdata upload (not batch-scoped).
-- =============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.items') AND name = 'moq'
)
BEGIN
    ALTER TABLE dbo.items ADD moq DECIMAL(18,4) NULL;
    PRINT 'Added column: items.moq';
END
ELSE
    PRINT 'Column items.moq already exists. Skipped.';
GO

-- CHECK constraint in a separate batch so SQL Server can resolve the column name
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.items') AND name = 'CK_items_moq'
)
BEGIN
    ALTER TABLE dbo.items ADD CONSTRAINT CK_items_moq CHECK (moq IS NULL OR moq > 0);
    PRINT 'Added constraint: CK_items_moq';
END
ELSE
    PRINT 'Constraint CK_items_moq already exists. Skipped.';
GO

-- =============================================================================
-- ITEMS — add mrp_type column
-- SAP MRP planning type (e.g. PD, VB, ND).
-- Comes from item master SAP report, not the stock snapshot.
-- master_stock.mrp_type remains for backwards compatibility but is no longer
-- populated once item_master uploads are in use.
-- =============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.items') AND name = 'mrp_type'
)
BEGIN
    ALTER TABLE dbo.items
        ADD mrp_type VARCHAR(10) NULL;

    PRINT 'Added column: items.mrp_type';
END
ELSE
    PRINT 'Column items.mrp_type already exists. Skipped.';
GO
