-- =============================================================================
-- RCCP One — Masterdata Seed (Development / Test Dataset)
-- Run after all schema scripts (01 through 08).
--
-- Contains real plant, line, and SKU data for development and testing.
-- NOT a production configuration — standard_hours_per_unit values in
-- item_resource_rules are PLACEHOLDERS. Replace with actual run rates from
-- manufacturing engineering before any RCCP calculations are relied upon.
--
-- Safe to re-run — all sections use MERGE (insert or update).
--
-- RUN ORDER:
--   seeds/01_app_settings.sql  →  seeds/02_masterdata_sample.sql
-- =============================================================================

USE RCCP_One;
GO

-- =============================================================================
-- WAREHOUSES
-- Physical distribution and manufacturing sites.
-- All filling (manufacturing) happens at UKP1 (Gravesend).
-- UKP3, UKP4, UKP5 are distribution warehouses only.
-- UKP2 is not currently in use.
-- =============================================================================
MERGE dbo.warehouses AS target
USING (VALUES
    ('UKP1', 'Gravesend',   1),
    ('UKP3', 'Rochester',   1),
    ('UKP4', 'Wakefield',   1),
    ('UKP5', 'Aberdeen',    1)
) AS source (warehouse_code, warehouse_name, is_active)
ON target.warehouse_code = source.warehouse_code
WHEN NOT MATCHED THEN
    INSERT (warehouse_code, warehouse_name, is_active)
    VALUES (source.warehouse_code, source.warehouse_name, source.is_active)
WHEN MATCHED THEN
    UPDATE SET warehouse_name = source.warehouse_name,
               is_active      = source.is_active;

PRINT 'Warehouses seeded.';
GO

-- =============================================================================
-- PACK TYPES
-- Warehouse capacity categories. Each pack type has a fixed pallet allocation
-- per warehouse. New types can be added by inserting a row here.
-- =============================================================================
MERGE dbo.pack_types AS target
USING (VALUES
    ('SMALL_PACK',  'Small Pack (1L, 2L, 5L)',  NULL, 1),
    ('60L',         '60 Litre',                 NULL, 1),
    ('BARREL_200L', '200 Litre Barrel',          NULL, 1),
    ('IBC',         'IBC',                       NULL, 1)
) AS source (pack_type_code, pack_type_name, notes, is_active)
ON target.pack_type_code = source.pack_type_code
WHEN NOT MATCHED THEN
    INSERT (pack_type_code, pack_type_name, notes, is_active)
    VALUES (source.pack_type_code, source.pack_type_name, source.notes, source.is_active)
WHEN MATCHED THEN
    UPDATE SET pack_type_name = source.pack_type_name,
               is_active      = source.is_active;

PRINT 'Pack types seeded.';
GO

-- =============================================================================
-- PLANTS
-- Manufacturing areas within UKP1 (Gravesend).
-- A1–A5 are physical filling halls, each containing one or more filling lines.
-- All linked to warehouse_code = UKP1 (all manufacturing is at Gravesend).
-- =============================================================================
MERGE dbo.plants AS target
USING (VALUES
    ('A1', 'Plant A1', 'UKP1', 1),
    ('A2', 'Plant A2', 'UKP1', 1),
    ('A3', 'Plant A3', 'UKP1', 1),
    ('A4', 'Plant A4', 'UKP1', 1),
    ('A5', 'Plant A5', 'UKP1', 1)
) AS source (plant_code, plant_name, warehouse_code, is_active)
ON target.plant_code = source.plant_code
WHEN NOT MATCHED THEN
    INSERT (plant_code, plant_name, warehouse_code, is_active)
    VALUES (source.plant_code, source.plant_name, source.warehouse_code, source.is_active)
WHEN MATCHED THEN
    UPDATE SET plant_name      = source.plant_name,
               warehouse_code  = source.warehouse_code,
               is_active       = source.is_active;

PRINT 'Plants seeded.';
GO

