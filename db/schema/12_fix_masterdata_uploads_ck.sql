-- =============================================================================
-- RCCP One — Fix masterdata_uploads CK_mu_type constraint
-- Run this if item_status uploads are showing Blocked / Internal Server Error.
--
-- Problem: the masterdata_uploads table may have been created before item_status
-- was added to the CK_mu_type check constraint. The IF NOT EXISTS guard in
-- script 11 means re-running that script won't update an already-existing table.
--
-- This script drops and recreates CK_mu_type to include item_status.
-- Safe to re-run — both sections are idempotent.
-- =============================================================================

USE RCCP_One;
GO

-- Create the table if it was never created by script 11
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'masterdata_uploads')
BEGIN
    CREATE TABLE dbo.masterdata_uploads (
        upload_id           INT             IDENTITY(1,1)   NOT NULL,
        masterdata_type     VARCHAR(50)     NOT NULL,
        original_filename   VARCHAR(255)    NOT NULL,
        row_count           INT             NULL,
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

    PRINT 'Created table: masterdata_uploads (with item_status in constraint)';
END
ELSE
BEGIN
    PRINT 'Table masterdata_uploads already exists — updating CK_mu_type constraint.';

    -- Drop existing constraint if present
    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = 'CK_mu_type'
          AND parent_object_id = OBJECT_ID('dbo.masterdata_uploads')
    )
    BEGIN
        ALTER TABLE dbo.masterdata_uploads DROP CONSTRAINT CK_mu_type;
        PRINT 'Dropped old CK_mu_type.';
    END

    -- Recreate with all 6 types including item_status
    ALTER TABLE dbo.masterdata_uploads
        ADD CONSTRAINT CK_mu_type CHECK (masterdata_type IN (
            'line_pack_capabilities',
            'line_resource_requirements',
            'plant_resource_requirements',
            'warehouse_capacity',
            'item_master',
            'item_status'
        ));

    PRINT 'Recreated CK_mu_type — item_status now included.';
END
GO
