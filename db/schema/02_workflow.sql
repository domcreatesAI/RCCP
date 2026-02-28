-- =============================================================================
-- RCCP One — Workflow & Control Tables
-- Run after 01_masterdata.sql
-- Tables: import_batches, import_batch_files, import_validation_results,
--         plan_versions
-- =============================================================================

USE RCCP_One;
GO

-- =============================================================================
-- IMPORT_BATCHES
-- Top-level entity for a planning upload cycle.
-- One batch = one set of planning files for one planning month.
-- plan_cycle_date must always be the first day of the month (enforced by app).
--
-- Status flow: DRAFT → VALIDATING → VALIDATED → PUBLISHED → ARCHIVED
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'import_batches')
BEGIN
    CREATE TABLE dbo.import_batches (
        batch_id            INT             IDENTITY(1,1)   NOT NULL,
        batch_name          VARCHAR(200)    NOT NULL,
        plan_cycle_date     DATE            NOT NULL,       -- Always 1st of the month
        status              VARCHAR(20)     NOT NULL        DEFAULT 'DRAFT',
        notes               NVARCHAR(1000)  NULL,
        created_by          VARCHAR(100)    NULL,           -- Nullable until Phase 5 auth
        created_at          DATETIME2(7)    NOT NULL        DEFAULT GETUTCDATE(),
        published_at        DATETIME2(7)    NULL,
        published_by        VARCHAR(100)    NULL,
        archived_at         DATETIME2(7)    NULL,

        CONSTRAINT PK_import_batches    PRIMARY KEY (batch_id),
        CONSTRAINT CK_import_batches_status CHECK (
            status IN ('DRAFT', 'VALIDATING', 'VALIDATED', 'PUBLISHED', 'ARCHIVED')
        ),
        -- Enforce only one PUBLISHED batch at a time via filtered unique index
        -- (Only one batch can be PUBLISHED simultaneously)
        CONSTRAINT CK_import_batches_cycle_date CHECK (
            DAY(plan_cycle_date) = 1   -- Must be first of the month
        )
    );

    -- Partial unique index: only one batch can be in PUBLISHED status
    -- SQL Server does not support partial unique indexes natively,
    -- so this is enforced at application layer. See import_batch_files.
    CREATE INDEX IX_import_batches_cycle_date   ON dbo.import_batches (plan_cycle_date);
    CREATE INDEX IX_import_batches_status       ON dbo.import_batches (status);

    PRINT 'Created table: import_batches';
END
ELSE
    PRINT 'Table import_batches already exists. Skipped.';
GO

-- =============================================================================
-- IMPORT_BATCH_FILES
-- One row per uploaded file per batch. Re-uploads increment upload_version
-- and set the previous version's is_current_version = 0.
--
-- file_type values (enforced by CHECK constraint):
--   master_stock | demand_plan | line_capacity_calendar |
--   staffing_plan | oee_daily | portfolio_changes
--
-- validation_status: PENDING | PASS | WARNING | BLOCKED
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'import_batch_files')
BEGIN
    CREATE TABLE dbo.import_batch_files (
        batch_file_id       INT             IDENTITY(1,1)   NOT NULL,
        batch_id            INT             NOT NULL,
        file_type           VARCHAR(50)     NOT NULL,
        original_filename   VARCHAR(255)    NOT NULL,
        stored_file_path    VARCHAR(500)    NOT NULL,       -- Relative path on filesystem
        file_size_bytes     BIGINT          NULL,
        upload_version      INT             NOT NULL        DEFAULT 1,
        is_current_version  BIT             NOT NULL        DEFAULT 1,
        row_count           INT             NULL,           -- Data rows parsed (excl. header)
        validation_status   VARCHAR(20)     NULL            DEFAULT 'PENDING',
        uploaded_by         VARCHAR(100)    NULL,
        uploaded_at         DATETIME2(7)    NOT NULL        DEFAULT GETUTCDATE(),

        CONSTRAINT PK_import_batch_files    PRIMARY KEY (batch_file_id),
        CONSTRAINT FK_import_batch_files_batch  FOREIGN KEY (batch_id)
            REFERENCES dbo.import_batches (batch_id)
            ON DELETE CASCADE,
        CONSTRAINT CK_import_batch_files_type CHECK (
            file_type IN (
                'master_stock',
                'demand_plan',
                'line_capacity_calendar',
                'staffing_plan',
                'oee_daily',
                'portfolio_changes'
            )
        ),
        CONSTRAINT CK_import_batch_files_val_status CHECK (
            validation_status IN ('PENDING', 'PASS', 'WARNING', 'BLOCKED') OR
            validation_status IS NULL
        ),
        CONSTRAINT CK_import_batch_files_version CHECK (upload_version >= 1)
    );

    CREATE INDEX IX_batch_files_batch_id    ON dbo.import_batch_files (batch_id);
    CREATE INDEX IX_batch_files_type        ON dbo.import_batch_files (batch_id, file_type);
    -- Index to quickly find current version of each file type in a batch
    CREATE INDEX IX_batch_files_current     ON dbo.import_batch_files (batch_id, file_type, is_current_version);

    PRINT 'Created table: import_batch_files';
