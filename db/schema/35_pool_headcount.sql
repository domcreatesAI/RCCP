-- Migration 35: pool headcount (Phase 2 — labour-constrained capacity)
--
-- The people actually available in each plant's filling pool, by role, per month.
-- This is the "HAVE" side of the pool labour balance: the engine compares it
-- against the demand-driven "NEED" (Σ line crew × line utilisation) to surface
-- staffing gaps. See docs/LABOUR_MODEL.md.
--
-- One row per (batch, plant/pool, role, month). Batch-scoped like other planning
-- data. Pool absences (holiday/sick) are recorded as plant+role rows in the
-- existing dbo.headcount_exceptions and prorated by the engine.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pool_headcount')
BEGIN
    CREATE TABLE dbo.pool_headcount (
        pool_headcount_id   INT             IDENTITY(1,1)   NOT NULL,
        batch_id            INT             NOT NULL,
        plant_code          VARCHAR(20)     NOT NULL,           -- the pool = plant
        resource_type_code  VARCHAR(50)     NOT NULL,
        plan_month          DATE            NOT NULL,           -- 1st of the month
        planned_headcount   DECIMAL(8,2)    NOT NULL,
        source_row_number   INT             NULL,
        created_at          DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_pool_headcount        PRIMARY KEY (pool_headcount_id),
        CONSTRAINT UQ_pool_headcount        UNIQUE (batch_id, plant_code, resource_type_code, plan_month),
        CONSTRAINT FK_pool_headcount_batch  FOREIGN KEY (batch_id)
            REFERENCES dbo.import_batches (batch_id) ON DELETE CASCADE,
        CONSTRAINT FK_pool_headcount_plant  FOREIGN KEY (plant_code)
            REFERENCES dbo.plants (plant_code),
        CONSTRAINT FK_pool_headcount_role   FOREIGN KEY (resource_type_code)
            REFERENCES dbo.resource_types (resource_type_code),
        CONSTRAINT CK_pool_headcount_hc     CHECK (planned_headcount >= 0)
    );

    CREATE INDEX IX_pool_headcount_batch ON dbo.pool_headcount (batch_id);

    PRINT 'Created table: pool_headcount';
END
ELSE
    PRINT 'Table pool_headcount already exists. Skipped.';
GO

PRINT 'Migration 35 complete';
GO
