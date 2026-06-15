# RCCP One — Pre-Launch Action Plan

**Status:** IN PROGRESS  
**Target launch window:** [user to specify]  
**Last updated:** 2026-06-11

---

## Overview

This is a 4-phase plan to move RCCP One from "feature complete + end-to-end tested" to "live, running on Windows Service, with stakeholder buy-in."

### Phases
1. **Confirmation** — Manufacturing verifies line/plant/headcount assumptions
2. **Verification** — All calculations validated against real data
3. **Slides & comms** — Non-technical launch deck for stakeholders
4. **Service + deployment** — Windows Service setup + go/no-go

---

## Phase 1: Confirmation (WD 1–3)

**Owner:** Dom (Planning) + Steve (Manufacturing)  
**Blocker?** Yes — can't proceed to verification without sign-off.

### Tasks

#### 1a. Manufacturing manager confirms line capabilities
**What:** Steve reviews masterdata in RCCP against live SAP/manpower reality:
- `lines` table: 14 line codes, plant assignments, OEE targets (default 0.55), available_mins_per_day (default 420)
- `line_pack_capabilities` table: pack sizes + fill speeds per line (required for Phase 2)
- Ask: *Are these correct? Any lines we should hide from the dashboard? Any capacity limits we don't have in the masterdata?*

**Deliverable:** Signed-off spreadsheet or email confirmation.  
**Backup:** If Steve finds discrepancies, create a delta list → update masterdata → re-test calculations.

---

#### 1b. Manufacturing manager confirms headcount requirements
**What:** Steve + Josh review headcount model:
- `line_resource_requirements` table: per-line crew (LINE_OPERATOR, TEAM_LEADER counts) — the "cost" of running each line
- `plant_resource_requirements` table: per-plant shared roles (FORKLIFT_DRIVER, MATERIAL_HANDLER, ROBOT_OPERATOR, TECHNICIAN) + required headcount per role
- Ask: *Does this match what you actually staff? Any roles missing? Any headcount assumptions wrong?*

**Deliverable:** Signed-off headcount model (can be a table or email confirmation).  
**Note:** This cascades into every FTE calculation on the dashboard. Wrong = wrong dashboard.

---

#### 1c. Manufacturing manager confirms line capacity calendar template
**What:** Steve reviews the `capacity_calendar_2026_2030.xlsx` template (14 lines × ~1,826 days):
- Pre-filled with UK bank holidays (hardcoded as full-day loss).
- Available-hours calculation: `available_mins_per_day × working_days × line OEE`.
- Ask: *Is the bank holiday list correct? Any site-specific shutdowns we should pre-fill?*

**Deliverable:** Confirmation or delta list of holiday dates.

---

### Go/No-go gate

**GATE 1 — Confirmation complete?**
- ✅ Line masterdata signed off
- ✅ Headcount requirements signed off
- ✅ Calendar template okayed

**If No:** Fix the masterdata, re-test Phase 2 calculations, re-confirm.  
**If Yes:** Proceed to Phase 2.

---

## Phase 2: Verification (WD 4–5)

**Owner:** Dom (Planning)  
**Blocker?** Yes — can't launch if calculations don't match expectations.

### Tasks

#### 2a. Smoke test — Create a test batch with real data
**What:**
1. Pull last month's SAP data (COOIS, MB51, PIR, COIPA)
2. Fold in Manufacturing's confirmed headcount
3. Upload to a DRAFT batch, run validation
4. Publish the batch, open the dashboard

**Expected:** All calculations should be green (no BLOCKED issues).  
**If issues:** Create a delta list, decide if it's a data problem or a code problem, fix, re-test.

---

#### 2b. Spot-check key KPIs
**What:** For last month's data, manually verify three headline numbers:
1. **Plan feasibility %** — Manually sum min(production, available) ÷ sum(production) for the focus month. Compare to dashboard.
2. **FTE gap** — Pick one plant, manually calculate (line crew hours + plant-shared role hours) ÷ FTE-month-hours. Compare to the FTE Breakdown sheet.
3. **Volume-to-clear cost** — Manually: shortfall_litres × COGS_per_litre. Compare to KPIs Summary sheet.