END
ELSE
    PRINT 'Table import_batch_files already exists. Skipped.';
GO

-- =============================================================================
-- IMPORT_VALIDATION_RESULTS
-- One row per validation finding (pass, warning, or blocked).
-- Stored per file per validation run. Cleared and re-written on re-upload.
--
-- validation_stage maps to the 7-stage pipeline:
--   1 = REQUIRED_FILE_CHECK
--   2 = TEMPLATE_STRUCTURE_CHECK
--   3 = FIELD_MAPPING_CHECK
--   4 = DATA_TYPE_CHECK
--   5 = REFERENCE_CHECK
--   6 = BUSINESS_RULE_CHECK
--   7 = BATCH_READINESS
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'import_validation_results')
BEGIN
    CREATE TABLE dbo.import_validation_results (
        validation_id       INT             IDENTITY(1,1)   NOT NULL,
        batch_file_id       INT             NOT NULL,
        validation_stage    TINYINT         NOT NULL,       -- 1-7
        stage_name          VARCHAR(50)     NOT NULL,
        severity            VARCHAR(10)     NOT NULL,       -- PASS | WARNING | BLOCKED | INFO
        field_name          VARCHAR(100)    NULL,           -- NULL if file-level, not row-level
        row_number          INT             NULL,           -- NULL if not row-specific
        message             NVARCHAR(1000)  NOT NULL,
        sample_value        NVARCHAR(500)   NULL,
        created_at          DATETIME2(7)    NOT NULL        DEFAULT GETUTCDATE(),

        CONSTRAINT PK_import_validation_results PRIMARY KEY (validation_id),
        CONSTRAINT FK_validation_results_file   FOREIGN KEY (batch_file_id)
            REFERENCES dbo.import_batch_files (batch_file_id)
            ON DELETE CASCADE,
        CONSTRAINT CK_validation_results_stage  CHECK (validation_stage BETWEEN 1 AND 7),
        CONSTRAINT CK_validation_results_severity CHECK (
            severity IN ('PASS', 'WARNING', 'BLOCKED', 'INFO')
        )
    );

    CREATE INDEX IX_validation_results_file     ON dbo.import_validation_results (batch_file_id);
    CREATE INDEX IX_validation_results_severity ON dbo.import_validation_results (batch_file_id, severity);

    PRINT 'Created table: import_validation_results';
END
ELSE
    PRINT 'Table import_validation_results already exists. Skipped.';
GO

-- =============================================================================
-- PLAN_VERSIONS
-- Named, immutable baselines created from a published batch.
-- One batch can produce at most one plan version (enforced by UNIQUE on batch_id).
-- locked_at is set when the baseline is created — after this point the
-- associated planning data must not be modified.
-- is_active_baseline: only one row should have this = 1 at any time.
--   Enforced at application layer (auto-deactivate on new baseline creation).
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'plan_versions')
BEGIN
    CREATE TABLE dbo.plan_versions (
        version_id          INT             IDENTITY(1,1)   NOT NULL,
        batch_id            INT             NOT NULL,
        version_name        VARCHAR(200)    NOT NULL,
        version_type        VARCHAR(20)     NOT NULL        DEFAULT 'BASELINE',
        is_active_baseline  BIT             NOT NULL        DEFAULT 0,
        notes               NVARCHAR(1000)  NULL,
        created_by          VARCHAR(100)    NULL,
        created_at          DATETIME2(7)    NOT NULL        DEFAULT GETUTCDATE(),
        locked_at           DATETIME2(7)    NOT NULL        DEFAULT GETUTCDATE(),

        CONSTRAINT PK_plan_versions         PRIMARY KEY (version_id),
        CONSTRAINT UQ_plan_versions_batch   UNIQUE (batch_id),   -- One baseline per batch
        CONSTRAINT FK_plan_versions_batch   FOREIGN KEY (batch_id)
            REFERENCES dbo.import_batches (batch_id)
            ON DELETE NO ACTION,               -- Do not cascade: baseline must outlive batch status changes
        CONSTRAINT CK_plan_versions_type    CHECK (version_type IN ('BASELINE', 'SNAPSHOT'))
    );

    CREATE INDEX IX_plan_versions_active ON dbo.plan_versions (is_active_baseline);

    PRINT 'Created table: plan_versions';
END
ELSE
    PRINT 'Table plan_versions already exists. Skipped.';
GO
