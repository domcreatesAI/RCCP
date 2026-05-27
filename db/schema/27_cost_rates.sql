-- Migration 27: Populate dummy cost rates for Exception Inbox cost calculations
-- Replace with actuals once confirmed (see todo list)
--
-- UK FMCG industry-standard hourly rates used as placeholders.
-- Multipliers: overtime 1.5x (time-and-a-half), additional shift 1.75x, bank holiday 2.0x

-- ── 1. Resource type hourly rates ─────────────────────────────────────────────
UPDATE dbo.resource_types SET standard_hourly_rate = 13.50 WHERE resource_type_code = 'LINE_OPERATOR';
UPDATE dbo.resource_types SET standard_hourly_rate = 17.00 WHERE resource_type_code = 'TEAM_LEADER';
UPDATE dbo.resource_types SET standard_hourly_rate = 15.00 WHERE resource_type_code = 'FORKLIFT_DRIVER';
UPDATE dbo.resource_types SET standard_hourly_rate = 16.00 WHERE resource_type_code = 'ROBOT_OPERATOR';
UPDATE dbo.resource_types SET standard_hourly_rate = 13.00 WHERE resource_type_code = 'MATERIAL_HANDLER';
UPDATE dbo.resource_types SET standard_hourly_rate = 20.00 WHERE resource_type_code = 'TECHNICIAN';

-- ── 2. Cost multipliers in app_settings ───────────────────────────────────────
-- overtime_rate_multiplier already exists at 1.5 — leave as-is (correct)
-- additional_shift_rate_multiplier exists at 1.25 — correct to 1.75
UPDATE dbo.app_settings SET setting_value = '1.75' WHERE setting_key = 'additional_shift_rate_multiplier';

-- bank_holiday_rate_multiplier — new entry
IF NOT EXISTS (SELECT 1 FROM dbo.app_settings WHERE setting_key = 'bank_holiday_rate_multiplier')
    INSERT INTO dbo.app_settings (setting_key, setting_value)
    VALUES ('bank_holiday_rate_multiplier', '2.0');

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT resource_type_code, standard_hourly_rate FROM dbo.resource_types ORDER BY resource_type_code;
SELECT setting_key, setting_value FROM dbo.app_settings WHERE setting_key LIKE '%rate%' OR setting_key LIKE '%multiplier%';