**Expected:** Manual calc ≈ dashboard figure (allow ±0.5% for rounding).  
**If divergence > 0.5%:** Dig into the backend engine (rccp_engine.py), find the bug, fix it, re-test.

---

#### 2c. Validate the 12-sheet Excel pack
**What:**
1. Export the verification workbook (sop_verification_batch{id}.xlsx) from the published batch.
2. Open it. Spot-check:
   - README sheet describes all 12 sheets correctly.
   - KPIs Summary matches what the dashboard shows.
   - Headcount by Line sheet matches the People Fit panel.
   - FTE Breakdown sheet shows the math per line + plant-shared roles.
   - Action Items sheet is populated (or says "no actions outstanding").

**Expected:** Excel matches the dashboard; no cells show Excel repair warnings.  
**If issues:** Fix the backend (sop_export_service.py), regenerate, re-check.

---

#### 2d. PDF export check
**What:**
1. Open Executive Summary v2.
2. Click **PDF** button.
3. Check the PDF renders correctly — no broken images, no text overflow, page breaks make sense.

**Expected:** PDF is clean, readable, matches the on-screen dashboard.  
**If issues:** Check frontend CSS (ExecutiveSummaryV2Page.tsx), fix, rebuild, re-export.

---

### Go/No-go gate

**GATE 2 — Verification complete?**
- ✅ Test batch validates and publishes without BLOCKED issues
- ✅ Three KPI spot-checks pass (within ±0.5%)
- ✅ Excel pack exports cleanly and matches the dashboard
- ✅ PDF exports cleanly

**If No:** Identify the bug, fix it, re-run Gate 2.  
**If Yes:** Proceed to Phase 3.

---

## Phase 3: Slides & Communications (WD 5–6)

**Owner:** Dom (Planning)  
**Blocker?** No — can be done in parallel with Phase 4, but needed before launch meeting.

### Tasks

#### 3a. Create launch deck (5–7 slides, non-technical)
**Slides to create:**
1. **Title slide** — RCCP One, launch date, attendees
2. **Purpose slide** — *Why RCCP?* (capacity planning, labour planning, what-if analysis, monthly rhythm)
3. **Process slide** — The monthly cycle (8 working days, 4 phases, 7 departments). Reuse the RCCP-One-Monthly-Cycle.html slide.
4. **Governance slide** — Who approves what, RACI roles, decision gates (Gate 1 = confirm inputs, Gate 2 = publish baseline)
5. **Tool overview slide** — Three key screens (Executive Summary, Plant Detail, Audit pack). No technical jargon — "here's what you see, here's what it tells you."
6. **Data inputs slide** — The 6 Excel files Manufacturing/S&OP/Product/SAP provide each month
7. **Go/No-go slide** — "We're live when all of this is complete"

**Format:** HTML (matching RCCP-One-Monthly-Cycle.html) so it prints to PDF cleanly and stays flexible.  
**Tone:** Business-focused, not technical. Phrase in terms of "capacity decisions" and "staffing plan", not "utilisation %" or "FTE calculation".

**Owner:** Dom  
**Reviewers:** Mike (ELT), Steve (Mfg), Pablo (S&OP)  
**Feedback loop:** Expect 1–2 rounds of feedback before lock.

---

#### 3b. Create a 1-pager "How to use RCCP" for Manufacturing
**What:** A printed cheat sheet (A4 landscape, single page) that Manufacturing can pin to their desk:
- "RCCP launches each month on [day]. You have [days] to submit exceptions."
- "Download these two templates: headcount_exceptions_input.xlsx + line_capacity_exceptions_input.xlsx"
- "Fill in the Data Entry sheet. No technical knowledge needed — use the dropdowns."
- "Send back to [Dom email] by [date]."
- Footer: "Questions? Email [Dom] or call [phone]."

