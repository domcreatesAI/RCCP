-- =============================================================================
-- RCCP One — Remove item_status from masterdata_uploads CHECK constraint
--
-- item_status has been merged into item_master (sku_status column).
-- The item_status masterdata upload type no longer exists in the application.
-- This script updates CK_mu_type to remove 'item_status' from the allowed values.
--
-- Safe to re-run — idempotent (drops then recreates the constraint).
-- Existing masterdata_uploads rows with masterdata_type = 'item_status' are
-- not affected (historical records only — no new rows will be inserted).
-- =============================================================================

USE RCCP_One;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_mu_type'
      AND parent_object_id = OBJECT_ID('dbo.masterdata_uploads')
)
BEGIN
    ALTER TABLE dbo.masterdata_uploads DROP CONSTRAINT CK_mu_type;
    PRINT 'Dropped CK_mu_type';
END
GO

-- item_status is retained in the constraint to allow existing historical rows to remain valid.
-- The application no longer inserts new rows with masterdata_type = 'item_status'.
ALTER TABLE dbo.masterdata_uploads
    ADD CONSTRAINT CK_mu_type CHECK (masterdata_type IN (
        'line_pack_capabilities',
        'line_resource_requirements',
        'plant_resource_requirements',
        'warehouse_capacity',
        'item_master',
        'item_status'          -- retained for historical audit rows only
    ));
PRINT 'Recreated CK_mu_type (item_status retained for historical rows)';
GO