-- =============================================================================
-- LABOUR POOLS
-- One pool per plant group of filling lines. max_concurrent_lines is the
-- physical ceiling on simultaneous line runs (space/equipment constraint).
-- Headcount requirements per line are in line_resource_requirements below.
--
-- NOTE: Plant A4 (line A401) uses a dedicated crew — no shared pool.
-- =============================================================================
MERGE dbo.labour_pools AS target
USING (VALUES
    ('POOL-A1', 'Plant A1 Filling Crew', 'A1', 3, 'Lines A101, A102, A103'),
    ('POOL-A2', 'Plant A2 Filling Crew', 'A2', 2, 'Lines A201, A202'),
    ('POOL-A3', 'Plant A3 Filling Crew', 'A3', 6, 'Lines A302–A305, A307, A308 (A306 not in use)'),
    ('POOL-A5', 'Plant A5 Filling Crew', 'A5', 2, 'Lines A501, A502')
) AS source (pool_code, pool_name, plant_code, max_concurrent_lines, notes)
ON target.pool_code = source.pool_code
WHEN NOT MATCHED THEN
    INSERT (pool_code, pool_name, plant_code, max_concurrent_lines, notes)
    VALUES (source.pool_code, source.pool_name, source.plant_code,
            source.max_concurrent_lines, source.notes)
WHEN MATCHED THEN
    UPDATE SET pool_name             = source.pool_name,
               max_concurrent_lines  = source.max_concurrent_lines,
               notes                 = source.notes;

PRINT 'Labour pools seeded.';
GO

-- =============================================================================
-- LINES
-- All active production filling lines across 5 plants.
-- oee_target = 0.55 (55%) for all lines — default target agreed with business.
-- available_mins_per_day = 420 (7-hour shift) for all lines.
-- Both values can be overridden per line here or via the Config screen (Phase 5).
--
-- Pack size capabilities per line are seeded separately below
-- in the line_pack_capabilities section.
--
-- NOTE: A306 is not active (gap in A3xx sequence is intentional).
--       A401 has no shared pool — dedicated crew.
-- =============================================================================
MERGE dbo.lines AS target
USING (VALUES
    ('A101', 'Line A101', 'A1', 'POOL-A1', 0.55, 420, 1),
    ('A102', 'Line A102', 'A1', 'POOL-A1', 0.55, 420, 1),
    ('A103', 'Line A103', 'A1', 'POOL-A1', 0.55, 420, 1),
    ('A201', 'Line A201', 'A2', 'POOL-A2', 0.55, 420, 1),
    ('A202', 'Line A202', 'A2', 'POOL-A2', 0.55, 420, 1),
    ('A302', 'Line A302', 'A3', 'POOL-A3', 0.55, 420, 1),
    ('A303', 'Line A303', 'A3', 'POOL-A3', 0.55, 420, 1),
    ('A304', 'Line A304', 'A3', 'POOL-A3', 0.55, 420, 1),
    ('A305', 'Line A305', 'A3', 'POOL-A3', 0.55, 420, 1),
    ('A307', 'Line A307', 'A3', 'POOL-A3', 0.55, 420, 1),
    ('A308', 'Line A308', 'A3', 'POOL-A3', 0.55, 420, 1),
    ('A401', 'Line A401', 'A4', NULL,       0.55, 420, 1),
    ('A501', 'Line A501', 'A5', 'POOL-A5', 0.55, 420, 1),
    ('A502', 'Line A502', 'A5', 'POOL-A5', 0.55, 420, 1)
) AS source (line_code, line_name, plant_code, labour_pool_code, oee_target, available_mins_per_day, is_active)
ON target.line_code = source.line_code
WHEN NOT MATCHED THEN
    INSERT (line_code, line_name, plant_code, labour_pool_code, oee_target, available_mins_per_day, is_active)
    VALUES (source.line_code, source.line_name, source.plant_code, source.labour_pool_code,
            source.oee_target, source.available_mins_per_day, source.is_active)
WHEN MATCHED THEN
    UPDATE SET line_name              = source.line_name,
               plant_code             = source.plant_code,
               labour_pool_code       = source.labour_pool_code,
               oee_target             = source.oee_target,
               available_mins_per_day = source.available_mins_per_day,
               is_active              = source.is_active;

PRINT 'Lines seeded.';
GO

