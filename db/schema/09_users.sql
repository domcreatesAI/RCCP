-- =============================================================================
-- RCCP One — App Users
-- Run after 08_warehouse_capacity.sql
--
-- Manages who can log into the RCCP web application.
-- Separate from SQL Server logins (those are for the backend service account).
--
-- Roles:
--   admin — full access: config, masterdata uploads, user management + planning workflow
--   user  — planning workflow only: upload, validate, publish
--
-- Also fixes the import_batch_files file_type constraint:
--   'inventory_snapshots' was renamed to 'master_stock' (see CLAUDE.md).
--   The constraint in 02_workflow.sql used the old name — corrected here.
-- =============================================================================

USE RCCP;
GO

-- =============================================================================
-- FIX: import_batch_files file_type constraint
-- Rename 'inventory_snapshots' → 'master_stock' to match the planning data table.
-- Safe to re-run — checks for constraint existence first.
-- =============================================================================
IF EXISTS (
    SELECT * FROM sys.check_constraints
    WHERE name = 'CK_import_batch_files_type'
      AND parent_object_id = OBJECT_ID('dbo.import_batch_files')
)
BEGIN
    ALTER TABLE dbo.import_batch_files DROP CONSTRAINT CK_import_batch_files_type;
    PRINT 'Dropped old CK_import_batch_files_type constraint.';
END
GO

ALTER TABLE dbo.import_batch_files
ADD CONSTRAINT CK_import_batch_files_type CHECK (
    file_type IN (
        'master_stock',
        'demand_plan',
        'line_capacity_calendar',
        'headcount_plan',
        'oee_daily',
        'portfolio_changes'
    )
);
PRINT 'Added updated CK_import_batch_files_type constraint (master_stock).';
GO

-- =============================================================================
-- USERS
-- Application login accounts — not SQL Server logins.
-- password_hash: bcrypt hash stored as VARCHAR(255).
-- =============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
BEGIN
    CREATE TABLE dbo.users (
        user_id         INT             IDENTITY(1,1)   NOT NULL,
        username        VARCHAR(50)     NOT NULL,
        password_hash   VARCHAR(255)    NOT NULL,
        display_name    VARCHAR(100)    NULL,
        role            VARCHAR(10)     NOT NULL        DEFAULT 'user',
        is_active       BIT             NOT NULL        DEFAULT 1,
        created_at      DATETIME2(7)    NOT NULL        DEFAULT GETUTCDATE(),
        last_login_at   DATETIME2(7)    NULL,

        CONSTRAINT PK_users             PRIMARY KEY (user_id),
        CONSTRAINT UQ_users_username    UNIQUE (username),
        CONSTRAINT CK_users_role        CHECK (role IN ('admin', 'user'))
    );

    PRINT 'Created table: users';
END
ELSE
    PRINT 'Table users already exists. Skipped.';
GO

-- =============================================================================
-- SEED: Default admin user
-- Username: admin
-- Password: admin123  (bcrypt hash below)
-- IMPORTANT: Change this password after first login.
-- =============================================================================
IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE username = 'admin')
BEGIN
    INSERT INTO dbo.users (username, password_hash, display_name, role, is_active)
    VALUES (
        'admin',
        '$2b$12$DcJyUiE4g78Sk3l7.efYDOCpxoQD6/JQWkHRcSd.k0U6kcO8etWFK',
        'Administrator',
        'admin',
        1
    );
    PRINT 'Default admin user created. Username: admin | Password: admin123';
    PRINT 'IMPORTANT: Change the password after first login.';
END
ELSE
    PRINT 'Admin user already exists. Skipped.';
GO
