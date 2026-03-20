-- =============================================================================
-- RCCP One — Item Resource Rules
-- Run after 01_masterdata.sql
--
-- WHY THIS TABLE EXISTS IN PHASE 1:
--   Phase 2 RCCP requires: Required Hours = Demand Quantity × Standard Hours/Unit
--   Without this table, Phase 2 cannot be added without a schema migration
--   under a live system. The table is created now; populated via seed scripts
--   and managed via Config & Masterdata in Phase 5.
--
-- HOW IT WORKS:
--   Items are grouped into planning families (item_group_code, e.g. '4L', '5L').
--   All items in a group share the same standard_hours_per_unit on a given line.
--   This avoids maintaining a rule per individual SKU and reflects how capacity
--   planning is done in practice.
--
--   One rule = one item group + one line + one valid date range.
--   rule_code: human-readable identifier, e.g. IRR-0001.
--   version:   increments each time a rule is edited and re-published.
--   status:    ACTIVE = in use | ARCHIVED = superseded (kept for audit trail).
--
-- NOTE: item_group_code is defined directly on items in 01_masterdata.sql.
--   No ALTER to items is needed here.
-- =============================================================================

USE RCCP;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'item_resource_rules')
BEGIN
    CREATE TABLE dbo.item_resource_rules (
        rule_id                 INT             IDENTITY(1,1)   NOT NULL,
        rule_code               VARCHAR(20)     NOT NULL,           -- e.g. IRR-0001
        item_group_code         VARCHAR(100)    NOT NULL,           -- e.g. 4L, 5L
        line_code               VARCHAR(50)     NOT NULL,
        standard_hours_per_unit DECIMAL(10,4)   NOT NULL,           -- hours to produce one EA on this line
        valid_from              DATE            NOT NULL,
        valid_to                DATE            NULL,               -- NULL = open-ended (current active rule)
        status                  VARCHAR(20)     NOT NULL    DEFAULT 'ACTIVE',
        version                 INT             NOT NULL    DEFAULT 1,
        notes                   NVARCHAR(500)   NULL,
        created_by              VARCHAR(100)    NULL,
        created_at              DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_item_resource_rules       PRIMARY KEY (rule_id),
        CONSTRAINT UQ_item_resource_rules_code  UNIQUE (rule_code),
        CONSTRAINT UQ_item_resource_rules_key   UNIQUE (item_group_code, line_code, valid_from),
        CONSTRAINT FK_irr_line                  FOREIGN KEY (line_code)
            REFERENCES dbo.lines (line_code)
            ON UPDATE NO ACTION
            ON DELETE NO ACTION,
        CONSTRAINT CK_irr_std_hrs               CHECK (standard_hours_per_unit > 0),
        CONSTRAINT CK_irr_status                CHECK (status IN ('ACTIVE', 'ARCHIVED')),
        CONSTRAINT CK_irr_version               CHECK (version >= 1),
        CONSTRAINT CK_irr_dates                 CHECK (valid_to IS NULL OR valid_to > valid_from)
    );

    CREATE INDEX IX_irr_group_line  ON dbo.item_resource_rules (item_group_code, line_code);
    CREATE INDEX IX_irr_status      ON dbo.item_resource_rules (status);
    CREATE INDEX IX_irr_valid_from  ON dbo.item_resource_rules (valid_from);

    PRINT 'Created table: item_resource_rules';
END
ELSE
    PRINT 'Table item_resource_rules already exists. Skipped.';
GO
