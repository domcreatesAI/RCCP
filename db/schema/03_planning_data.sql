-- =============================================================================
-- RCCP One — Planning Data Tables
-- Run after 02_workflow.sql
--
-- Tables: master_stock, demand_plan, line_capacity_calendar,
--         staffing_plan, oee_daily, portfolio_changes
--
-- All planning data rows are scoped to a batch_id.
-- When a batch is archived, the data rows remain for historical reference.
-- =============================================================================

USE RCCP_One;
GO

-- =============================================================================
-- MASTER_STOCK
-- Stock snapshot per SKU per warehouse location at a point in time.
-- One row per item per warehouse per snapshot date within a batch.
--
-- total_stock_ea:  Total physical stock on hand in EA (from SAP export).
-- free_stock_ea:   Total stock minus sales order allocations in EA.
--                  Represents stock available to commit to new orders.
-- sales_allocated_ea: NOT stored — derived in vw_master_stock as
--                  (total_stock_ea - free_stock_ea).
-- safety_stock_ea: Target minimum stock level per SKU per warehouse (from SAP).
--
-- mrp_type: SAP planning type for the material (e.g. PD, MK).
--   ZN items (discontinued) are filtered out before upload — not expected here.
--
-- warehouse_code references warehouses (UKP1–UKP5), not manufacturing plants.
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'master_stock')
BEGIN
    CREATE TABLE dbo.master_stock (
        stock_id            INT             IDENTITY(1,1)   NOT NULL,
        batch_id            INT             NOT NULL,
        warehouse_code      VARCHAR(20)     NOT NULL,
        item_code           VARCHAR(50)     NOT NULL,
        snapshot_date       DATE            NOT NULL,
        mrp_type            VARCHAR(10)     NULL,
        total_stock_ea      DECIMAL(18,4)   NOT NULL    DEFAULT 0,
        free_stock_ea       DECIMAL(18,4)   NOT NULL    DEFAULT 0,
        safety_stock_ea     DECIMAL(18,4)   NULL,
        source_row_number   INT             NULL,           -- Row in source Excel (for error tracing)
        created_at          DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_master_stock              PRIMARY KEY (stock_id),
        CONSTRAINT UQ_master_stock_key          UNIQUE (batch_id, warehouse_code, item_code, snapshot_date),
        CONSTRAINT FK_master_stock_batch        FOREIGN KEY (batch_id)
            REFERENCES dbo.import_batches (batch_id)
            ON DELETE CASCADE,
        CONSTRAINT FK_master_stock_warehouse    FOREIGN KEY (warehouse_code)
            REFERENCES dbo.warehouses (warehouse_code)
            ON UPDATE NO ACTION ON DELETE NO ACTION,
        CONSTRAINT FK_master_stock_item         FOREIGN KEY (item_code)
            REFERENCES dbo.items (item_code)
            ON UPDATE NO ACTION ON DELETE NO ACTION,
        CONSTRAINT CK_master_stock_total        CHECK (total_stock_ea >= 0),
        CONSTRAINT CK_master_stock_free         CHECK (free_stock_ea >= 0),
        CONSTRAINT CK_master_stock_safety       CHECK (safety_stock_ea IS NULL OR safety_stock_ea >= 0)
    );

    CREATE INDEX IX_master_stock_batch_item     ON dbo.master_stock (batch_id, item_code);
    CREATE INDEX IX_master_stock_batch_wh       ON dbo.master_stock (batch_id, warehouse_code);
    CREATE INDEX IX_master_stock_batch_date     ON dbo.master_stock (batch_id, snapshot_date);

    PRINT 'Created table: master_stock';
END
ELSE
    PRINT 'Table master_stock already exists. Skipped.';
GO

