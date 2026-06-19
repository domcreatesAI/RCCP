# Labour / Headcount Model — Design Note v2 (Phase 2)

> Status: **REVISED DESIGN — awaiting sign-off before rebuild.**
> Supersedes v1 (which assumed pool = plant). Captures the June 2026 re-think:
> labour is **pooled across plants**, not per plant.

---

## The operational reality (confirmed with the user)

- **POOL-FLEX** — Plants **1, 3, 4** share one labour force. Line operators, line
  leaders **and** palletisers are each fully interchangeable across **all lines in
  those three plants**. Plant-shared roles (forklift, material handler, robot op,
  technician) also flex across the same group.
- **POOL-P2** — Plant **2** is isolated: its operators/leaders are dedicated and
  **cannot** be covered by anyone from the flex group.
- **Plant 5** (A501, A502) — excluded from the headcount model for now (lines hidden).
- **Roles are distinct** — an operator can't do a leader's or palletiser's job;
  within each role, people flex across the pool's lines/plants.

**What the user knows / maintains:**
1. People/roles needed **per line** (already in `line_resource_requirements`).
2. **Total people they have, per role, per pool** ("12 operators, 3 line leaders…").
3. **Exceptions** (holiday/sick) against the pool.

**The questions the tool must answer:**
- "With the people I have, can I run the lines the plan demands this month?" (gap)
- "How many lines can I run at once?" (concurrency feasibility)
- "…providing I have enough plant-shared crew to back it." (shared-role gap)

---

## Core concept: the pool, not the plant

A **pool** is a group of interchangeable people, by role, covering a set of lines
(and therefore a set of plants). It is the unit everything hangs off.

| Pool | Lines | Plants covered |
|------|-------|----------------|
| **POOL-FLEX** | A101, A102, A103, A302, A303, A304, A305, A307, A308, A401 | 1, 3, 4 |
| **POOL-P2** | A201, A202 | 2 |
| *(none)* | A501, A502 | 5 — excluded |

Every role — line **and** shared — is tracked as **pool × role**.

---

## The calculation (per pool, per role, per month)

**NEED** (demand-driven, computed):

- **Line roles** (LINE_OPERATOR, LINE_LEADER, PALLETISING_OPERATOR) — requirements are
  **per line** (they vary: A303 needs a palletiser, A103 doesn't):
  `need = Σ over the pool's lines of (per-line crew[role] × line utilisation)`
  — a line running 80% of the month needs its crew 80% of the time. Lines with a 0
  requirement for a role (e.g. A103 palletiser) contribute nothing, so the need only
  reflects the lines that actually use that role. Moving a flexed operator A103→A303 is
  captured automatically: operator need is summed across whichever lines run and drawn
  from the shared pool, and the palletiser need follows A303 (the line that needs it),
  not A103.
- **Shared roles** (FORKLIFT_DRIVER, MATERIAL_HANDLER, ROBOT_OPERATOR, TECHNICIAN) —
  **flat per plant**: if the plant runs at all that month (any line operating), it needs
  its full shared crew. It does NOT scale with utilisation (one line running still needs
  a forklift driver).
  `need = Σ over the pool's plants of (plant requirement[role] if the plant operates that month, else 0)`

**HAVE** (maintained — small):
`have = pool_headcount[pool, role, month] − prorated absences`

**GAP** = `need − have` (positive = short). Surfaced per pool per role.

**CONCURRENCY FEASIBILITY** (the "how many lines can I run" headline):
for the binding line role, `max_lines ≈ floor(have ÷ typical per-line crew)`.
e.g. 12 operators (4/line) and 3 line leaders (1/line) → **3 lines**.

---

## What you maintain (the entire headcount dataset)

| Dataset | Shape | Notes |
|---------|-------|-------|
| Line role requirements | per line × role | `line_resource_requirements` — already maintained |
| Plant shared requirements | per plant × role | `plant_resource_requirements` — already maintained |
| **Pool headcount** | **per pool × role × month** | the totals you have — the only new routine input |
| Exceptions | per pool × role × date-range | holiday/sick/training |

Pool headcount is tiny: 2 pools × a handful of roles × months.

---

## Data model changes (for the build phase)

1. **`labour_pools`** — redefine to the two pools above; relax the `plant_code`
   link (a pool now spans plants — make it nullable / informational). Keep
   `max_concurrent_lines` as the *physical* concurrency ceiling.
2. **`lines.labour_pool_code`** — remap: flex lines → POOL-FLEX, A201/A202 → POOL-P2,
   A501/A502 → NULL (excluded).
3. **`pool_headcount`** — re-key from `plant_code` → **`pool_code`** (FK to labour_pools).
   Columns: batch_id, pool_code, resource_type_code, plan_month, planned_headcount.
4. **Pool → plants** derived from line membership (POOL-FLEX → {1,3,4}); used to
   aggregate shared-role requirements to the pool.
5. **Exceptions** — recorded against `pool_code` + role (or plant mapped to pool).
6. `line_resource_requirements` / `plant_resource_requirements` — unchanged (inputs).

## Engine changes

- `pool_labour` grouped by **pool_code** (not plant), covering all roles.
- Shared-role need aggregated across the pool's plants with operating intensity.
- Add **concurrency feasibility** per pool (max lines runnable by the binding role).

## UI changes

- "Staffing feasibility" panel groups by **pool** (POOL-FLEX, POOL-P2), showing
  per role: need / have / gap + the "lines you can run" figure.
- Spotlight / actions / outlook read the pool gap (as they do now, just re-grouped).

## Template / generator

- Pool Headcount sheet keyed by **pool_code** × role × month (POOL-FLEX, POOL-P2),
  fully pre-filled with a fully-staffed default to edit down.

---

## What we reuse vs revise

- **Reuse:** the FTE need/have/gap engine, the `pool_headcount` table, the Staffing
  Feasibility panel, the pool-based headcount upload — all the v1 plumbing.
- **Revise:** pool definition (spans plants), re-key headcount plant→pool, engine
  grouping, shared-role need aggregation, add concurrency feasibility, template by pool.

## Transition

- Migration to redefine pools + remap lines + re-key `pool_headcount` to pool_code.
- The current pool-by-plant data (batch 12) is superseded; re-upload pool headcount
  by pool after the rebuild.

---

## Resolved
- **Shared-role need = FLAT** (full plant requirement whenever the plant operates; no
  utilisation scaling). Confirmed.
- **Line-role need is per-line** — palletiser counted only on lines that require it.
- **Pool headcount granularity** — monthly (to plan hires/leavers).

## Open items
1. **Per-line crew reconciliation** — A304/A305 still show 5 in data vs "3+palletiser".
2. **Robot operators** — confirm they flex across 1/3/4 like the rest (not equipment-tied).