-- =============================================================================
-- ITEMS
-- Real SKUs from SAP. item_code must match the SAP material number exactly.
--
-- pack_size_l: used to convert stock quantities from EA to litres for reporting.
-- pack_type_code: links each SKU to its warehouse capacity category.
-- units_per_pallet: used to convert stock EA to pallet positions.
--   Known values: 5L = 120 EA/pallet, 2L = 288 EA/pallet.
--   1L and 4L are marked NULL pending confirmation from warehouse.
-- item_group_code: planning family for item_resource_rules (e.g. '4L', '5L').
--
-- PLACEHOLDER NOTE: pack_size_l, units_per_pallet for 1L and 4L items
--   are NULL and must be confirmed before Phase 2 EA→L calculations run.
-- =============================================================================
MERGE dbo.items AS target
USING (VALUES
    --  item_code  description                         item_type       item_group  plant  pack_size_l  pack_type     units_per_pallet  sku_status  is_active
    ('101233', 'X-FLOW TYPE G 5W40 4x4L',      'FINISHED_GOOD', '4L',  'A1', 4.0000, 'SMALL_PACK', NULL, NULL, 1),  -- units_per_pallet TBC
    ('101322', 'COMMA XTECH 5W30 4x5L',         'FINISHED_GOOD', '5L',  'A1', 5.0000, 'SMALL_PACK', 120,  NULL, 1),
    ('101108', 'COMMA PROLIFE 5W30 4x5L',        'FINISHED_GOOD', '5L',  'A1', 5.0000, 'SMALL_PACK', 120,  NULL, 1),
    ('101218', 'X-FLOW TYPE F 5W30 4X5L',        'FINISHED_GOOD', '5L',  'A1', 5.0000, 'SMALL_PACK', 120,  NULL, 1),
    ('101221', 'X-FLOW TYPE FE 0W30 12x1L',      'FINISHED_GOOD', '1L',  'A1', 1.0000, 'SMALL_PACK', NULL, NULL, 1),  -- units_per_pallet TBC
    ('500014', '5W-30 ADVANCED',                 'SEMI_FINISHED', NULL,  'A1', NULL,   NULL,         NULL, NULL, 1),  -- blending base, no pack
    ('500027', 'SYNER-Z 5W30',                   'SEMI_FINISHED', NULL,  'A1', NULL,   NULL,         NULL, NULL, 1)   -- blending base, no pack
) AS source (item_code, item_description, item_type, item_group_code, plant_code,
             pack_size_l, pack_type_code, units_per_pallet, sku_status, is_active)
ON target.item_code = source.item_code
WHEN NOT MATCHED THEN
    INSERT (item_code, item_description, item_type, item_group_code, plant_code,
            pack_size_l, pack_type_code, units_per_pallet, sku_status, is_active)
    VALUES (source.item_code, source.item_description, source.item_type, source.item_group_code,
            source.plant_code, source.pack_size_l, source.pack_type_code,
            source.units_per_pallet, source.sku_status, source.is_active)
WHEN MATCHED THEN
    UPDATE SET item_description  = source.item_description,
               item_type         = source.item_type,
               item_group_code   = source.item_group_code,
               plant_code        = source.plant_code,
               pack_size_l       = source.pack_size_l,
               pack_type_code    = source.pack_type_code,
               units_per_pallet  = source.units_per_pallet,
               is_active         = source.is_active;
-- NOTE: sku_status deliberately not updated on MATCHED — it is managed
-- via a separate SKU status upload, not this seed script.

PRINT 'Items seeded.';
GO

