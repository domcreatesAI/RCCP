-- Migration 29: Settings — COGS (OPEX £/litre)
-- Idempotent. The application also falls back to this value in code
-- (settings_service) if the row is absent, and upserts on first edit via the
-- Settings screen — so running this is optional but keeps the table tidy.
--
-- NOTE: OEE is maintained PER LINE (dbo.lines.oee_target), not globally — there
-- is intentionally no default_oee setting.

USE RCCP;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.app_settings WHERE setting_key = 'cogs_opex_per_litre')
    INSERT INTO dbo.app_settings (setting_key, setting_value, description)
    VALUES ('cogs_opex_per_litre', '0.12',
            'Operating cost (GBP) per litre produced. Used to value the production plan and the cost of extra capacity.');

-- Remove the obsolete global OEE setting if an earlier version created it.
DELETE FROM dbo.app_settings WHERE setting_key = 'default_oee';

SELECT setting_key, setting_value, description
FROM dbo.app_settings
WHERE setting_key = 'cogs_opex_per_litre';
GO
