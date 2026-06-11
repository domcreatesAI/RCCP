-- Migration 30: headcount_exceptions
-- One row per known absence event affecting planned headcount within a batch.
-- Standard headcount stays on headcount_plan / plant_headcount_plan; exceptions
-- here are deltas applied by the RCCP engine when computing effective FTE.
--
-- Constraints:
--   * exactly one of (line_code, plant_code) must be set
--   * if plant_code is set, role_code is required (must name the plant-shared role)
--   * if line_code is set, role_code may be blank (delta distributed across the
--     line's roles in proportion to line_resource_requirements)
--
-- To apply:
--   sqlcmd -S 172.17.136.4 -d RCCP -U RCCP.admin -P <password> -C -i db\schema\30_headcount_exceptions.sql

USE RCCP;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'headcount_exceptions')
BEGIN
    CREATE TABLE dbo.headcount_exceptions (
        exception_id        INT             IDENTITY(1,1)   NOT NULL,
        batch_id            INT             NOT NULL,
        line_code           VARCHAR(50)     NULL,
        plant_code          VARCHAR(20)     NULL,
        resource_type_code  VARCHAR(50)     NULL,
        start_date          DATE            NOT NULL,
        end_date            DATE            NOT NULL,
        delta_headcount     DECIMAL(8,2)    NOT NULL,
        reason              NVARCHAR(500)   NULL,
        source_row_number   INT             NULL,
        created_at          DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_headcount_exceptions      PRIMARY KEY (exception_id),
        CONSTRAINT FK_he_batch                  FOREIGN KEY (batch_id)
            REFERENCES dbo.import_batches (batch_id)
            ON DELETE CASCADE,
        CONSTRAINT FK_he_line                   FOREIGN KEY (line_code)
            REFERENCES dbo.lines (line_code)
            ON UPDATE NO ACTION ON DELETE NO ACTION,
        CONSTRAINT FK_he_plant                  FOREIGN KEY (plant_code)
            REFERENCES dbo.plants (plant_code)
            ON UPDATE NO ACTION ON DELETE NO ACTION,
        CONSTRAINT FK_he_resource_type          FOREIGN KEY (resource_type_code)
            REFERENCES dbo.resource_types (resource_type_code)
            ON UPDATE NO ACTION ON DELETE NO ACTION,
        CONSTRAINT CK_he_scope                  CHECK (
            (line_code IS NOT NULL AND plant_code IS NULL) OR
            (line_code IS NULL     AND plant_code IS NOT NULL)
        ),
        CONSTRAINT CK_he_plant_needs_role       CHECK (
            plant_code IS NULL OR resource_type_code IS NOT NULL
        ),
        CONSTRAINT CK_he_dates                  CHECK (end_date >= start_date)
    );

    CREATE INDEX IX_he_batch_line  ON dbo.headcount_exceptions (batch_id, line_code);
    CREATE INDEX IX_he_batch_plant ON dbo.headcount_exceptions (batch_id, plant_code);

    PRINT 'Created table dbo.headcount_exceptions';
END
ELSE
    PRINT 'Table dbo.headcount_exceptions already exists. Skipped.';
GO
