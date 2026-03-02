-- =============================================================================
-- RCCP One — Add stored_file_path to masterdata_uploads
--
-- Enables the GET /api/masterdata/{type}/download endpoint by persisting
-- the server-side file path of each successful masterdata upload.
--
-- Safe to re-run — idempotent.
-- =============================================================================

USE RCCP_One;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.masterdata_uploads') AND name = 'stored_file_path'
)
BEGIN
    ALTER TABLE dbo.masterdata_uploads
        ADD stored_file_path NVARCHAR(500) NULL;
    PRINT 'Added column: masterdata_uploads.stored_file_path';
END
ELSE
    PRINT 'Column masterdata_uploads.stored_file_path already exists. Skipped.';
GO
