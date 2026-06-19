-- Migration 37: pooled labour model v2 — pools span plants
--
-- POOL-FLEX  = Plants 1+3+4 (operators, line leaders, palletisers AND shared roles
--              all flex across these lines).
-- POOL-P2    = Plant 2 (dedicated, unchanged).
-- Plant 5 (A501/A502) excluded from the headcount model (pool = NULL).
--
-- Also re-keys pool_headcount from plant_code → pool_code.

-- 1. A pool can now span plants → relax the single-plant link.
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.labour_pools') AND name = 'plant_code' AND is_nullable = 0
)
BEGIN
    ALTER TABLE dbo.labour_pools ALTER COLUMN plant_code VARCHAR(20) NULL;
    PRINT 'labour_pools.plant_code is now nullable';
END
GO

-- 2. Create POOL-FLEX (spans plants — no single plant_code).
IF NOT EXISTS (SELECT 1 FROM dbo.labour_pools WHERE pool_code = 'POOL-FLEX')
BEGIN
    INSERT INTO dbo.labour_pools (pool_code, pool_name, plant_code, max_concurrent_lines, notes, is_active)
    VALUES ('POOL-FLEX', 'Flexible Crew (Plants 1/3/4)', NULL, 10,
            'Operators, line leaders, palletisers and shared roles flex across all lines in Plants 1, 3, 4', 1);
    PRINT 'Created POOL-FLEX';
END
GO

-- 3. Remap lines to the new pools.
UPDATE dbo.lines SET labour_pool_code = 'POOL-FLEX'
 WHERE line_code IN ('A101','A102','A103','A302','A303','A304','A305','A307','A308','A401');

UPDATE dbo.lines SET labour_pool_code = 'POOL-P2'
 WHERE line_code IN ('A201','A202');

UPDATE dbo.lines SET labour_pool_code = NULL
 WHERE line_code IN ('A501','A502');   -- Plant 5 excluded for now
GO

-- 4. Deactivate the now-unused per-plant pools (keep POOL-P2).
UPDATE dbo.labour_pools SET is_active = 0
 WHERE pool_code IN ('POOL-P1','POOL-P3','POOL-P4','POOL-P5');
GO

-- 5. Re-key pool_headcount from plant_code → pool_code (batch data; safe to recreate).
IF OBJECT_ID('dbo.pool_headcount') IS NOT NULL
    DROP TABLE dbo.pool_headcount;
GO
CREATE TABLE dbo.pool_headcount (
    pool_headcount_id   INT             IDENTITY(1,1)   NOT NULL,
    batch_id            INT             NOT NULL,
    pool_code           VARCHAR(50)     NOT NULL,        -- the labour pool
    resource_type_code  VARCHAR(50)     NOT NULL,
    plan_month          DATE            NOT NULL,
    planned_headcount   DECIMAL(8,2)    NOT NULL,
    source_row_number   INT             NULL,
    created_at          DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

    CONSTRAINT PK_pool_headcount        PRIMARY KEY (pool_headcount_id),
    CONSTRAINT UQ_pool_headcount        UNIQUE (batch_id, pool_code, resource_type_code, plan_month),
    CONSTRAINT FK_pool_headcount_batch  FOREIGN KEY (batch_id)
        REFERENCES dbo.import_batches (batch_id) ON DELETE CASCADE,
    CONSTRAINT FK_pool_headcount_pool   FOREIGN KEY (pool_code)
        REFERENCES dbo.labour_pools (pool_code),
    CONSTRAINT FK_pool_headcount_role   FOREIGN KEY (resource_type_code)
        REFERENCES dbo.resource_types (resource_type_code),
    CONSTRAINT CK_pool_headcount_hc     CHECK (planned_headcount >= 0)
);
CREATE INDEX IX_pool_headcount_batch ON dbo.pool_headcount (batch_id);
GO

PRINT 'Migration 37 complete — pooled labour model v2';
SELECT pool_code, pool_name, is_active FROM dbo.labour_pools ORDER BY is_active DESC, pool_code;
SELECT labour_pool_code, COUNT(*) AS lines FROM dbo.lines GROUP BY labour_pool_code ORDER BY labour_pool_code;
GO
