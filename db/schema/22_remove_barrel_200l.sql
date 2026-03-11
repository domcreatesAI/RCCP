-- =============================================================================
-- RCCP One — Remove BARREL_200L pack type
--
-- Deactivates BARREL_200L (replaced by BARREL).
-- If it is truly unreferenced, also hard-deletes it.
-- Safe to re-run.
-- =============================================================================

USE RCCP_One;
GO

-- Report any references
SELECT 'dbo.items' AS source_table, COUNT(*) AS ref_count
FROM dbo.items
WHERE pack_type_code = 'BARREL_200L'
UNION ALL
SELECT 'dbo.warehouse_capacity', COUNT(*)
FROM dbo.warehouse_capacity
WHERE pack_type_code = 'BARREL_200L';
GO

-- Soft-deactivate first (always safe)
UPDATE dbo.pack_types
SET is_active = 0
WHERE pack_type_code = 'BARREL_200L';
PRINT 'BARREL_200L set is_active = 0.';
GO

-- Hard-delete only if no FK references exist
IF NOT EXISTS (SELECT 1 FROM dbo.items WHERE pack_type_code = 'BARREL_200L')
   AND NOT EXISTS (SELECT 1 FROM dbo.warehouse_capacity WHERE pack_type_code = 'BARREL_200L')
BEGIN
    DELETE FROM dbo.pack_types WHERE pack_type_code = 'BARREL_200L';
    PRINT 'BARREL_200L deleted — no references found.';
END
ELSE
BEGIN
    PRINT 'BARREL_200L has references — kept as inactive row. Fix referencing rows to hard-delete.';
END
GO