**Format:** PDF (printable).  
**Owner:** Dom  
**Reviewer:** Steve (Mfg)

---

#### 3c. Create a 1-pager "RCCP Glossary" for the review meeting
**What:** Definitions of 8–10 key terms (non-jargon):
- **Plan feasibility** — % of the production plan we can deliver at current capacity.
- **Volume to clear** — The shortfall that needs OT or extra shifts to complete.
- **Critical line** — A line running >100% capacity in any month.
- **FTE** — Full-time equivalent headcount. 1 FTE = one person working a standard month.
- **Baseline** — The approved production and staffing plan for the month.
- etc.

**Format:** PDF (1 page, landscape, can be printed as a handout at the meeting).  
**Owner:** Dom

---

### Go/No-go gate

**GATE 3 — Communications ready?**
- ✅ Launch deck (5–7 slides) drafted + reviewed by ELT/Mfg/S&OP
- ✅ Manufacturing 1-pager printed + reviewed by Steve
- ✅ Glossary 1-pager ready

**If No:** Collect feedback, iterate, re-review.  
**If Yes:** Proceed to Phase 4.

---

## Phase 4: Service & Deployment (WD 6–8)

**Owner:** Dom (Planning) + IT (if needed for Windows Service setup)  
**Blocker?** Yes for "live" status.

### Tasks

#### 4a. Test Windows Service setup (local)
**What:**
1. Stop the development uvicorn server.
2. Install the backend as a Windows Service using NSSM or equivalent (or Windows Task Scheduler).
3. Configure it to:
   - Auto-start on machine boot
   - Run as a service account (not user account)
   - Log to a file (`backend/logs/rccp.log`)
   - Restart on crash
4. Test the service:
   - Reboot the VM
   - Service starts automatically ✓
   - Dashboard loads at `http://localhost:5173` ✓
   - Create a test batch, upload a file, validate, publish ✓
5. Simulate a crash (kill the service process) — it auto-restarts ✓
6. Check the log file for any errors

**Expected:** Service runs cleanly for 2+ hours with no crashes or manual intervention.  
**If issues:** Debug the logs, fix the issue (usually missing env vars or file permissions), re-test.

---

#### 4b. Prepare deployment checklist
**What:** Create a checklist for going live on the production VM:
```
Pre-deployment:
  ☐ Backup current DB (SQL Server)
  ☐ Backup current code (git tag the release)
  ☐ Notify ELT that RCCP will be down 15 min for upgrade
  
Deployment:
  ☐ Pull latest code from GitHub (main branch)
  ☐ Stop RCCP backend service
  ☐ Run DB migrations (if any) — 12–19, 24, 28
  ☐ Update backend/.env (DB connection, JWT secret, etc.)
  ☐ Start RCCP backend service
  ☐ Wait 30s for service to stabilize
  ☐ Test: Open browser, login, create batch, upload file
  
Post-deployment:
  ☐ Confirm the dashboard loads
  ☐ Run a smoke test batch
  ☐ Notify ELT that RCCP is live
  ☐ Monitor logs for 30 min
```

**Owner:** Dom (with IT support if needed)

---

#### 4c. Prepare rollback plan
**What:** If something breaks:
1. Stop the service.
2. Restore the DB from the pre-deployment backup (SQL Server restore).
3. Revert the code to the previous git tag.
4. Restart the service.
5. Notify ELT.

**Time to rollback:** ~10–15 min.  
**Owner:** Dom + IT (DB restore)

---

### Go/No-go gate

**GATE 4 — Ready for live?**
- ✅ Windows Service setup tested + works (2+ hrs clean runtime)
- ✅ Deployment checklist created + reviewed by IT
- ✅ Rollback plan documented
- ✅ GATE 1, 2, 3 all passed

