-- =============================================================================
-- RCCP One — Rename plant codes from A1–A5 to P1–P5
-- Migration 21
--
-- All child tables (labour_pools, lines, items, plant_resource_requirements)
-- have ON UPDATE CASCADE on their FK_*_plant constraints, so updating
-- dbo.plants.plant_code cascades automatically to all child rows.
--
-- Changes:
--   dbo.plants   plant_code: A1→P1, A2→P2, A3→P3, A4→P4, A5→P5
--   dbo.plants   plant_name: 'Plant A1'→'Plant 1', etc.
-- =============================================================================

USE RCCP_One;
GO

-- Update one at a time (CASCADE fires on each UPDATE)
UPDATE dbo.plants SET plant_code = 'P1', plant_name = 'Plant 1' WHERE plant_code = 'A1';
UPDATE dbo.plants SET plant_code = 'P2', plant_name = 'Plant 2' WHERE plant_code = 'A2';
UPDATE dbo.plants SET plant_code = 'P3', plant_name = 'Plant 3' WHERE plant_code = 'A3';
UPDATE dbo.plants SET plant_code = 'P4', plant_name = 'Plant 4' WHERE plant_code = 'A4';
UPDATE dbo.plants SET plant_code = 'P5', plant_name = 'Plant 5' WHERE plant_code = 'A5';
GO

-- Verify
SELECT plant_code, plant_name FROM dbo.plants ORDER BY plant_code;
GO

PRINT '=== Migration 21 complete — plant codes renamed A1-A5 → P1-P5 ===';
GO
