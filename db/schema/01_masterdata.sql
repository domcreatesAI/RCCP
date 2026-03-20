-- =============================================================================
-- RCCP One — Masterdata Tables
-- Run after 00_create_database.sql
--
-- Tables (in creation order):
--   app_settings, warehouses, plants, pack_types,
--   labour_pools, lines, items
--
-- Creation order matters — FK dependencies:
--   warehouses  → (none)
--   plants      → warehouses
--   pack_types  → (none)
--   labour_pools → plants
--   lines       → plants, labour_pools
--   items       → plants, pack_types
-- =============================================================================

USE RCCP;
GO

-- =============================================================================
-- APP_SETTINGS
-- Key-value configuration store. Avoids hardcoding business rules.
-- Phase 5 can add a UI on top of this table.
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'app_settings')
BEGIN
    CREATE TABLE dbo.app_settings (
        setting_id      INT             IDENTITY(1,1)   NOT NULL,
        setting_key     VARCHAR(100)    NOT NULL,
        setting_value   NVARCHAR(500)   NOT NULL,
        description     NVARCHAR(500)   NULL,
        updated_at      DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),
        updated_by      VARCHAR(100)    NULL,

        CONSTRAINT PK_app_settings      PRIMARY KEY (setting_id),
        CONSTRAINT UQ_app_settings_key  UNIQUE (setting_key)
    );

    PRINT 'Created table: app_settings';
END
ELSE
    PRINT 'Table app_settings already exists. Skipped.';
GO

-- =============================================================================
-- WAREHOUSES
-- Physical warehouse and distribution locations (e.g. UKP1 = Gravesend).
-- All manufacturing also takes place at UKP1 — the filling plants (A1–A5)
-- are sub-divisions of that site.
-- Stock, demand, and warehouse capacity are all scoped to a warehouse.
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'warehouses')
BEGIN
    CREATE TABLE dbo.warehouses (
        warehouse_id    INT             IDENTITY(1,1)   NOT NULL,
        warehouse_code  VARCHAR(20)     NOT NULL,           -- e.g. UKP1
        warehouse_name  VARCHAR(100)    NOT NULL,           -- e.g. Gravesend
        is_active       BIT             NOT NULL    DEFAULT 1,
        created_at      DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_warehouses        PRIMARY KEY (warehouse_id),
        CONSTRAINT UQ_warehouses_code   UNIQUE (warehouse_code)
    );

    CREATE INDEX IX_warehouses_active ON dbo.warehouses (is_active);

    PRINT 'Created table: warehouses';
END
ELSE
    PRINT 'Table warehouses already exists. Skipped.';
GO

-- =============================================================================
-- PLANTS
-- Manufacturing areas within UKP1 (Gravesend). Each plant is a group of
-- filling lines sharing the same physical space and labour pool structure.
-- warehouse_code links the plant to the physical site it sits within
-- (all current plants → UKP1).
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'plants')
BEGIN
    CREATE TABLE dbo.plants (
        plant_id        INT             IDENTITY(1,1)   NOT NULL,
        plant_code      VARCHAR(20)     NOT NULL,           -- e.g. P1, P2
        plant_name      VARCHAR(100)    NOT NULL,           -- e.g. Plant 1, Plant 2
        warehouse_code  VARCHAR(20)     NULL,               -- which physical site this plant is in
        is_active       BIT             NOT NULL    DEFAULT 1,
        created_at      DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_plants            PRIMARY KEY (plant_id),
        CONSTRAINT UQ_plants_code       UNIQUE (plant_code),
        CONSTRAINT FK_plants_warehouse  FOREIGN KEY (warehouse_code)
            REFERENCES dbo.warehouses (warehouse_code)
            ON UPDATE CASCADE
            ON DELETE SET NULL
    );

    CREATE INDEX IX_plants_warehouse    ON dbo.plants (warehouse_code);
    CREATE INDEX IX_plants_active       ON dbo.plants (is_active);

    PRINT 'Created table: plants';
END
ELSE
    PRINT 'Table plants already exists. Skipped.';
GO

-- =============================================================================
-- PACK_TYPES
-- Groups pack sizes into warehouse capacity categories.
-- One pack type = one row in warehouse_capacity (pallets allocated per type).
-- Examples: Small Pack (1L/2L/5L), 60L, 200L Barrel, IBC.
-- New types can be added as a new row — no schema change required.
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'pack_types')
BEGIN
    CREATE TABLE dbo.pack_types (
        pack_type_id    INT             IDENTITY(1,1)   NOT NULL,
        pack_type_code  VARCHAR(50)     NOT NULL,           -- e.g. SMALL_PACK
        pack_type_name  VARCHAR(100)    NOT NULL,           -- e.g. Small Pack (1L, 2L, 5L)
        notes           NVARCHAR(500)   NULL,
        is_active       BIT             NOT NULL    DEFAULT 1,
        created_at      DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_pack_types        PRIMARY KEY (pack_type_id),
        CONSTRAINT UQ_pack_types_code   UNIQUE (pack_type_code)
    );

    CREATE INDEX IX_pack_types_active ON dbo.pack_types (is_active);

    PRINT 'Created table: pack_types';
