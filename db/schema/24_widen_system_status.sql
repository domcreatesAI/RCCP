-- Migration 24: Widen production_orders.system_status from VARCHAR(10) to VARCHAR(50)
-- SAP system_status is a compound field that can contain multiple statuses
-- e.g. 'REL PRT MANC SETC' which exceeds the original 10-char limit.

ALTER TABLE dbo.production_orders
    ALTER COLUMN system_status VARCHAR(50) NULL;
GO
