# RCCP One — Phase Plan Reference

> Use this document to brief any AI assistant on what has been built, what is in progress, and what is planned.
> For current deployment state, open questions, and next steps — read `docs/PROJECT_STATUS.md`.

---

## What This App Is

**RCCP One** is an internal manufacturing planning tool for Rough Cut Capacity Planning.
It ingests SAP Excel exports, validates them through a 7-stage pipeline, publishes planning batches, and creates immutable baselines for capacity analysis.

Runs on a Windows VM on the company network. Single-tenant, internal users only.

---

## Phase 1 — Planning Data Pipeline

**Status: Core complete. UI shell redesign (Phase A) done.**

### What it covers
The end-to-end workflow for one planning cycle:
1. Create a planning batch (name + cycle date)
2. Upload 6 required Excel files (SAP exports) per batch
3. Run 7-stage validation pipeline per file
4. Publish the batch (blocked if any file has BLOCKED severity)
5. Create a named, immutable baseline from the published batch

### Files uploaded per batch
| File | Source | Notes |
|---|---|---|
| `master_stock` | SAP inventory snapshot | Opening stock by item + location |
| `production_orders` | SAP COOIS export | LA (planned) + YPAC (released/firmed) orders |
| `demand_plan` | SAP PIR | Monthly forecast by item + warehouse |
| `line_capacity_calendar` | Manual/SAP | Line availability, shifts, maintenance |
| `headcount_plan` | HR | Operator hours per line per week |
| `portfolio_changes` | NPD | New launches + discontinuations (may be 0 rows) |

### Masterdata (separate from batch workflow)
4 masterdata types uploaded independently via full-replace:
- `line_pack_capabilities` — fill speeds per line per pack size
- `line_resource_requirements` — headcount per line per role
- `plant_resource_requirements` — shared headcount per plant per role
- `warehouse_capacity` — max pallet positions per pack type per warehouse

### Validation pipeline (7 stages + stage 8)
| Stage | Name | Effect |
|---|---|---|
| 1 | REQUIRED_FILE_CHECK | Checks all 6 files present |
| 2 | TEMPLATE_STRUCTURE_CHECK | Correct columns present |
| 3 | FIELD_MAPPING_CHECK | Required fields mapped |
| 4 | DATA_TYPE_CHECK | Types, nulls, formats valid |
| 5 | REFERENCE_CHECK | FK lookups against masterdata |
| 6 | BUSINESS_RULE_CHECK | Business logic (dates, quantities, ranges) |
| 7 | BATCH_READINESS | All files pass — batch can publish |
| 8 | CROSS_FILE_CHECK | WARNING-only — SKU coverage gaps, headcount gaps, demand overlaps |

Severities: PASS / WARNING / BLOCKED / INFO. Publish blocked if any file has BLOCKED.

### Tech built
- SQL Server schema (25 tables, 5 views) — fully deployed
- FastAPI backend — all Phase 1 endpoints live
- React frontend — Planning Data page functional
- Auth: JWT login, admin/user roles
- Excel template downloads for all 10 upload types
- Stage 8 coverage report endpoint: `GET /api/batches/{id}/coverage-report`

### Frontend shell (Phase A — complete)
- Dark navy sidebar with indigo gradient active state, lucide icons
- Frosted glass topbar with breadcrumb + live cycle badge (batch name + status from API)
- Sonner toast notifications (`toast.success/error()`)
- React Router v7

### Pending for Phase 1
- Deploy migration 20 (`20_validation_enhancements.sql`) — adds `initial_demand` to `portfolio_changes`, fixes headcount CHECK to `>= 0`
- Confirm migrations 16 + 17 on live DB
- SAP column headers for `master_stock` (stages 3–6 currently return INFO)

---

## Phase 2 — RCCP Engine

**Status: Not started.**

### What it covers
The capacity calculation engine that answers: *Can we make what demand asks for, given our lines, headcount, and constraints?*

### Key calculations
- **Net theoretical hours** per line per week (already in view `vw_line_capacity_with_net`)
- **Required hours** from production orders + demand plan (standard hours per unit × volume)
- **Labour-constrained capacity** — headcount plan vs line resource requirements → flag shortfalls
- **Warehouse-constrained capacity** — free stock vs available pallet positions
- **Line risk score** — % utilisation vs available capacity; traffic-light by week

### Inputs (all from Phase 1 data)
- `line_capacity_calendar` — available hours per line per day
- `headcount_plan` — actual planned headcount
- `line_resource_requirements` — headcount needed per line
- `plant_resource_requirements` — shared headcount per plant
- `demand_plan` — forecast demand (monthly → weekly derived)
- `production_orders` — committed orders
- `master_stock` — opening stock
- `line_pack_capabilities` — fill speeds (litres/min computed in view)
- `item_resource_rules` — standard hours per unit per item group per line (placeholder data)