END
ELSE
    PRINT 'Table pack_types already exists. Skipped.';
GO

-- =============================================================================
-- LABOUR_POOLS
-- A group of filling lines that share a workforce at a manufacturing plant.
-- max_concurrent_lines: the physical ceiling on how many lines in this pool
-- can run simultaneously (space / equipment constraint — not a headcount limit).
-- Headcount requirements per line are in line_resource_requirements (script 06).
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'labour_pools')
BEGIN
    CREATE TABLE dbo.labour_pools (
        pool_id                 INT             IDENTITY(1,1)   NOT NULL,
        pool_code               VARCHAR(50)     NOT NULL,
        pool_name               VARCHAR(100)    NOT NULL,
        plant_code              VARCHAR(20)     NOT NULL,
        max_concurrent_lines    INT             NOT NULL    DEFAULT 1,
        notes                   NVARCHAR(500)   NULL,
        is_active               BIT             NOT NULL    DEFAULT 1,
        created_at              DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_labour_pools          PRIMARY KEY (pool_id),
        CONSTRAINT UQ_labour_pools_code     UNIQUE (pool_code),
        CONSTRAINT FK_labour_pools_plant    FOREIGN KEY (plant_code)
            REFERENCES dbo.plants (plant_code)
            ON UPDATE CASCADE
            ON DELETE NO ACTION,
        CONSTRAINT CK_labour_pools_max_concurrent
            CHECK (max_concurrent_lines >= 1)
    );

    CREATE INDEX IX_labour_pools_plant  ON dbo.labour_pools (plant_code);
    CREATE INDEX IX_labour_pools_active ON dbo.labour_pools (is_active);

    PRINT 'Created table: labour_pools';
END
ELSE
    PRINT 'Table labour_pools already exists. Skipped.';
GO

-- =============================================================================
-- LINES
-- Production filling lines. Each line belongs to a manufacturing plant and
-- optionally to a labour pool (lines with dedicated crew have no pool).
--
-- oee_target: default OEE used in capacity calculations (0.55 = 55%).
--   Phase 3 scenario engine can override this per scenario.
--
-- available_mins_per_day: standard shift length for this line in minutes
--   (420 = 7 hours). Used with oee_target to compute effective capacity.
--   Phase 3 scenario engine can override this to model additional shifts.
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'lines')
BEGIN
    CREATE TABLE dbo.lines (
        line_id                 INT             IDENTITY(1,1)   NOT NULL,
        line_code               VARCHAR(50)     NOT NULL,
        line_name               VARCHAR(100)    NOT NULL,
        plant_code              VARCHAR(20)     NOT NULL,
        labour_pool_code        VARCHAR(50)     NULL,
        oee_target              DECIMAL(6,4)    NOT NULL    DEFAULT 0.55,
        available_mins_per_day  DECIMAL(8,2)    NOT NULL    DEFAULT 420,
        is_active               BIT             NOT NULL    DEFAULT 1,
        created_at              DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_lines                 PRIMARY KEY (line_id),
        CONSTRAINT UQ_lines_code            UNIQUE (line_code),
        CONSTRAINT FK_lines_plant           FOREIGN KEY (plant_code)
            REFERENCES dbo.plants (plant_code)
            ON UPDATE CASCADE
            ON DELETE NO ACTION,
        CONSTRAINT FK_lines_labour_pool     FOREIGN KEY (labour_pool_code)
            REFERENCES dbo.labour_pools (pool_code)
            ON UPDATE NO ACTION     -- Prevents multiple cascade paths via plants
            ON DELETE NO ACTION,    -- Application must nullify before deleting a pool
        CONSTRAINT CK_lines_oee_target      CHECK (oee_target > 0 AND oee_target <= 1),
        CONSTRAINT CK_lines_avail_mins      CHECK (available_mins_per_day > 0)
    );

    CREATE INDEX IX_lines_plant         ON dbo.lines (plant_code);
    CREATE INDEX IX_lines_labour_pool   ON dbo.lines (labour_pool_code);
    CREATE INDEX IX_lines_active        ON dbo.lines (is_active);

    PRINT 'Created table: lines';