-- =============================================================================
-- DEMAND_PLAN
-- Planned demand per SKU per warehouse per period.
-- References warehouse_code (UKP1–UKP5) — demand is tracked at the
-- distribution location level, not the manufacturing plant level.
--
-- period_type: MONTHLY (current) or WEEKLY (future — when SAP provides it).
--   For MONTHLY: period_start_date = first day of the month.
--   For WEEKLY:  period_start_date = Monday of the week.
--
-- Weekly bucketing from monthly data is computed at query time:
--   weekly_demand = demand_quantity / CEILING(days_in_month / 7.0)
--   This gives 4 or 5 weeks per month. No data transformation on ingest.
--   When SAP provides weekly data directly, upload with period_type = WEEKLY.
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'demand_plan')
BEGIN
    CREATE TABLE dbo.demand_plan (
        demand_id           INT             IDENTITY(1,1)   NOT NULL,
        batch_id            INT             NOT NULL,
        warehouse_code      VARCHAR(20)     NOT NULL,
        item_code           VARCHAR(50)     NOT NULL,
        period_type         VARCHAR(10)     NOT NULL    DEFAULT 'MONTHLY',
        period_start_date   DATE            NOT NULL,
        period_end_date     DATE            NULL,
        demand_quantity     DECIMAL(18,4)   NOT NULL    DEFAULT 0,
        demand_type         VARCHAR(50)     NULL,           -- FORECAST | CONFIRMED_ORDER | CONSENSUS
        source_row_number   INT             NULL,
        created_at          DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_demand_plan               PRIMARY KEY (demand_id),
        CONSTRAINT FK_demand_plan_batch         FOREIGN KEY (batch_id)
            REFERENCES dbo.import_batches (batch_id)
            ON DELETE CASCADE,
        CONSTRAINT FK_demand_plan_warehouse     FOREIGN KEY (warehouse_code)
            REFERENCES dbo.warehouses (warehouse_code)
            ON UPDATE NO ACTION ON DELETE NO ACTION,
        CONSTRAINT FK_demand_plan_item          FOREIGN KEY (item_code)
            REFERENCES dbo.items (item_code)
            ON UPDATE NO ACTION ON DELETE NO ACTION,
        CONSTRAINT CK_demand_plan_period_type   CHECK (period_type IN ('MONTHLY', 'WEEKLY')),
        CONSTRAINT CK_demand_plan_qty           CHECK (demand_quantity >= 0),
        CONSTRAINT CK_demand_plan_dates         CHECK (
            period_end_date IS NULL OR period_end_date >= period_start_date
        )
    );

    CREATE INDEX IX_demand_plan_batch_item      ON dbo.demand_plan (batch_id, item_code);
    CREATE INDEX IX_demand_plan_batch_wh        ON dbo.demand_plan (batch_id, warehouse_code);
    CREATE INDEX IX_demand_plan_batch_period    ON dbo.demand_plan (batch_id, period_start_date);

    PRINT 'Created table: demand_plan';
END
ELSE
    PRINT 'Table demand_plan already exists. Skipped.';
GO

-- =============================================================================
-- LINE_CAPACITY_CALENDAR
-- Daily capacity inputs per production line per batch (from SAP export).
-- One row per line per calendar date.
-- Covers minimum 12 months forward (validated at BUSINESS_RULE_CHECK stage).
--
-- net_theoretical_hours is NOT stored here — computed as:
--   standard_hours - maintenance_hours - public_holiday_hours
--   - planned_downtime_hours - other_loss_hours
-- See view: vw_line_capacity_with_net in 04_views.sql
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'line_capacity_calendar')
BEGIN
    CREATE TABLE dbo.line_capacity_calendar (
        calendar_id             INT             IDENTITY(1,1)   NOT NULL,
        batch_id                INT             NOT NULL,
        line_code               VARCHAR(50)     NOT NULL,
        calendar_date           DATE            NOT NULL,
        is_working_day          BIT             NOT NULL    DEFAULT 1,
        standard_hours          DECIMAL(8,2)    NOT NULL    DEFAULT 0,
        planned_hours           DECIMAL(8,2)    NOT NULL    DEFAULT 0,
        maintenance_hours       DECIMAL(8,2)    NOT NULL    DEFAULT 0,
        public_holiday_hours    DECIMAL(8,2)    NOT NULL    DEFAULT 0,
        planned_downtime_hours  DECIMAL(8,2)    NOT NULL    DEFAULT 0,
        other_loss_hours        DECIMAL(8,2)    NOT NULL    DEFAULT 0,
        notes                   NVARCHAR(500)   NULL,
        source_row_number       INT             NULL,
        created_at              DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_line_capacity_calendar    PRIMARY KEY (calendar_id),
        CONSTRAINT UQ_line_cap_batch_line_date  UNIQUE (batch_id, line_code, calendar_date),
        CONSTRAINT FK_line_cap_batch            FOREIGN KEY (batch_id)
            REFERENCES dbo.import_batches (batch_id)
            ON DELETE CASCADE,
        CONSTRAINT FK_line_cap_line             FOREIGN KEY (line_code)
            REFERENCES dbo.lines (line_code)
            ON UPDATE CASCADE ON DELETE NO ACTION,
        CONSTRAINT CK_line_cap_std_hours        CHECK (standard_hours >= 0),
        CONSTRAINT CK_line_cap_planned_hours    CHECK (planned_hours >= 0),
        CONSTRAINT CK_line_cap_maint_hours      CHECK (maintenance_hours >= 0),
        CONSTRAINT CK_line_cap_ph_hours         CHECK (public_holiday_hours >= 0),
        CONSTRAINT CK_line_cap_downtime_hours   CHECK (planned_downtime_hours >= 0),
        CONSTRAINT CK_line_cap_other_hours      CHECK (other_loss_hours >= 0)
    );

    CREATE INDEX IX_line_cap_batch_line     ON dbo.line_capacity_calendar (batch_id, line_code);
    CREATE INDEX IX_line_cap_batch_date     ON dbo.line_capacity_calendar (batch_id, calendar_date);

    PRINT 'Created table: line_capacity_calendar';
