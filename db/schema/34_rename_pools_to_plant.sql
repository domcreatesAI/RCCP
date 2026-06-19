-- Migration 34: rename labour pools from POOL-A* to POOL-P* (plant-aligned)
--
--   POOL-A1 → POOL-P1   POOL-A2 → POOL-P2
--   POOL-A3 → POOL-P3   POOL-A5 → POOL-P5
--
-- pool_code is referenced by dbo.lines.labour_pool_code via FK_lines_labour_pool,
-- which is ON UPDATE NO ACTION (deliberate — avoids multiple cascade paths from
-- plants). So we disable the FK, rename in both the parent and child tables, then
-- re-enable WITH CHECK to re-validate. No app code references these literals.

BEGIN TRAN;

ALTER TABLE dbo.lines NOCHECK CONSTRAINT FK_lines_labour_pool;

UPDATE dbo.labour_pools
SET pool_code = REPLACE(pool_code, 'POOL-A', 'POOL-P')
WHERE pool_code LIKE 'POOL-A%';

UPDATE dbo.lines
SET labour_pool_code = REPLACE(labour_pool_code, 'POOL-A', 'POOL-P')
WHERE labour_pool_code LIKE 'POOL-A%';

-- Re-enable and re-validate the FK against the renamed data.
ALTER TABLE dbo.lines WITH CHECK CHECK CONSTRAINT FK_lines_labour_pool;

COMMIT;
GO

PRINT 'Migration 34 complete — pools renamed POOL-A* → POOL-P*';
SELECT pool_code, pool_name FROM dbo.labour_pools ORDER BY pool_code;
GO