END
ELSE
    PRINT 'Table lines already exists. Skipped.';
GO

-- =============================================================================
-- ITEMS
-- Products (SKUs) that appear in stock snapshots, demand plans, and
-- inventory rules. item_code must match the SAP material number exactly.
--
-- item_group_code: planning family used by item_resource_rules. All items in
--   a group share the same standard_hours_per_unit on a given line.
--   Typically the pack size (e.g. '4L', '5L').
--
-- pack_size_l: pack volume in litres — used to convert EA quantities to litres
--   for higher-level reporting (e.g. 500 EA × 2L = 1,000 L).
--
-- pack_type_code: which warehouse capacity category this SKU belongs to
--   (e.g. SMALL_PACK, 60L, BARREL_200L, IBC). Used for warehouse space checks.
--
-- units_per_pallet: how many EA fit on one standard pallet.
--   Used to convert stock quantities to pallet positions for warehouse capacity.
--
-- sku_status: SAP lifecycle flag — updated via a separate SKU status upload.
--   1 = In Design  |  2 = Phasing Out  |  3 = Obsolete
--   NULL = status not yet loaded.
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'items')
BEGIN
    CREATE TABLE dbo.items (
        item_id              INT             IDENTITY(1,1)   NOT NULL,
        item_code            VARCHAR(50)     NOT NULL,
        item_description     VARCHAR(200)    NULL,
        item_type            VARCHAR(50)     NULL,           -- FINISHED_GOOD | SEMI_FINISHED | RAW_MATERIAL
        item_group_code      VARCHAR(100)    NULL,           -- Planning family, e.g. '4L', '5L'
        abc_indicator        VARCHAR(10)     NULL,           -- SAP ABC indicator
        mrp_type             VARCHAR(10)     NULL,           -- SAP MRP type (e.g. PD, VB, ND)
        plant_code           VARCHAR(20)     NULL,           -- Primary manufacturing plant
        pack_size_l          DECIMAL(10,4)   NULL,           -- Pack volume in litres
        pack_type_code       VARCHAR(50)     NULL,           -- FK to pack_types
        units_per_pallet     INT             NULL,           -- EA per pallet (for stock → pallet conversion)
        moq                  DECIMAL(18,4)   NULL,           -- Minimum order quantity
        sku_status           TINYINT         NULL,           -- 1=In Design, 2=Phasing Out, 3=Obsolete
        primary_line_code    VARCHAR(20)     NULL,           -- Primary production line
        secondary_line_code  VARCHAR(20)     NULL,           -- Secondary production line
        tertiary_line_code   VARCHAR(20)     NULL,           -- Tertiary production line
        quaternary_line_code VARCHAR(20)     NULL,           -- Quaternary production line
        unit_cost            DECIMAL(18,4)   NULL,           -- Standard unit cost
        is_active            BIT             NOT NULL    DEFAULT 1,
        created_at           DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_items                 PRIMARY KEY (item_id),
        CONSTRAINT UQ_items_code            UNIQUE (item_code),
        CONSTRAINT FK_items_plant           FOREIGN KEY (plant_code)
            REFERENCES dbo.plants (plant_code)
            ON UPDATE CASCADE
            ON DELETE NO ACTION,
        CONSTRAINT FK_items_pack_type       FOREIGN KEY (pack_type_code)
            REFERENCES dbo.pack_types (pack_type_code)
            ON UPDATE NO ACTION
            ON DELETE NO ACTION,
        CONSTRAINT CK_items_type            CHECK (
            item_type IS NULL OR
            item_type IN ('FINISHED_GOOD', 'SEMI_FINISHED', 'RAW_MATERIAL')
        ),
        CONSTRAINT CK_items_sku_status      CHECK (sku_status IS NULL OR sku_status IN (1, 2, 3)),
        CONSTRAINT CK_items_pack_size       CHECK (pack_size_l IS NULL OR pack_size_l > 0),
        CONSTRAINT CK_items_units_per_pallet CHECK (units_per_pallet IS NULL OR units_per_pallet > 0)
    );

    CREATE INDEX IX_items_plant         ON dbo.items (plant_code);
    CREATE INDEX IX_items_type          ON dbo.items (item_type);
    CREATE INDEX IX_items_group         ON dbo.items (item_group_code)
        WHERE item_group_code IS NOT NULL;
    CREATE INDEX IX_items_pack_type     ON dbo.items (pack_type_code)
        WHERE pack_type_code IS NOT NULL;
    CREATE INDEX IX_items_active        ON dbo.items (is_active);

    PRINT 'Created table: items';
END
ELSE
    PRINT 'Table items already exists. Skipped.';
GO