END
ELSE
    PRINT 'Table line_capacity_calendar already exists. Skipped.';
GO

-- =============================================================================
-- STAFFING_PLAN
-- Planned headcount and available labour hours per line per date (SAP export).
-- Phase 2 RCCP engine compares planned_headcount against
-- line_resource_requirements to identify staffing shortfalls.
-- shift_code is optional — some plants plan by shift, others by day.
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'staffing_plan')
BEGIN
    CREATE TABLE dbo.staffing_plan (
        staffing_id         INT             IDENTITY(1,1)   NOT NULL,
        batch_id            INT             NOT NULL,
        line_code           VARCHAR(50)     NOT NULL,
        plan_date           DATE            NOT NULL,
        shift_code          VARCHAR(50)     NULL,
        planned_headcount   DECIMAL(8,2)    NOT NULL    DEFAULT 0,
        available_hours     DECIMAL(8,2)    NULL,
        notes               NVARCHAR(500)   NULL,
        source_row_number   INT             NULL,
        created_at          DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_staffing_plan             PRIMARY KEY (staffing_id),
        CONSTRAINT FK_staffing_plan_batch       FOREIGN KEY (batch_id)
            REFERENCES dbo.import_batches (batch_id)
            ON DELETE CASCADE,
        CONSTRAINT FK_staffing_plan_line        FOREIGN KEY (line_code)
            REFERENCES dbo.lines (line_code)
            ON UPDATE CASCADE ON DELETE NO ACTION,
        CONSTRAINT CK_staffing_plan_headcount   CHECK (planned_headcount >= 0),
        CONSTRAINT CK_staffing_plan_hours       CHECK (available_hours IS NULL OR available_hours >= 0)
    );

    CREATE INDEX IX_staffing_batch_line ON dbo.staffing_plan (batch_id, line_code);
    CREATE INDEX IX_staffing_batch_date ON dbo.staffing_plan (batch_id, plan_date);

    PRINT 'Created table: staffing_plan';
END
ELSE
    PRINT 'Table staffing_plan already exists. Skipped.';
GO

