-- =============================================================================
-- RCCP One — Production Orders table
--
-- Stores SAP COOIS export data (planned orders LA + released/firmed orders YPAC)
-- as a 6th required batch file. Used by Phase 2 RCCP engine as the primary
-- production demand input.
--
-- net_quantity = MAX(0, order_quantity - delivered_quantity) — computed at import.
-- production_line is nullable: LA (planned) orders have a line assigned; YPAC
-- (released) orders often do not. A WARNING is raised on upload, not a BLOCKED.
-- =============================================================================

USE RCCP_One;
GO

CREATE TABLE dbo.production_orders (
    production_order_id  BIGINT IDENTITY(1,1) PRIMARY KEY,
    batch_id             INT            NOT NULL,
    sap_order_number     VARCHAR(20)    NOT NULL,
    item_code            VARCHAR(50)    NOT NULL,
    order_type           VARCHAR(10)    NOT NULL,    -- LA (planned) | YPAC (released/firmed)
    mrp_controller       VARCHAR(10)    NULL,        -- 005 lubes | 006 chemicals
    plant_code           VARCHAR(10)    NOT NULL,
    order_quantity       DECIMAL(18, 3) NOT NULL,
    delivered_quantity   DECIMAL(18, 3) NOT NULL,
    net_quantity         DECIMAL(18, 3) NOT NULL,    -- max(0, order_qty - delivered_qty)
    uom                  VARCHAR(10)    NULL,
    basic_start_date     DATE           NOT NULL,
    system_status        VARCHAR(50)    NULL,        -- SAP compound status e.g. 'REL PRT MANC' — widened from VARCHAR(10)
    production_line      VARCHAR(20)    NULL,        -- nullable: LA orders have line, YPAC may not
    source_row_number    INT            NOT NULL,

    CONSTRAINT FK_production_orders_batch
        FOREIGN KEY (batch_id) REFERENCES dbo.import_batches(batch_id)
);
GO

CREATE INDEX IX_production_orders_batch_id
    ON dbo.production_orders (batch_id);
GO

PRINT 'Created table: dbo.production_orders';
GO

PRINT '=== Migration 18 complete: production_orders table created ===';
GO
