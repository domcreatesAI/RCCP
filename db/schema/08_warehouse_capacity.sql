-- =============================================================================
-- RCCP One — Warehouse Capacity
-- Run after 01_masterdata.sql
--
-- Defines the maximum pallet capacity per pack type per warehouse location.
-- Warehouse space is a finite constraint — running out of space for a pack
-- type can prevent filling lines from running even when labour is available.
--
-- Pack types group pack sizes into capacity categories:
--   SMALL_PACK  → 1L, 2L, 5L products
--   60L         → 60 litre drums
--   BARREL_200L → 200 litre barrels
--   IBC         → IBC containers
--
-- PHASE 1: Stores the capacity data. No constraint check calculations yet.
-- PHASE 2: RCCP engine compares stock_pallets (derived from master_stock
--          using items.units_per_pallet) against max_pallet_capacity and
--          flags any pack type approaching or exceeding the limit.
--
-- UPLOAD PATTERN:
--   Managed via Excel upload (warehouse_master.xlsx).
--   Full replace on upload — all rows deleted and re-inserted.
--   updated_at / updated_by recorded at upload time.
-- =============================================================================

USE RCCP;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'warehouse_capacity')
BEGIN
    CREATE TABLE dbo.warehouse_capacity (
        capacity_id         INT             IDENTITY(1,1)   NOT NULL,
        warehouse_code      VARCHAR(20)     NOT NULL,
        pack_type_code      VARCHAR(50)     NOT NULL,
        max_pallet_capacity INT             NOT NULL,           -- maximum pallet positions for this pack type
        updated_at          DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),
        updated_by          VARCHAR(100)    NULL,

        CONSTRAINT PK_warehouse_capacity        PRIMARY KEY (capacity_id),
        CONSTRAINT UQ_warehouse_capacity_key    UNIQUE (warehouse_code, pack_type_code),
        CONSTRAINT FK_wc_warehouse              FOREIGN KEY (warehouse_code)
            REFERENCES dbo.warehouses (warehouse_code)
            ON UPDATE CASCADE
            ON DELETE NO ACTION,
        CONSTRAINT FK_wc_pack_type              FOREIGN KEY (pack_type_code)
            REFERENCES dbo.pack_types (pack_type_code)
            ON UPDATE NO ACTION
            ON DELETE NO ACTION,
        CONSTRAINT CK_wc_max_pallets            CHECK (max_pallet_capacity > 0)
    );

    CREATE INDEX IX_wc_warehouse    ON dbo.warehouse_capacity (warehouse_code);
    CREATE INDEX IX_wc_pack_type    ON dbo.warehouse_capacity (pack_type_code);

    PRINT 'Created table: warehouse_capacity';
END
ELSE
    PRINT 'Table warehouse_capacity already exists. Skipped.';
GO
