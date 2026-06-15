-- Migration 31: add PALLETISING_OPERATOR resource type (LINE scope)
--
-- New end-of-line role: person who manually stacks finished boxes onto pallets.
-- Distinct from ROBOT_OPERATOR (PLANT scope) which runs the automated palletising
-- machine. Per Josh (Blending & Filling), some lines need extra heads for manual
-- palletising on top of the crew that runs the line.
--
-- Scope = LINE: requirement is per production line, lives in
-- dbo.line_resource_requirements alongside LINE_OPERATOR and TEAM_LEADER.
--
-- NOTE: once this role is active, the masterdata stage-6 completeness check
-- requires every active line to have a PALLETISING_OPERATOR row in the
-- line_resource_requirements upload (headcount_required may be 0 where the
-- line needs no manual palletising).
--
-- standard_hourly_rate left NULL — set in a cost-rates migration once confirmed.

MERGE dbo.resource_types AS t
USING (SELECT 'PALLETISING_OPERATOR' AS code) AS s
    ON t.resource_type_code = s.code
WHEN NOT MATCHED THEN
    INSERT (resource_type_code, resource_type_name, scope, standard_hourly_rate, notes, is_active)
    VALUES ('PALLETISING_OPERATOR', 'Palletising Operator', 'LINE', NULL,
            'Stacks finished boxes onto pallets at the end of the line (manual palletising)', 1);
GO

PRINT 'Migration 31 complete — PALLETISING_OPERATOR added';
GO
