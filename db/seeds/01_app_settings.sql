-- =============================================================================
-- RCCP One — App Settings Seed Data
-- Run after all schema scripts.
-- These are the default configuration values for Phase 1.
--
-- Safe to re-run — uses MERGE (insert if not exists, skip if already present).
-- To change a value after initial load: UPDATE dbo.app_settings directly
-- or via the Phase 5 Config screen. Do not re-run this script to change values.
-- =============================================================================

USE RCCP_One;
GO

MERGE dbo.app_settings AS target
USING (VALUES
    (
        'planning_horizon_months',
        '18',
        'How many months forward the planning data must cover (used in business rule validation).'
    ),
    (
        'min_horizon_warn_months',
        '12',
        'Minimum months of forward coverage in line_capacity_calendar before a validation WARNING is issued.'
    ),
    (
        'demand_period_type',
        'MONTHLY',
        'Default demand plan granularity. Values: MONTHLY | WEEKLY. MONTHLY = current SAP export format. Change to WEEKLY when SAP provides weekly buckets directly.'
    ),
    (
        'batch_cycle_day',
        '1',
        'The day of month that plan_cycle_date must fall on. Default 1 (first of month). Do not change without schema review.'
    ),
    (
        'oee_missing_severity',
        'WARNING',
        'Severity when oee_daily file is not uploaded in a batch. Values: WARNING | INFO. Must not be BLOCKED (oee_daily is optional).'
    ),
    (
        'upload_base_dir',
        'uploads',
        'Relative base directory for uploaded files (relative to backend root). Override in backend .env for the actual VM path.'
    ),
    (
        'max_upload_size_mb',
        '50',
        'Maximum allowed file size in megabytes for any single Excel upload.'
    ),
    (
        'overtime_rate_multiplier',
        '1.5',
        'Cost multiplier applied to standard_hourly_rate for overtime hours. 1.5 = time-and-a-half. Used in Phase 3 cost-of-capacity calculations.'
    ),
    (
        'additional_shift_rate_multiplier',
        '1.25',
        'Cost multiplier applied to standard_hourly_rate for additional shift hours (e.g. weekend premium). Used in Phase 3 cost-of-capacity calculations.'
    ),
    (
        'app_version',
        '1.0.0',
        'Current application version. Updated on each release.'
    )
) AS source (setting_key, setting_value, description)
ON target.setting_key = source.setting_key
WHEN NOT MATCHED THEN
    INSERT (setting_key, setting_value, description)
    VALUES (source.setting_key, source.setting_value, source.description);

PRINT 'App settings seeded.';
GO