-- =============================================================================
-- ITEM RESOURCE RULES — PLANT A1 ONLY
--
-- *** IMPORTANT: standard_hours_per_unit values are PLACEHOLDERS ***
-- Replace with actual run rates from manufacturing engineering before
-- any RCCP calculations are performed.
--
-- Rules for Plants A2–A5 to be added via Config & Masterdata (Phase 5)
-- or via a future seed script once run rates are confirmed.
-- =============================================================================
MERGE dbo.item_resource_rules AS target
USING (VALUES
    -- rule_code  item_group  line    std_hrs_per_unit  valid_from    valid_to  status    version
    ('IRR-0001', '1L',  'A103', 0.0150, '2026-01-01', NULL, 'ACTIVE', 1),
    ('IRR-0002', '4L',  'A101', 0.0500, '2026-01-01', NULL, 'ACTIVE', 1),
    ('IRR-0003', '4L',  'A102', 0.0500, '2026-01-01', NULL, 'ACTIVE', 1),
    ('IRR-0004', '5L',  'A101', 0.0580, '2026-01-01', NULL, 'ACTIVE', 1),
    ('IRR-0005', '5L',  'A102', 0.0580, '2026-01-01', NULL, 'ACTIVE', 1)
) AS source (rule_code, item_group_code, line_code, standard_hours_per_unit,
             valid_from, valid_to, status, version)
ON target.rule_code = source.rule_code
WHEN NOT MATCHED THEN
    INSERT (rule_code, item_group_code, line_code, standard_hours_per_unit,
            valid_from, valid_to, status, version)
    VALUES (source.rule_code, source.item_group_code, source.line_code,
            source.standard_hours_per_unit, source.valid_from, source.valid_to,
            source.status, source.version);
-- No WHEN MATCHED — rule edits go through the versioned publish workflow
-- (archive old rule, insert new with version + 1).

PRINT 'Item resource rules seeded (Plant A1 only — PLACEHOLDERS).';
GO

-- =============================================================================
-- RESOURCE TYPES
-- Controlled vocabulary for staff roles used in resource requirements.
-- standard_hourly_rate: NULL = not yet configured.
--   Update with actual rates before Phase 3 cost calculations are used.
-- =============================================================================
MERGE dbo.resource_types AS target
USING (VALUES
    -- code               name                  scope    hourly_rate  notes                                          is_active
    ('LINE_OPERATOR',  'Line Operator',  'LINE',  NULL, 'Directly operates the filling line',            1),
    ('TEAM_LEADER',    'Team Leader',    'LINE',  NULL, 'Supervises the line crew',                      1),
    ('ROBOT_OPERATOR', 'Robot Operator', 'PLANT', NULL, 'Operates robotic palletising equipment — shared across the plant', 1),
    ('FORKLIFT_DRIVER','Forklift Driver','PLANT', NULL, 'Moves pallets and materials — shared across the plant',            1),
    ('MATERIAL_HANDLER','Material Handler','PLANT',NULL, 'Feeds components and consumables — shared across the plant',      1)
) AS source (resource_type_code, resource_type_name, scope, standard_hourly_rate, notes, is_active)
ON target.resource_type_code = source.resource_type_code
WHEN NOT MATCHED THEN
    INSERT (resource_type_code, resource_type_name, scope, standard_hourly_rate, notes, is_active)
    VALUES (source.resource_type_code, source.resource_type_name, source.scope,
            source.standard_hourly_rate, source.notes, source.is_active)
WHEN MATCHED THEN
    UPDATE SET resource_type_name   = source.resource_type_name,
               scope                = source.scope,
               notes                = source.notes,
               is_active            = source.is_active;
-- NOTE: standard_hourly_rate deliberately not updated on MATCHED —
-- preserves any rates already entered, preventing accidental reset.

PRINT 'Resource types seeded.';
GO

-- =============================================================================
-- LINE RESOURCE REQUIREMENTS — PLANT A1 ONLY
-- Headcount needed per role to run each line.
-- Data from the resource matrix provided (Feb 2026).
-- Plants A2–A5 to be added when data is confirmed.
-- =============================================================================
MERGE dbo.line_resource_requirements AS target
USING (VALUES
    -- line    resource_type       headcount
    ('A101', 'LINE_OPERATOR',  3),
    ('A101', 'TEAM_LEADER',    1),
    ('A102', 'LINE_OPERATOR',  4),
    ('A102', 'TEAM_LEADER',    1),
    ('A103', 'LINE_OPERATOR',  4),
    ('A103', 'TEAM_LEADER',    1)
) AS source (line_code, resource_type_code, headcount_required)
ON target.line_code = source.line_code AND target.resource_type_code = source.resource_type_code
WHEN NOT MATCHED THEN
    INSERT (line_code, resource_type_code, headcount_required)
    VALUES (source.line_code, source.resource_type_code, source.headcount_required)