### New DB objects needed
- Views or functions for capacity calculations
- Weekly aggregation logic
- Risk flag logic (line × week × constraint type)

### New endpoints needed
- `GET /api/batches/{id}/capacity-summary` — weekly line utilisation
- `GET /api/batches/{id}/labour-gaps` — headcount shortfalls by week
- `GET /api/batches/{id}/warehouse-risk` — pallet space risk by week

### New frontend screen
- **RCCP Dashboard** — the main output of Phase 2
- Figma reference: `figma_prototype/src/app/components/rccp-dashboard/RCCPDashboard.tsx`

---

## Phase 3 — Scenario Modelling

**Status: Not started.**

### What it covers
What-if analysis on top of Phase 2 capacity outputs.

### Scenarios
- Override OEE per line (default 55%; e.g. "what if we hit 65% on line A1?")
- Additional shift modelling — cost of extra capacity
- Overtime modelling — cost at overtime rate multiplier
- Portfolio change impact — what does a new launch do to capacity?

### Key data
- `app_settings.overtime_rate_multiplier` and `additional_shift_rate_multiplier` (already seeded)
- `lines.oee_target` — per-line default; scenarios override this
- `resource_types.standard_hourly_rate` — needed for cost calculations (placeholder data)

### New frontend screen
- **Scenarios** — Figma reference: `figma_prototype/src/app/components/scenarios/Scenarios.tsx`

---

## Phase 4 — Executive Summary & Approval

**Status: Not started.**

### What it covers
A single-page output view for leadership sign-off on the planning cycle.

### Content
- 12-month staff forecast chart
- Capacity risk summary (lines in red/amber/green)
- Key decisions (launches, discontinuations, capacity investments)
- Approval workflow (submit → approve/reject flow)

### New frontend screen
- **Executive Summary** — Figma reference: `figma_prototype/src/app/components/executive-summary/ExecutiveSummary.tsx`

---

## Phase 5 — Config & Masterdata UI

**Status: Not started.**

### What it covers
In-app management screens so planners don't need to upload Excel for every masterdata change.

### Scope
- App settings editor (overtime multipliers, planning horizon)
- User management (add/remove users, reset passwords, change roles)
- Masterdata grid editors (lines, items, resource requirements, pack capabilities)
- Audit log viewer

### New frontend screen
- **Configuration** — Figma reference: `figma_prototype/src/app/components/configuration/Configuration.tsx`

---

## Figma Reference Design

A full Figma prototype of all phases lives at `RCCP/figma_prototype/`. Key files:

| File | Phase |
|---|---|
| `src/app/components/Layout.tsx` | Phase A shell (done) |
| `src/app/components/planning-data/PlanningData.tsx` | Phase 1 Planning page (Phase B redesign next) |
| `src/app/components/rccp-dashboard/RCCPDashboard.tsx` | Phase 2 |
| `src/app/components/scenarios/Scenarios.tsx` | Phase 3 |
| `src/app/components/executive-summary/ExecutiveSummary.tsx` | Phase 4 |
| `src/app/components/configuration/Configuration.tsx` | Phase 5 |

The prototype uses Tailwind v4, motion (Framer Motion v11+), recharts, and shadcn/ui. The live app uses Tailwind v3 — **migrate to v4 before starting Phase 2**.

---

## Frontend Redesign Plan (within Phase 1)

Separate from functional phases — this is a UI uplift using the Figma design as reference.

| Sub-phase | Scope | Status |
|---|---|---|
| **Phase A** | Dark sidebar, lucide icons, frosted topbar, cycle badge, sonner toasts, react-router v7 | **Done** |
| **Phase B** | Planning Data page: 3fr/2fr grid, validation accordion panel, gradient action bar | Next |
| **Phase C** | Animations: `npm install motion`, staggered entries, AnimatePresence | After B |
| **Phase D** | Dashboard, Scenarios, ExecutiveSummary, Config — use Figma as reference when phases start | With Phase 2–5 |

---

## Open Questions (blocking or upcoming)

| Item | Needed for |
|---|---|
| SAP column headers for `master_stock` | Phase 1 stages 3–6 |
| `bottles_per_minute` for lines A202, A302–A308, A401, A501, A502 | Phase 2 capacity calc |
| Resource requirements for Plants A2–A5 | Phase 2 labour constraint |
| Warehouse capacity (pallet positions) per pack type | Phase 2 warehouse constraint |
| `standard_hourly_rate` for all 5 resource types | Phase 3 cost modelling |
| `standard_hours_per_unit` in item_resource_rules | Phase 2 required hours calc |
