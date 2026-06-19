-- Migration 26: Correct resource requirements with actual factory data
-- - Adds TECHNICIAN resource type (factory-wide, stored under Plant 1)
-- - Replaces line_resource_requirements with verified per-line headcount
-- - Replaces plant_resource_requirements with verified per-plant totals
-- - Factory-wide resources (FORKLIFT_DRIVER, TECHNICIAN) stored under Plant 1 (UKP1 sole site)
-- Run: sqlcmd -S localhost\SQLEXPRESS -d RCCP_One -E -C -i db\schema\26_correct_resource_requirements.sql

-- ── 1. Add TECHNICIAN to resource_types ──────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.resource_types WHERE resource_type_code = 'TECHNICIAN')
BEGIN
    INSERT INTO dbo.resource_types (resource_type_code, resource_type_name, scope, standard_hourly_rate)
    VALUES ('TECHNICIAN', 'Technician', 'PLANT', NULL);
    PRINT 'Added TECHNICIAN resource type.';
END
ELSE
    PRINT 'TECHNICIAN already exists — skipped.';

-- ── 2. Replace line_resource_requirements ────────────────────────────────────
-- Only LINE-scoped roles: LINE_OPERATOR, LINE_LEADER
-- Lines with 0 Line Leaders are omitted (no requirement = no row)

DELETE FROM dbo.line_resource_requirements;

INSERT INTO dbo.line_resource_requirements (line_code, resource_type_code, headcount_required)
VALUES
    -- Plant 1
    ('A101', 'LINE_OPERATOR', 2), ('A101', 'LINE_LEADER', 1),
    ('A102', 'LINE_OPERATOR', 2), ('A102', 'LINE_LEADER', 1),
    ('A103', 'LINE_OPERATOR', 2), ('A103', 'LINE_LEADER', 1),
    -- Plant 2
    ('A201', 'LINE_OPERATOR', 1),
    ('A202', 'LINE_OPERATOR', 1),
    -- Plant 3
    ('A302', 'LINE_OPERATOR', 1),
    ('A303', 'LINE_OPERATOR', 3), ('A303', 'LINE_LEADER', 1),
    ('A304', 'LINE_OPERATOR', 2), ('A304', 'LINE_LEADER', 1),
    ('A305', 'LINE_OPERATOR', 2), ('A305', 'LINE_LEADER', 1),
    ('A307', 'LINE_OPERATOR', 1),
    ('A308', 'LINE_OPERATOR', 1),
    -- Plant 4
    ('A401', 'LINE_OPERATOR', 3), ('A401', 'LINE_LEADER', 1),
    -- Plant 5
    ('A501', 'LINE_OPERATOR', 2),
    ('A502', 'LINE_OPERATOR', 2);

PRINT 'line_resource_requirements replaced — 22 rows.';

-- ── 3. Replace plant_resource_requirements ───────────────────────────────────
-- PLANT-scoped roles: ROBOT_OPERATOR, MATERIAL_HANDLER, FORKLIFT_DRIVER, TECHNICIAN
-- Totals per plant when all lines in that plant run simultaneously.
-- FORKLIFT_DRIVER (2) and TECHNICIAN (1) are factory-wide — stored under Plant 1
-- as UKP1 is the sole manufacturing site. Plants 2–5 carry 0 for these roles (no rows).

DELETE FROM dbo.plant_resource_requirements;

INSERT INTO dbo.plant_resource_requirements (plant_code, resource_type_code, headcount_required)
VALUES
    -- Plant 1 (A101, A102, A103): 1 Robot Operator, 2 Material Handlers
    -- + factory-wide resources (FD=2, Technician=1) anchored here
    ('Plant 1', 'ROBOT_OPERATOR',    1),
    ('Plant 1', 'MATERIAL_HANDLER',  2),
    ('Plant 1', 'FORKLIFT_DRIVER',   2),   -- factory-wide: 2 FDs for entire site
    ('Plant 1', 'TECHNICIAN',        1),   -- factory-wide: 1 Technician for entire site

    -- Plant 3 (A302–A308): Robot Operators when A303+A304+A305 run simultaneously
    -- A303=2, A304=1, A305=1 → max concurrent requirement = 4
    ('Plant 3', 'ROBOT_OPERATOR',    4),

    -- Plant 4 (A401): 1 Robot Operator
    ('Plant 4', 'ROBOT_OPERATOR',    1);

PRINT 'plant_resource_requirements replaced — 6 rows.';
PRINT '';
PRINT 'NOTE: FORKLIFT_DRIVER and TECHNICIAN are factory-wide resources stored';
PRINT 'under Plant 1 (sole manufacturing site, UKP1). Phase 5 config can';
PRINT 'introduce a factory-level scope if finer control is needed.';
