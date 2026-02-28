-- =============================================================================
-- RCCP One — Line Pack Capabilities
-- Run after 01_masterdata.sql
--
-- Defines which pack sizes each filling line can run, and at what speed.
-- This is masterdata — it describes the physical capability of the line,
-- not what is scheduled (that is line_capacity_calendar from SAP).
--
-- UPLOAD PATTERN:
--   Managed via Excel upload (line_pack_capabilities.xlsx).
--   Full replace on upload — all rows deleted and re-inserted from the file.
--   updated_at / updated_by recorded at upload time.
--
-- LINE-LEVEL FIELDS (on the lines table, not here):
--   oee_target             — target OEE ratio (0.55 = 55%) — same for all pack sizes on a line
--   available_mins_per_day — standard shift length in minutes — same for all pack sizes on a line
--
-- DERIVED IN VIEW (vw_line_pack_capabilities — defined at bottom of this file):
--   litres_per_minute    = pack_size_l × bottles_per_minute
--   effective_mins_per_day = available_mins_per_day × oee_target
--
-- WHY litres_per_minute IS NOT STORED:
--   It is always derivable as pack_size_l × bottles_per_minute.
--   Storing it would create a risk of the three values becoming inconsistent.
-- =============================================================================

USE RCCP_One;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'line_pack_capabilities')
BEGIN
    CREATE TABLE dbo.line_pack_capabilities (
        capability_id       INT             IDENTITY(1,1)   NOT NULL,
        line_code           VARCHAR(50)     NOT NULL,
        pack_size_l         DECIMAL(10,4)   NOT NULL,           -- pack volume in litres, e.g. 2.0, 0.5, 199.0
        bottles_per_minute  DECIMAL(10,4)   NULL,               -- fill speed (NULL = speed not yet confirmed)
        is_active           BIT             NOT NULL    DEFAULT 1,
        updated_at          DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),
        updated_by          VARCHAR(100)    NULL,

        CONSTRAINT PK_line_pack_capabilities        PRIMARY KEY (capability_id),
        CONSTRAINT UQ_line_pack_cap_key             UNIQUE (line_code, pack_size_l),
        CONSTRAINT FK_lpc_line                      FOREIGN KEY (line_code)
            REFERENCES dbo.lines (line_code)
            ON UPDATE CASCADE
            ON DELETE NO ACTION,
        CONSTRAINT CK_lpc_pack_size                 CHECK (pack_size_l > 0),
        CONSTRAINT CK_lpc_bpm                       CHECK (bottles_per_minute IS NULL OR bottles_per_minute > 0)
    );

    CREATE INDEX IX_lpc_line    ON dbo.line_pack_capabilities (line_code);
    CREATE INDEX IX_lpc_active  ON dbo.line_pack_capabilities (is_active);

    PRINT 'Created table: line_pack_capabilities';
END
ELSE
    PRINT 'Table line_pack_capabilities already exists. Skipped.';
GO

-- =============================================================================
-- VW_LINE_PACK_CAPABILITIES
-- Defined here (not in 04_views.sql) because it depends on the
-- line_pack_capabilities table created above.
--
-- Joins line_pack_capabilities with lines metadata.
-- Computes two derived values:
--
-- litres_per_minute = pack_size_l × bottles_per_minute
--   (not stored to avoid inconsistency — always computed from source values)
--
-- effective_mins_per_day = available_mins_per_day × oee_target
--   (theoretical throughput time after OEE adjustment)
--   Phase 3 scenarios override oee_target to model OEE improvement scenarios.
-- =============================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_line_pack_capabilities')
    DROP VIEW dbo.vw_line_pack_capabilities;
GO

CREATE VIEW dbo.vw_line_pack_capabilities
AS
SELECT
    lpc.capability_id,
    lpc.line_code,
    l.line_name,
    l.plant_code,
    l.labour_pool_code,
    l.oee_target,
    l.available_mins_per_day,
    lpc.pack_size_l,
    lpc.bottles_per_minute,
    -- Litres per minute: derived from pack size × bottle speed
    ROUND(lpc.pack_size_l * lpc.bottles_per_minute, 4)          AS litres_per_minute,
    -- Effective minutes after OEE adjustment
    ROUND(l.available_mins_per_day * l.oee_target, 2)            AS effective_mins_per_day,
    lpc.is_active,
    lpc.updated_at,
    lpc.updated_by
FROM
    dbo.line_pack_capabilities lpc
    INNER JOIN dbo.lines l ON l.line_code = lpc.line_code
WHERE
    lpc.is_active = 1;
GO

PRINT 'Created view: vw_line_pack_capabilities';
GO
