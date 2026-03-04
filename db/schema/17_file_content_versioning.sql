-- Migration 17: Add file content BLOB storage and version tracking
-- Run against an existing deployment (idempotent).
--
-- masterdata_uploads:
--   version_number  INT            -- sequential per masterdata_type (1, 2, 3 ...)
--   file_content    VARBINARY(MAX) -- raw Excel bytes; enables download without filesystem
--
-- import_batch_files:
--   file_content    VARBINARY(MAX) -- raw Excel bytes; enables reliable download
--
-- stored_file_path columns are retained for backwards compatibility and because
-- the batch-file validation/publish pipeline still reads from the filesystem path.
-- Going forward:
--   - masterdata uploads are stored in DB only (no filesystem write).
--   - batch file uploads write to filesystem (needed for validation/publish) AND store in DB.
--   - all downloads read file_content from DB; fall back to stored_file_path for pre-migration rows.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.masterdata_uploads') AND name = 'version_number'
)
BEGIN
    ALTER TABLE dbo.masterdata_uploads ADD version_number INT NULL;
    PRINT 'Added version_number to masterdata_uploads.';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.masterdata_uploads') AND name = 'file_content'
)
BEGIN
    ALTER TABLE dbo.masterdata_uploads ADD file_content VARBINARY(MAX) NULL;
    PRINT 'Added file_content to masterdata_uploads.';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.import_batch_files') AND name = 'file_content'
)
BEGIN
    ALTER TABLE dbo.import_batch_files ADD file_content VARBINARY(MAX) NULL;
    PRINT 'Added file_content to import_batch_files.';
END
GO

PRINT 'Migration 17 complete.';
GO