WHEN MATCHED THEN
    UPDATE SET headcount_required = source.headcount_required,
               updated_at         = GETUTCDATE();

PRINT 'Line resource requirements seeded (Plant A1 only).';
GO

-- =============================================================================
-- PLANT RESOURCE REQUIREMENTS — PLANT A1 ONLY
-- Shared headcount needed at plant level (regardless of how many lines run).
-- Data from the resource matrix provided (Feb 2026).
-- Plants A2–A5 to be added when data is confirmed.
-- =============================================================================
MERGE dbo.plant_resource_requirements AS target
USING (VALUES
    -- plant  resource_type        headcount
    ('A1', 'ROBOT_OPERATOR',   1),
    ('A1', 'FORKLIFT_DRIVER',  2),
    ('A1', 'MATERIAL_HANDLER', 1)
) AS source (plant_code, resource_type_code, headcount_required)
ON target.plant_code = source.plant_code AND target.resource_type_code = source.resource_type_code
WHEN NOT MATCHED THEN
    INSERT (plant_code, resource_type_code, headcount_required)
    VALUES (source.plant_code, source.resource_type_code, source.headcount_required)
WHEN MATCHED THEN
    UPDATE SET headcount_required = source.headcount_required,
               updated_at         = GETUTCDATE();

PRINT 'Plant resource requirements seeded (Plant A1 only).';
GO

-- =============================================================================
-- LINE PACK CAPABILITIES
-- Which pack sizes each line can run and at what speed (bottles per minute).
-- Data sourced from the line capability matrix (Feb 2026 — incomplete).
-- NULL bottles_per_minute = speed not yet confirmed for that line/pack.
--
-- NOTE: Lines A201–A502 pack size data is confirmed but speeds are
-- not yet available. Rows are seeded with NULL bpm pending confirmation.
-- =============================================================================
MERGE dbo.line_pack_capabilities AS target
USING (VALUES
    -- line    pack_size_l   bpm
    ('A101', 2.0000,   44.00),
    ('A101', 4.0000,   34.00),
    ('A101', 5.0000,   34.00),
    ('A102', 4.0000,   32.00),
    ('A102', 5.0000,   32.00),
    ('A103', 0.5000,   60.00),
    ('A103', 1.0000,   60.00),
    ('A201', 60.0000,  0.16),
    ('A201', 199.0000, 0.30),
    ('A202', 20.0000,  NULL),
    ('A302', 20.0000,  NULL),
    ('A302', 199.0000, NULL),
    ('A302', 205.0000, NULL),
    ('A302', 208.0000, NULL),
    ('A302', 1000.000, NULL),
    ('A303', 4.0000,   NULL),
    ('A303', 5.0000,   NULL),
    ('A304', 0.4000,   NULL),
    ('A304', 0.5000,   NULL),
    ('A304', 1.0000,   NULL),
    ('A305', 0.5000,   NULL),
    ('A305', 1.0000,   NULL),
    ('A307', 3.0000,   NULL),
    ('A307', 10.0000,  NULL),
    ('A307', 20.0000,  NULL),
    ('A308', 20.0000,  NULL),
    ('A401', 5.0000,   NULL),
    ('A501', 199.0000, NULL),
    ('A501', 205.0000, NULL),
    ('A501', 208.0000, NULL),
    ('A501', 1000.000, NULL),
    ('A502', 199.0000, NULL),
    ('A502', 205.0000, NULL),
    ('A502', 208.0000, NULL),
    ('A502', 1000.000, NULL)
) AS source (line_code, pack_size_l, bottles_per_minute)
ON target.line_code = source.line_code AND target.pack_size_l = source.pack_size_l
WHEN NOT MATCHED THEN
    INSERT (line_code, pack_size_l, bottles_per_minute)
    VALUES (source.line_code, source.pack_size_l, source.bottles_per_minute)
