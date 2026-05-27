-- Migration 28: Add actual_production table for SAP MB51 goods receipts
-- Run against RCCP database
USE RCCP;
GO

-- 1. Create actual_production planning data table
CREATE TABLE dbo.actual_production (
    receipt_id        BIGINT IDENTITY(1,1) NOT NULL,
    batch_id          INT NOT NULL,
    item_code         VARCHAR(50) NOT NULL,
    plant_code        VARCHAR(20) NOT NULL,
    posting_date      DATE NOT NULL,
    quantity_ea       DECIMAL(18,4) NOT NULL,
    quantity_l        DECIMAL(18,4) NULL,        -- qty_ea x pack_size_l, computed on publish
    movement_type     VARCHAR(10) NULL,
    sap_order_no      VARCHAR(20) NULL,
    material_doc      VARCHAR(20) NULL,
    source_row_number INT NOT NULL,
    created_at        DATETIME2(7) NOT NULL CONSTRAINT DF_actual_production_created_at DEFAULT GETUTCDATE(),

    CONSTRAINT PK_actual_production PRIMARY KEY (receipt_id),
    CONSTRAINT FK_actual_production_batch FOREIGN KEY (batch_id)
        REFERENCES dbo.import_batches(batch_id) ON DELETE CASCADE,
    CONSTRAINT FK_actual_production_item  FOREIGN KEY (item_code)
        REFERENCES dbo.items(item_code),
    CONSTRAINT CK_actual_production_qty   CHECK (quantity_ea >= 0)
);
GO

CREATE INDEX IX_actual_prod_batch ON dbo.actual_production (batch_id);
CREATE INDEX IX_actual_prod_item  ON dbo.actual_production (item_code);
CREATE INDEX IX_actual_prod_date  ON dbo.actual_production (posting_date);
GO

-- 2. Widen the import_batch_files CHECK constraint to include actual_production
-- SQL Server requires DROP + recreate (cannot ALTER CHECK constraint)
ALTER TABLE dbo.import_batch_files DROP CONSTRAINT CK_import_batch_files_type;
GO

ALTER TABLE dbo.import_batch_files ADD CONSTRAINT CK_import_batch_files_type CHECK (
    file_type IN (
        'master_stock',
        'demand_plan',
        'line_capacity_calendar',
        'headcount_plan',
        'portfolio_changes',
        'production_orders',
        'actual_production'
    )
);
GO

PRINT 'Migration 28 complete: actual_production table created, CK_import_batch_files_type widened.';
GO
