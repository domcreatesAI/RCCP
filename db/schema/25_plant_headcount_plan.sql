-- Migration 25: plant_headcount_plan
-- Adds a new table to track planned headcount for plant-level support roles
-- (Forklift Drivers, Robot Operators, Materials Handlers, etc.) per day per role.
--
-- This table is batch-scoped (like headcount_plan) and keyed by
-- (batch_id, plant_code, resource_type_code, plan_date).
--
-- V2 note: When the in-app headcount calendar is built, it will write to this
-- table via API instead of Excel upload. No schema change will be needed.
--
-- To apply:
--   sqlcmd -S localhost\SQLEXPRESS -d RCCP -E -C -i db\schema\25_plant_headcount_plan.sql

USE RCCP;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'plant_headcount_plan')
BEGIN
    CREATE TABLE dbo.plant_headcount_plan (
        id                  INT             IDENTITY(1,1)   NOT NULL,
        batch_id            INT             NOT NULL,
        plant_code          VARCHAR(20)     NOT NULL,
        resource_type_code  VARCHAR(50)     NOT NULL,
        plan_date           DATE            NOT NULL,
        planned_headcount   DECIMAL(8,2)    NOT NULL    DEFAULT 0,
        source_row_number   INT             NULL,
        created_at          DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_plant_headcount_plan  PRIMARY KEY (id),
        CONSTRAINT FK_php_batch             FOREIGN KEY (batch_id)
            REFERENCES dbo.import_batches (batch_id)
            ON DELETE CASCADE,
        CONSTRAINT FK_php_plant             FOREIGN KEY (plant_code)
            REFERENCES dbo.plants (plant_code)
            ON UPDATE CASCADE ON DELETE NO ACTION,
        CONSTRAINT FK_php_resource_type     FOREIGN KEY (resource_type_code)
            REFERENCES dbo.resource_types (resource_type_code)
            ON UPDATE NO ACTION ON DELETE NO ACTION,
        CONSTRAINT CK_php_headcount         CHECK (planned_headcount >= 0)
    );

    CREATE INDEX IX_php_batch_plant ON dbo.plant_headcount_plan (batch_id, plant_code);
    CREATE INDEX IX_php_batch_date  ON dbo.plant_headcount_plan (batch_id, plan_date);

    PRINT 'Created table dbo.plant_headcount_plan';
END
ELSE
    PRINT 'Table dbo.plant_headcount_plan already exists. Skipped.';
GO
