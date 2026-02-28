-- =============================================================================
-- RCCP One — Database Creation Script
-- Run this script as sa or a sysadmin-level login BEFORE running schema scripts
-- Target: SQL Server 2019+ (or SQL Server 2016+ compatible)
-- =============================================================================

USE master;
GO

-- Create database if it does not already exist
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'RCCP_One')
BEGIN
    CREATE DATABASE RCCP_One
        COLLATE SQL_Latin1_General_CP1_CI_AS;

    PRINT 'Database RCCP_One created.';
END
ELSE
BEGIN
    PRINT 'Database RCCP_One already exists. Skipping creation.';
END
GO

USE RCCP_One;
GO

-- =============================================================================
-- Application user (optional — for least-privilege service account)
-- Uncomment and adjust if you want a dedicated app login instead of sa
-- =============================================================================
/*
IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = N'rccp_app')
BEGIN
    CREATE LOGIN rccp_app WITH PASSWORD = 'CHANGE_THIS_PASSWORD';
END
GO

IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = N'rccp_app')
BEGIN
    CREATE USER rccp_app FOR LOGIN rccp_app;
    ALTER ROLE db_datareader ADD MEMBER rccp_app;
    ALTER ROLE db_datawriter ADD MEMBER rccp_app;
    -- Grant EXECUTE for stored procedures if added later
    GRANT EXECUTE TO rccp_app;
END
GO
*/
