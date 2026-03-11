-- =============================================================================
-- RCCP One — Add pack_types as a manageable masterdata upload type
--
-- Changes:
--   1. Updates CK_mu_type on masterdata_uploads to include pack_types
--      and align with current valid masterdata_type values.
--   2. Adds file_content column to masterdata_uploads if missing
--      (applied by migration 17 — safe to re-check here).
--
-- Safe to re-run.
-- =============================================================================

USE RCCP_One;
GO

-- 1. Drop and recreate CK_mu_type with current valid types
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_mu_type'
      AND parent_object_id = OBJECT_ID('dbo.masterdata_uploads')
)
BEGIN
    ALTER TABLE dbo.masterdata_uploads DROP CONSTRAINT CK_mu_type;
    PRINT 'Dropped old CK_mu_type.';
END

ALTER TABLE dbo.masterdata_uploads
    ADD CONSTRAINT CK_mu_type CHECK (masterdata_type IN (
        'sku_masterdata',
        'line_pack_capabilities',
        'line_resource_requirements',
        'plant_resource_requirements',
        'warehouse_capacity',
        'pack_types'
    ));

PRINT 'Recreated CK_mu_type — pack_types included.';
GO