WHEN MATCHED THEN
    UPDATE SET bottles_per_minute = source.bottles_per_minute,
               updated_at         = GETUTCDATE();

PRINT 'Line pack capabilities seeded.';
GO

-- =============================================================================
-- WAREHOUSE CAPACITY
-- Maximum pallet positions per pack type per warehouse.
-- Values are PLACEHOLDERS — update with actual figures from warehouse team.
-- =============================================================================
MERGE dbo.warehouse_capacity AS target
USING (VALUES
    -- warehouse  pack_type      max_pallets  (PLACEHOLDER values)
    ('UKP1', 'SMALL_PACK',  NULL),
    ('UKP1', '60L',         NULL),
    ('UKP1', 'BARREL_200L', NULL),
    ('UKP1', 'IBC',         NULL),
    ('UKP3', 'SMALL_PACK',  NULL),
    ('UKP3', '60L',         NULL),
    ('UKP3', 'BARREL_200L', NULL),
    ('UKP3', 'IBC',         NULL),
    ('UKP4', 'SMALL_PACK',  NULL),
    ('UKP4', '60L',         NULL),
    ('UKP4', 'BARREL_200L', NULL),
    ('UKP4', 'IBC',         NULL),
    ('UKP5', 'SMALL_PACK',  NULL),
    ('UKP5', '60L',         NULL),
    ('UKP5', 'BARREL_200L', NULL),
    ('UKP5', 'IBC',         NULL)
) AS source (warehouse_code, pack_type_code, max_pallet_capacity)
ON target.warehouse_code = source.warehouse_code AND target.pack_type_code = source.pack_type_code
WHEN NOT MATCHED AND source.max_pallet_capacity IS NOT NULL THEN
    INSERT (warehouse_code, pack_type_code, max_pallet_capacity)
    VALUES (source.warehouse_code, source.pack_type_code, source.max_pallet_capacity)
WHEN MATCHED AND source.max_pallet_capacity IS NOT NULL THEN
    UPDATE SET max_pallet_capacity = source.max_pallet_capacity,
               updated_at          = GETUTCDATE();
-- NULL max_pallet_capacity rows are skipped — insert only when actual values are known.

PRINT 'Warehouse capacity seeded (placeholders — update with actual values from warehouse team).';
GO

-- =============================================================================
-- SUMMARY
-- =============================================================================
PRINT '';
PRINT '=== Masterdata seed complete ===';
PRINT '  Warehouses:                   4 (UKP1, UKP3, UKP4, UKP5)';
PRINT '  Pack types:                   4 (Small Pack, 60L, Barrel 200L, IBC)';
PRINT '  Plants:                       5 (A1–A5, all linked to UKP1)';
PRINT '  Labour pools:                 4 (POOL-A1, A2, A3, A5)';
PRINT '  Lines:                       14 (A101–A103, A201–A202, A302–A308, A401, A501–A502)';
PRINT '  Items:                        7 (5 finished goods, 2 semi-finished)';
PRINT '  Item resource rules:          5 (Plant A1 only — PLACEHOLDER std hrs)';
PRINT '  Resource types:               5 (Line Operator, Team Leader, Robot Operator,';
PRINT '                                   Forklift Driver, Material Handler)';
PRINT '  Line resource requirements:   6 (Plant A1 lines only)';
PRINT '  Plant resource requirements:  3 (Plant A1 only)';
PRINT '  Line pack capabilities:      34 rows (speeds TBC for most lines)';
PRINT '  Warehouse capacity:           0 rows (placeholder structure only)';
PRINT '';
PRINT '  REQUIRED BEFORE PHASE 2:';
PRINT '    - Replace placeholder standard_hours_per_unit in item_resource_rules';
PRINT '    - Confirm units_per_pallet for 1L and 4L items (101233, 101221)';
PRINT '    - Add resource requirements for Plants A2–A5';
PRINT '    - Confirm bottles_per_minute for all lines with NULL speed';
PRINT '    - Enter actual warehouse capacity (pallet positions) per pack type';
PRINT '    - Set standard_hourly_rate on resource_types';
PRINT '    - Confirm plant_code for semi-finished items 500014 and 500027';
GO