-- =============================================================================
-- OEE_DAILY
-- Overall Equipment Effectiveness per line per day (optional SAP export).
-- Stores actual or forecast OEE components per line.
-- oee_pct = availability × performance × quality (all as decimals 0.0–1.0).
--
-- OPTIONAL: missing file results in a WARNING on batch readiness, not BLOCKED.
--
-- Note: oee_pct here is the actual/forecast daily value from SAP.
-- The target OEE used in capacity calculations is lines.oee_target (masterdata).
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'oee_daily')
BEGIN
    CREATE TABLE dbo.oee_daily (
        oee_id              INT             IDENTITY(1,1)   NOT NULL,
        batch_id            INT             NOT NULL,
        line_code           VARCHAR(50)     NOT NULL,
        record_date         DATE            NOT NULL,
        oee_pct             DECIMAL(6,4)    NULL,           -- Composite OEE score 0.0000–1.0000
        availability_pct    DECIMAL(6,4)    NULL,           -- % of scheduled time the line was running
        performance_pct     DECIMAL(6,4)    NULL,           -- Actual speed vs ideal speed
        quality_pct         DECIMAL(6,4)    NULL,           -- Good units vs total units produced
        source_row_number   INT             NULL,
        created_at          DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_oee_daily                 PRIMARY KEY (oee_id),
        CONSTRAINT UQ_oee_daily_batch_line_date UNIQUE (batch_id, line_code, record_date),
        CONSTRAINT FK_oee_daily_batch           FOREIGN KEY (batch_id)
            REFERENCES dbo.import_batches (batch_id)
            ON DELETE CASCADE,
        CONSTRAINT FK_oee_daily_line            FOREIGN KEY (line_code)
            REFERENCES dbo.lines (line_code)
            ON UPDATE CASCADE ON DELETE NO ACTION,
        CONSTRAINT CK_oee_daily_oee_range       CHECK (oee_pct IS NULL OR (oee_pct >= 0 AND oee_pct <= 1)),
        CONSTRAINT CK_oee_daily_avail_range     CHECK (availability_pct IS NULL OR (availability_pct >= 0 AND availability_pct <= 1)),
        CONSTRAINT CK_oee_daily_perf_range      CHECK (performance_pct IS NULL OR (performance_pct >= 0 AND performance_pct <= 1)),
        CONSTRAINT CK_oee_daily_qual_range      CHECK (quality_pct IS NULL OR (quality_pct >= 0 AND quality_pct <= 1))
    );

    CREATE INDEX IX_oee_daily_batch_line ON dbo.oee_daily (batch_id, line_code);
    CREATE INDEX IX_oee_daily_batch_date ON dbo.oee_daily (batch_id, record_date);

    PRINT 'Created table: oee_daily';
END
ELSE
    PRINT 'Table oee_daily already exists. Skipped.';
GO

-- =============================================================================
-- PORTFOLIO_CHANGES
-- Product portfolio changes expected within the planning horizon.
-- REQUIRED file in every batch — but 0 data rows is VALID when there are
-- no changes in the current planning cycle.
-- item_code is nullable: some changes are plant/line-level, not item-specific.
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'portfolio_changes')
BEGIN
    CREATE TABLE dbo.portfolio_changes (
        change_id           INT             IDENTITY(1,1)   NOT NULL,
        batch_id            INT             NOT NULL,
        item_code           VARCHAR(50)     NULL,
        change_type         VARCHAR(50)     NULL,           -- NEW_LAUNCH | DISCONTINUE | REFORMULATION | LINE_CHANGE | OTHER
        effective_date      DATE            NULL,
        description         NVARCHAR(500)   NULL,
        impact_notes        NVARCHAR(1000)  NULL,
        source_row_number   INT             NULL,
        created_at          DATETIME2(7)    NOT NULL    DEFAULT GETUTCDATE(),

        CONSTRAINT PK_portfolio_changes         PRIMARY KEY (change_id),
        CONSTRAINT FK_portfolio_changes_batch   FOREIGN KEY (batch_id)
            REFERENCES dbo.import_batches (batch_id)
            ON DELETE CASCADE,
        CONSTRAINT FK_portfolio_changes_item    FOREIGN KEY (item_code)
            REFERENCES dbo.items (item_code)
            ON UPDATE CASCADE ON DELETE SET NULL,
        CONSTRAINT CK_portfolio_changes_type    CHECK (
            change_type IS NULL OR
            change_type IN ('NEW_LAUNCH', 'DISCONTINUE', 'REFORMULATION', 'LINE_CHANGE', 'OTHER')
        )
    );

    CREATE INDEX IX_portfolio_changes_batch ON dbo.portfolio_changes (batch_id);
    CREATE INDEX IX_portfolio_changes_item  ON dbo.portfolio_changes (item_code)
        WHERE item_code IS NOT NULL;

    PRINT 'Created table: portfolio_changes';
END
ELSE
    PRINT 'Table portfolio_changes already exists. Skipped.';
GO
