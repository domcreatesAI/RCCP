-- =============================================================================
-- RCCP One — Reset Script
-- Drops all tables in reverse dependency order.
--
-- USE THIS when you need a clean slate before re-running all schema scripts.
-- Safe to run on a partially or fully deployed database.
--
-- CAUTION: Destroys all data. Development / re-deployment use only.
-- =============================================================================

USE RCCP_One;
GO

-- Planning data (deepest dependencies first)
DROP TABLE IF EXISTS dbo.portfolio_changes;
DROP TABLE IF EXISTS dbo.oee_daily;
DROP TABLE IF EXISTS dbo.headcount_plan;
DROP TABLE IF EXISTS dbo.line_capacity_calendar;
DROP TABLE IF EXISTS dbo.demand_plan;
DROP TABLE IF EXISTS dbo.master_stock;
GO

-- Workflow / control
DROP TABLE IF EXISTS dbo.plan_versions;
DROP TABLE IF EXISTS dbo.import_validation_results;
DROP TABLE IF EXISTS dbo.import_batch_files;
DROP TABLE IF EXISTS dbo.import_batches;
GO

-- Capacity & resource masterdata
DROP TABLE IF EXISTS dbo.warehouse_capacity;
DROP TABLE IF EXISTS dbo.line_pack_capabilities;
DROP TABLE IF EXISTS dbo.plant_resource_requirements;
DROP TABLE IF EXISTS dbo.line_resource_requirements;
DROP TABLE IF EXISTS dbo.resource_types;
DROP TABLE IF EXISTS dbo.item_resource_rules;
GO

-- Core masterdata (FK order: children before parents)
DROP TABLE IF EXISTS dbo.items;
DROP TABLE IF EXISTS dbo.lines;
DROP TABLE IF EXISTS dbo.labour_pools;
DROP TABLE IF EXISTS dbo.pack_types;
DROP TABLE IF EXISTS dbo.plants;
DROP TABLE IF EXISTS dbo.warehouses;
DROP TABLE IF EXISTS dbo.app_settings;
GO

PRINT '=== All tables dropped. Database is ready for fresh schema deployment. ===';
PRINT 'Run scripts in order: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08';
PRINT 'Then run seeds: seeds/01_app_settings.sql → seeds/02_masterdata_sample.sql';
GO