**If No:** Fix the issue, re-test.  
**If Yes:** **LAUNCH.**

---

## Launch Day (WD 8 or as scheduled)

### Pre-launch (30 min before)
- [ ] Deploy code to production VM (follow deployment checklist)
- [ ] Run smoke test batch
- [ ] Send email to ELT: "RCCP One is now live. Dashboard at [URL]."

### Launch meeting (1.5–2 hours)
- [ ] Walk through the monthly cycle (reuse the slide)
- [ ] Demo the Executive Summary (use the live dashboard)
- [ ] Walk the audit pack (show the Excel export)
- [ ] Q&A on capacity assumptions, headcount model, glossary
- [ ] Get approval for the baseline
- [ ] Capture decisions in the batch notes

### Post-launch (1 week)
- [ ] Monitor the logs daily for errors
- [ ] Collect feedback from Manufacturing, S&OP, ELT
- [ ] Create an "RCCP v1.1" task list for post-launch improvements (Phase 1 refinements, Phase 2 features, etc.)

---

## Timeline

| When | What | Owner | Gate? |
|---|---|---|---|
| **WD 1–3** | Confirmation (Manufacturing signs off) | Steve + Dom | **GATE 1** ✓ |
| **WD 4–5** | Verification (calculations + exports) | Dom | **GATE 2** ✓ |
| **WD 5–6** | Slides + comms (parallel with 4a) | Dom | **GATE 3** ✓ |
| **WD 6–8** | Windows Service + deployment | Dom + IT | **GATE 4** ✓ |
| **WD 8** | **LAUNCH** — Deploy + live meeting | Dom + ELT | — |
| **WD 8+** | Monitor + feedback loop | Dom | — |

---

## Critical path

1. **Confirmation** must finish before Verification starts (Gate 1).
2. **Verification** must finish before launch (Gate 2).
3. **Slides** can happen in parallel with Verification/Service testing (Gate 3).
4. **Service** testing must finish before deployment (Gate 4).
5. **All four gates** must pass before launch.

---

## Risk mitigation

| Risk | Mitigation |
|---|---|
| Manufacturing doesn't confirm in time | Pre-populate confirmation form with current masterdata; require sign-off (Y/N) rather than waiting for detailed feedback |
| Calculations have bugs | Phase 2 spot-check catches them; allow 2–3 days for fixes + re-test |
| Slides get too many feedback rounds | Deliver initial draft early (WD 4); limit to 2 rounds of feedback; frame as "launch v1" (not final) |
| Windows Service setup fails | Test early (WD 6); engage IT in advance; have rollback plan ready |
| Database corruption on deploy | Always backup DB before deployment; test restore process in advance |

---

## Success criteria

Launch is successful when:
- ✅ All four gates passed
- ✅ Service runs cleanly for 24+ hours with no crashes
- ✅ ELT baseline approved + locked
- ✅ Manufacturing team can use the exception templates
- ✅ Dashboard matches the audit pack (no discrepancies)
- ✅ Stakeholders understand the monthly rhythm (no questions about "why can't we just upload whenever")

---

## Post-launch (v1.1 planning)

Once live, create a backlog for quick wins + known limitations:
- [ ] People Fit panel — fix false shortfalls (extract KPITile, add DATA_NEEDED state)
- [ ] ChartTooltip — show firm + MRP in one bar legend entry (not separate bars)
- [ ] Phase 2 features — weighted capacity, OEE per line per product mix
- [ ] Phase 3 features — scenario modelling, cost-of-capacity slider

---

## Approvals

| Role | Name | Approval | Date |
|---|---|---|---|
| Planning | Dom | [ ] Draft | — |
| Manufacturing | Steve | [ ] Gate 1 sign-off | — |
| S&OP | Pablo | [ ] Slides review | — |
| ELT | Mike | [ ] Pre-launch approval | — |

---

**Document status:** DRAFT (awaiting Phase 1 completion)

