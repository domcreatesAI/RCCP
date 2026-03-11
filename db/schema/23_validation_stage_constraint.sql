-- =============================================================================
-- RCCP One — Extend CK_validation_results_stage to allow stage 8
--
-- Stage 8 (CROSS_FILE_CHECK) writes results to import_validation_results
-- but the original constraint only allowed stages 1–7.
-- Safe to re-run.
-- =============================================================================

USE RCCP_One;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_validation_results_stage'
      AND parent_object_id = OBJECT_ID('dbo.import_validation_results')
)
BEGIN
    ALTER TABLE dbo.import_validation_results DROP CONSTRAINT CK_validation_results_stage;
    PRINT 'Dropped old CK_validation_results_stage.';
END

ALTER TABLE dbo.import_validation_results
    ADD CONSTRAINT CK_validation_results_stage CHECK (validation_stage BETWEEN 1 AND 8);

PRINT 'Recreated CK_validation_results_stage — now allows stages 1–8.';
GO
