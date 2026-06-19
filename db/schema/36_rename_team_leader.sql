-- Migration 36: rename resource type TEAM_LEADER → LINE_LEADER
--
-- Code TEAM_LEADER → LINE_LEADER, display name 'Team Leader' → 'Line Leader'.
-- resource_type_code is referenced by FK from 5 child tables (all ON UPDATE
-- NO ACTION), so we disable those FKs, rename in the parent and all children,
-- then re-enable WITH CHECK to re-validate.

BEGIN TRAN;

ALTER TABLE dbo.line_resource_requirements  NOCHECK CONSTRAINT FK_lrr_resource_type;
ALTER TABLE dbo.plant_resource_requirements NOCHECK CONSTRAINT FK_prr_resource_type;
ALTER TABLE dbo.pool_headcount              NOCHECK CONSTRAINT FK_pool_headcount_role;
ALTER TABLE dbo.plant_headcount_plan        NOCHECK CONSTRAINT FK_php_resource_type;
ALTER TABLE dbo.headcount_exceptions        NOCHECK CONSTRAINT FK_he_resource_type;

UPDATE dbo.resource_types
   SET resource_type_code = 'LINE_LEADER', resource_type_name = 'Line Leader'
 WHERE resource_type_code = 'TEAM_LEADER';

UPDATE dbo.line_resource_requirements  SET resource_type_code = 'LINE_LEADER' WHERE resource_type_code = 'TEAM_LEADER';
UPDATE dbo.plant_resource_requirements SET resource_type_code = 'LINE_LEADER' WHERE resource_type_code = 'TEAM_LEADER';
UPDATE dbo.pool_headcount              SET resource_type_code = 'LINE_LEADER' WHERE resource_type_code = 'TEAM_LEADER';
UPDATE dbo.plant_headcount_plan        SET resource_type_code = 'LINE_LEADER' WHERE resource_type_code = 'TEAM_LEADER';
UPDATE dbo.headcount_exceptions        SET resource_type_code = 'LINE_LEADER' WHERE resource_type_code = 'TEAM_LEADER';

ALTER TABLE dbo.line_resource_requirements  WITH CHECK CHECK CONSTRAINT FK_lrr_resource_type;
ALTER TABLE dbo.plant_resource_requirements WITH CHECK CHECK CONSTRAINT FK_prr_resource_type;
ALTER TABLE dbo.pool_headcount              WITH CHECK CHECK CONSTRAINT FK_pool_headcount_role;
ALTER TABLE dbo.plant_headcount_plan        WITH CHECK CHECK CONSTRAINT FK_php_resource_type;
ALTER TABLE dbo.headcount_exceptions        WITH CHECK CHECK CONSTRAINT FK_he_resource_type;

COMMIT;
GO

PRINT 'Migration 36 complete — TEAM_LEADER renamed to LINE_LEADER';
SELECT resource_type_code, resource_type_name, scope FROM dbo.resource_types WHERE scope = 'LINE' ORDER BY resource_type_code;
GO
