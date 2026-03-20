-- =============================================================================
-- RCCP One — Resource Requirements
-- Run after 01_masterdata.sql
--
-- Replaces the previous support_staff_pools / support_staff_line_assignments
-- design with a unified, Excel-uploadable resource requirements model.
--
-- TABLES:
--   resource_types              — controlled vocabulary for staff roles
--   line_resource_requirements  — headcount needed per line (e.g. Line Operators)
--   plant_resource_requirements — shared headcount per plant (e.g. Forklift Drivers)
--
-- UPLOAD PATTERN:
--   Managed via a single Excel file (two tabs: Line Resources, Plant Resources).
--   Full replace on upload — all rows deleted and re-inserted from the file.
--   updated_at / updated_by recorded at upload time.
--
-- PHASE 2 USE:
--   The RCCP engine compares headcount_required against planned_headcount
--   from staffing_plan to identify shortfalls and constrain capacity.
--   standard_hourly_rate feeds cost-of-additional-capacity calculations.
-- =============================================================================

USE RCCP;
GO

-- =============================================================================
-- RESOURCE_TYPES
-- Controlled vocabulary of staff roles used across resource requirements.
-- scope defines which Excel tab the role belongs to:
--   LINE  = required per individual line (e.g. Line Operator, Team Leader)
--   PLANT = shared across the whole plant (e.g. Forklift Driver, Robot Operator)
--
-- Adding a new role = insert one row here. No schema change required.
-- standard_hourly_rate: cost per hour for this role type.
--   Used in Phase 3 to calculate cost of overtime / additional shifts.
--   NULL = rate not yet configured (Phase 2 treats as cost-unknown).
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'resource_types')
BEGIN
    CREATE TABLE dbo.resource_types (
        resource_type_id        INT             IDENTITY(1,1)   NOT NULL,
        resource_type_code      VARCHAR(50)     NOT NULL,           -- e.g. LINE_OPERATOR
        resource_type_name      VARCHAR(100)    NOT NULL,           -- e.g. Line Operator (shown in Excel + UI)
        scope                   VARCHAR(10)     NOT NULL,           -- LINE or PLANT
        standard_hourly_rate    DECIMAL(10,2)   NULL,               -- cost per hour (for Phase 3 cost calculations)
        notes                   NVARCHAR(500)   NULL,
        is_active               BIT             NOT NULL    DEFAULT 1,
        created_at              DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_resource_types        PRIMARY KEY (resource_type_id),
        CONSTRAINT UQ_resource_types_code   UNIQUE (resource_type_code),
        CONSTRAINT UQ_resource_types_name   UNIQUE (resource_type_name),
        CONSTRAINT CK_resource_types_scope  CHECK (scope IN ('LINE', 'PLANT')),
        CONSTRAINT CK_resource_types_rate   CHECK (standard_hourly_rate IS NULL OR standard_hourly_rate >= 0)
    );

    CREATE INDEX IX_resource_types_scope  ON dbo.resource_types (scope);
    CREATE INDEX IX_resource_types_active ON dbo.resource_types (is_active);

    PRINT 'Created table: resource_types';
END
ELSE
    PRINT 'Table resource_types already exists. Skipped.';
GO

-- =============================================================================
-- LINE_RESOURCE_REQUIREMENTS
-- How many people of each role are needed to run one line.
-- One row per line per resource type (LINE-scope only).
--
-- Example: Line A101 requires 3 Line Operators and 1 Team Leader.
--
-- Phase 2 formula (per line, per period):
--   shortfall = headcount_required - planned_headcount (from staffing_plan)
--   If shortfall > 0 → line cannot run at full capacity (or at all).
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'line_resource_requirements')
BEGIN
    CREATE TABLE dbo.line_resource_requirements (
        requirement_id      INT             IDENTITY(1,1)   NOT NULL,
        line_code           VARCHAR(50)     NOT NULL,
        resource_type_code  VARCHAR(50)     NOT NULL,
        headcount_required  DECIMAL(8,2)    NOT NULL,           -- number of people needed to run this line
        updated_at          DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),
        updated_by          VARCHAR(100)    NULL,

        CONSTRAINT PK_line_resource_requirements    PRIMARY KEY (requirement_id),
        CONSTRAINT UQ_lrr_line_type                 UNIQUE (line_code, resource_type_code),
        CONSTRAINT FK_lrr_line                      FOREIGN KEY (line_code)
            REFERENCES dbo.lines (line_code)
            ON UPDATE CASCADE
            ON DELETE NO ACTION,
        CONSTRAINT FK_lrr_resource_type             FOREIGN KEY (resource_type_code)
            REFERENCES dbo.resource_types (resource_type_code)
            ON UPDATE NO ACTION
            ON DELETE NO ACTION,
        CONSTRAINT CK_lrr_headcount                 CHECK (headcount_required > 0)
    );

    CREATE INDEX IX_lrr_line    ON dbo.line_resource_requirements (line_code);
    CREATE INDEX IX_lrr_type    ON dbo.line_resource_requirements (resource_type_code);

    PRINT 'Created table: line_resource_requirements';
END
ELSE
    PRINT 'Table line_resource_requirements already exists. Skipped.';
GO

-- =============================================================================
-- PLANT_RESOURCE_REQUIREMENTS
-- Shared headcount required at the manufacturing plant level.
-- One row per plant per resource type (PLANT-scope only).
--
-- Example: Plant A1 requires 1 Robot Operator, 2 Forklift Drivers,
--          1 Material Handler — regardless of how many lines are running.
--
-- Phase 2: if available shared headcount falls below headcount_required,
-- this constrains which lines can run or flags a risk in RCCP output.
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'plant_resource_requirements')
BEGIN
    CREATE TABLE dbo.plant_resource_requirements (
        requirement_id      INT             IDENTITY(1,1)   NOT NULL,
        plant_code          VARCHAR(20)     NOT NULL,
        resource_type_code  VARCHAR(50)     NOT NULL,
        headcount_required  DECIMAL(8,2)    NOT NULL,           -- total people needed at this plant
        updated_at          DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),
        updated_by          VARCHAR(100)    NULL,

        CONSTRAINT PK_plant_resource_requirements   PRIMARY KEY (requirement_id),
        CONSTRAINT UQ_prr_plant_type                UNIQUE (plant_code, resource_type_code),
        CONSTRAINT FK_prr_plant                     FOREIGN KEY (plant_code)
            REFERENCES dbo.plants (plant_code)
            ON UPDATE CASCADE
            ON DELETE NO ACTION,
        CONSTRAINT FK_prr_resource_type             FOREIGN KEY (resource_type_code)
            REFERENCES dbo.resource_types (resource_type_code)
            ON UPDATE NO ACTION
            ON DELETE NO ACTION,
        CONSTRAINT CK_prr_headcount                 CHECK (headcount_required > 0)
    );

    CREATE INDEX IX_prr_plant   ON dbo.plant_resource_requirements (plant_code);
    CREATE INDEX IX_prr_type    ON dbo.plant_resource_requirements (resource_type_code);

    PRINT 'Created table: plant_resource_requirements';
END
ELSE
    PRINT 'Table plant_resource_requirements already exists. Skipped.';
GO
