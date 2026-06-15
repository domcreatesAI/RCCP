"""
RCCP Engine — Phase 2 throughput-based capacity calculation.

Computes available litres vs required litres per line per month over a
12-month rolling horizon from the batch's earliest production order date.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, date
from typing import Any


# Materiality threshold for headcount shortfalls. A line is only flagged for a
# staffing risk when the average monthly gap reaches a whole person; sub-1-FTE
# gaps are within rostering noise and stay visible only in the per-month detail.
# Mirrors HC_MATERIAL in frontend/src/components/rccp/brand.ts.
HC_MATERIAL = 1.0


# ─── helpers ──────────────────────────────────────────────────────────────────

def _period(d: date | str) -> str:
    """Return 'YYYY-MM' for a date or date string."""
    if isinstance(d, str):
        d = datetime.fromisoformat(d).date()
    elif isinstance(d, datetime):
        d = d.date()
    return f"{d.year:04d}-{d.month:02d}"


def _week_str(d: date) -> str:
    """Return 'YYYY-WNN' using ISO week numbering (e.g. '2026-W12')."""
    iso = d.isocalendar()
    return f"{iso[0]:04d}-W{iso[1]:02d}"


def _months_range(start_period: str, n: int) -> list[str]:
    """Return n consecutive YYYY-MM strings starting from start_period."""
    year, month = int(start_period[:4]), int(start_period[5:7])
    result = []
    for _ in range(n):
        result.append(f"{year:04d}-{month:02d}")
        month += 1
        if month > 12:
            month = 1
            year += 1
    return result


def _weeks_range(start_date: date, n: int) -> list[str]:
    """Return n consecutive ISO week strings starting from the week containing start_date."""
    from datetime import timedelta
    monday = start_date - timedelta(days=start_date.weekday())
    result, seen = [], set()
    current = monday
    while len(result) < n:
        ws = _week_str(current)
        if ws not in seen:
            result.append(ws)
            seen.add(ws)
        current += timedelta(days=7)
    return result


def _to_hours(
    litres: float,
    available_litres: float | None,
    available_hours: float | None,
) -> float | None:
    """Convert litres to hours using the proportional ratio: hours = (litres / available_litres) × available_hours."""
    if not available_litres or available_hours is None:
        return None
    return round((litres / available_litres) * available_hours, 1)


# ─── main entry point ─────────────────────────────────────────────────────────

def compute_dashboard(conn, batch_id: int, allowed_statuses: tuple[str, ...] = ("PUBLISHED",)) -> dict:
    cursor = conn.cursor()

    # Stable config from app_settings (code defaults apply if a row is absent).
    # OEE is per-line (dbo.lines.oee_target); 0.55 is only a safety net for a line
    # with no value at all.
    from app.services import settings_service
    DEFAULT_OEE_FALLBACK = 0.55
    cogs_per_litre = settings_service.get_float(conn, "cogs_opex_per_litre", 0.12)

    _default_abc = [i["code"] for i in settings_service.ABC_INDICATORS if i["default_included"]]
    included_abc: set[str] = set(
        settings_service.get_list(conn, "included_abc_indicators", _default_abc)
    )

    # ── 1. Verify batch is PUBLISHED ──────────────────────────────────────────
    cursor.execute(
        "SELECT batch_id, batch_name, status, plan_cycle_date FROM dbo.import_batches WHERE batch_id = ?",
        batch_id,
    )
    row = cursor.fetchone()
    if not row:
        raise ValueError(f"Batch {batch_id} not found")
    batch_status = row.status
    if batch_status not in allowed_statuses:
        allowed = " or ".join(allowed_statuses)
        raise ValueError(f"Batch {batch_id} is {batch_status}; RCCP requires a {allowed} batch")

    plan_cycle_date = row.plan_cycle_date
    if hasattr(plan_cycle_date, 'date'):
        plan_cycle_date = plan_cycle_date.date()

    # ── 2. Load capacity calendar ──────────────────────────────────────────────
    # planned_hours (if set) is Manufacturing's explicit operating envelope for
    # that day — i.e. hours scheduled after planned losses. The loss columns
    # explain *why* the figure differs from the line's standard, and feed the
    # planned-downtime panel.
    cursor.execute("""
        SELECT line_code, calendar_date, is_working_day,
               planned_hours,
               maintenance_hours, public_holiday_hours,
               planned_downtime_hours, other_loss_hours
        FROM dbo.vw_line_capacity_with_net
        WHERE batch_id = ?
    """, batch_id)
    capacity_rows = cursor.fetchall()

    # ── 3. Load line pack capabilities ────────────────────────────────────────
    cursor.execute("""
        SELECT line_code, pack_size_l, litres_per_minute, effective_mins_per_day
        FROM dbo.vw_line_pack_capabilities
    """)
    pack_cap_rows = cursor.fetchall()

    # Build: line_code -> list of {pack_size_l, litres_per_minute}
    line_pack: dict[str, list[dict]] = defaultdict(list)
    for r in pack_cap_rows:
        if r.litres_per_minute and r.litres_per_minute > 0:
            line_pack[r.line_code].append({
                "pack_size_l": r.pack_size_l,
                "litres_per_minute": float(r.litres_per_minute),
            })

    # ── 4. Load production orders ──────────────────────────────────────────────
    cursor.execute("""
        SELECT po.production_line, po.item_code, po.order_type,
               po.net_quantity, po.basic_start_date
        FROM dbo.production_orders po
        WHERE po.batch_id = ?
    """, batch_id)
    order_rows = cursor.fetchall()

    # ── 5. Load item pack sizes + primary line routing + ABC indicators ───────
    # primary_line_code from sku_masterdata is the routing source of truth.
    # production_orders.production_line is metadata only — not used for calculations.
    cursor.execute("SELECT item_code, pack_size_l, primary_line_code, abc_indicator FROM dbo.items")
    item_pack: dict[str, float] = {}
    item_primary_line: dict[str, str] = {}
    item_abc: dict[str, str | None] = {}   # item_code → abc_indicator (None if not set)
    for r in cursor.fetchall():
        if r.pack_size_l is not None:
            item_pack[r.item_code] = float(r.pack_size_l)
        if r.primary_line_code is not None:
            item_primary_line[r.item_code] = r.primary_line_code
        item_abc[r.item_code] = r.abc_indicator if r.abc_indicator else None

    # ABC filter helper — returns True if this item should contribute to capacity calcs.
    # Items with no ABC indicator are included (safe default) and counted separately.
    def _abc_included(item_code: str) -> bool:
        abc = item_abc.get(item_code)
        if abc is None:
            return True   # no indicator → include; engine tracks these separately
        return abc in included_abc

    # Counts used for the KPI block and dashboard warnings
    _abc_excluded_items: set[str] = set()
    _abc_no_indicator_items: set[str] = set()

    # ── 5b. Load S&OP demand per line × period ───────────────────────────────
    # demand_plan stores monthly S&OP sales forecast in EA (unpivoted, one row per item × month).
    # Convert to litres and route to lines via items.primary_line_code.
    cursor.execute("""
        SELECT item_code,
               CONVERT(VARCHAR(7), period_start_date, 120) AS period,
               SUM(demand_quantity) AS demand_qty
        FROM dbo.demand_plan
        WHERE batch_id = ?
        GROUP BY item_code, CONVERT(VARCHAR(7), period_start_date, 120)
    """, batch_id)
    line_period_demand: dict[tuple, float] = defaultdict(float)
    for r in cursor.fetchall():
        if not _abc_included(r.item_code):
            continue   # excluded ABC indicator — don't add demand either
        routing_line = item_primary_line.get(r.item_code)
        if not routing_line:
            continue
        pack_l = item_pack.get(r.item_code, 0.0)
        litres = float(r.demand_qty) * pack_l
        line_period_demand[(routing_line, r.period)] += litres

    # ── 5c. Load actual production per line × period ──────────────────────────
    # From SAP MB51 goods receipts. quantity_l is pre-computed on publish (EA × pack_size_l).
    # Route to lines via items.primary_line_code — same routing as production orders.
    cursor.execute("""
        SELECT ap.item_code,
               FORMAT(ap.posting_date, 'yyyy-MM') AS period,
               SUM(ap.quantity_l) AS actual_litres
        FROM dbo.actual_production ap
        WHERE ap.batch_id = ?
          AND ap.quantity_l IS NOT NULL
        GROUP BY ap.item_code, FORMAT(ap.posting_date, 'yyyy-MM')
    """, batch_id)
    actual_by_line_period: dict[tuple, float] = defaultdict(float)
    for r in cursor.fetchall():
        routing_line = item_primary_line.get(r.item_code)
        if routing_line:
            actual_by_line_period[(routing_line, r.period)] += float(r.actual_litres)

    # ── 6. Load headcount plan vs requirements ─────────────────────────────────
    # Planned headcount: sum across roles per line per day
    cursor.execute("""
        SELECT hp.line_code, CAST(hp.plan_date AS DATE) AS plan_date,
               SUM(hp.planned_headcount) AS planned
        FROM dbo.headcount_plan hp
        WHERE hp.batch_id = ?
        GROUP BY hp.line_code, CAST(hp.plan_date AS DATE)
    """, batch_id)
    hc_plan: dict[tuple, int] = {}
    for r in cursor.fetchall():
        d = r.plan_date
        if hasattr(d, 'date'):
            d = d.date()
        hc_plan[(r.line_code, str(d))] = int(r.planned)

    # Required headcount per line — total (for labour_status check) and per-role (for headcount panel)
    cursor.execute("""
        SELECT line_code, resource_type_code, headcount_required
        FROM dbo.line_resource_requirements
        ORDER BY line_code, resource_type_code
    """)
    hc_required: dict[str, int] = defaultdict(int)
    line_hc_roles: dict[str, list[dict]] = defaultdict(list)
    for r in cursor.fetchall():
        hc_required[r.line_code] += int(r.headcount_required)
        line_hc_roles[r.line_code].append({
            "role_code": r.resource_type_code,
            "required": int(r.headcount_required),
        })

    # Plant support requirements (forklift drivers, materials handlers, robot operators)
    cursor.execute("""
        SELECT plant_code, resource_type_code, headcount_required
        FROM dbo.plant_resource_requirements
        ORDER BY plant_code, resource_type_code
    """)
    plant_support: dict[str, list[dict]] = defaultdict(list)
    for r in cursor.fetchall():
        plant_support[r.plant_code].append({
            "role_code": r.resource_type_code,
            "required": int(r.headcount_required),
        })

    # Plant support planned headcount (from Sheet 2 of headcount_plan upload)
    cursor.execute("""
        SELECT php.plant_code, php.resource_type_code,
               CAST(php.plan_date AS DATE) AS plan_date,
               SUM(php.planned_headcount) AS planned
        FROM dbo.plant_headcount_plan php
        WHERE php.batch_id = ?
        GROUP BY php.plant_code, php.resource_type_code, CAST(php.plan_date AS DATE)
    """, batch_id)
    plant_hc_plan: dict[tuple, float] = {}
    for r in cursor.fetchall():
        d = r.plan_date
        if hasattr(d, 'date'):
            d = d.date()
        plant_hc_plan[(r.plant_code, r.resource_type_code, str(d))] = float(r.planned)

    # Headcount exceptions (Sheet 3) — known absences applied as deltas
    cursor.execute("""
        SELECT line_code, plant_code, resource_type_code,
               CAST(start_date AS DATE) AS start_date,
               CAST(end_date   AS DATE) AS end_date,
               delta_headcount, reason
        FROM dbo.headcount_exceptions
        WHERE batch_id = ?
    """, batch_id)
    headcount_exceptions: list[dict] = []
    for r in cursor.fetchall():
        sd, ed = r.start_date, r.end_date
        if hasattr(sd, 'date'): sd = sd.date()
        if hasattr(ed, 'date'): ed = ed.date()
        headcount_exceptions.append({
            "line_code":  r.line_code,
            "plant_code": r.plant_code,
            "role_code":  r.resource_type_code,
            "start":      sd,
            "end":        ed,
            "delta":      float(r.delta_headcount),
            "reason":     r.reason,
        })

    # ── 7. Load lines list (for plant + pool info) ─────────────────────────────
    cursor.execute("""
        SELECT l.line_code, l.plant_code, l.labour_pool_code,
               l.oee_target, l.available_mins_per_day,
               lp.max_concurrent_lines
        FROM dbo.lines l
        LEFT JOIN dbo.labour_pools lp ON lp.pool_code = l.labour_pool_code
    """)
    lines_meta: dict[str, dict] = {}
    for r in cursor.fetchall():
        lines_meta[r.line_code] = {
            "plant_code": r.plant_code,
            "pool_code": r.labour_pool_code,
            "pool_max_concurrent": r.max_concurrent_lines,
            "oee_target": float(r.oee_target) if r.oee_target else DEFAULT_OEE_FALLBACK,
            "available_mins_per_day": float(r.available_mins_per_day) if r.available_mins_per_day else 420.0,
        }

    # ── 8. Determine horizon ──────────────────────────────────────────────────
    order_dates = []
    for r in order_rows:
        d = r.basic_start_date
        if d:
            if hasattr(d, 'date'):
                d = d.date()
            order_dates.append(d)

    # Always include 3 months before plan_cycle_date so the Capacity vs Actuals
    # view has monthly buckets for past periods (actual_production + capacity).
    _pm, _py = plan_cycle_date.month - 3, plan_cycle_date.year
    while _pm < 1:
        _pm += 12
        _py -= 1
    past_start_date = date(_py, _pm, 1)

    if order_dates:
        horizon_start_date = min(past_start_date, min(order_dates))
    else:
        horizon_start_date = past_start_date
    horizon_start = _period(horizon_start_date)

    # Total span: from horizon_start through plan_cycle_date + 18 forward
    hs_y, hs_m = int(horizon_start[:4]), int(horizon_start[5:7])
    months_back = (plan_cycle_date.year - hs_y) * 12 + (plan_cycle_date.month - hs_m)
    horizon_months = _months_range(horizon_start, months_back + 18)
    horizon_weeks  = _weeks_range(horizon_start_date, 26)  # 26 weeks covers 4W/8W/12W views
    horizon_months_set = set(horizon_months)
    week_set = set(horizon_weeks)

    # ── 9. Build per-period operating envelope per line ───────────────────────
    # For each day:
    #   effective_mins = 0                                                   if is_working_day = 0
    #                  = planned_hours × 60                                  if planned_hours is set
    #                  = masterdata available_mins_per_day                   otherwise (legacy default)
    #
    # Loss columns (maintenance, planned downtime, public holiday, other) are
    # NOT subtracted from the envelope — `planned_hours` is the authoritative
    # net figure. The loss columns are itemised reasons, surfaced separately
    # on the Planned-Downtime panel.
    line_period_days: dict[tuple, dict] = defaultdict(
        lambda: {"working_days": 0, "effective_mins": 0.0, "oee": 0.55}
    )
    line_week_days:   dict[tuple, dict] = defaultdict(
        lambda: {"working_days": 0, "effective_mins": 0.0, "oee": 0.55}
    )
    # Per-line per-period planned loss hours (sum of all four loss categories)
    line_period_losses: dict[tuple, float] = defaultdict(float)
    # Optional per-category breakdown (for hover tooltips on the panel)
    line_period_losses_breakdown: dict[tuple, dict] = defaultdict(
        lambda: {"maintenance": 0.0, "planned_downtime": 0.0, "public_holiday": 0.0, "other_loss": 0.0}
    )
    # Per-line working dates — used by the headcount-exception prorate
    line_working_dates: dict[str, set[date]] = defaultdict(set)

    def _to_float(v) -> float:
        return float(v) if v is not None else 0.0

    for r in capacity_rows:
        cal_date = r.calendar_date
        if hasattr(cal_date, 'date'):
            cal_date = cal_date.date()
        meta = lines_meta.get(r.line_code, {})
        mins_default = meta.get("available_mins_per_day", 420.0)
        oee = meta.get("oee_target", 0.55)

        # Effective minutes for this day under the rule above
        if not r.is_working_day:
            effective_mins = 0.0
        elif r.planned_hours is not None:
            effective_mins = max(0.0, float(r.planned_hours) * 60.0)
        else:
            effective_mins = mins_default

        # Loss hours for downtime panel (independent of effective_mins)
        loss_m = _to_float(r.maintenance_hours)
        loss_p = _to_float(r.planned_downtime_hours)
        loss_h = _to_float(r.public_holiday_hours)
        loss_o = _to_float(r.other_loss_hours)
        loss_total = loss_m + loss_p + loss_h + loss_o

        if r.is_working_day:
            line_working_dates[r.line_code].add(cal_date)

        p = _period(cal_date)
        if p in horizon_months_set:
            key = (r.line_code, p)
            if r.is_working_day:
                line_period_days[key]["working_days"] += 1
            line_period_days[key]["effective_mins"] += effective_mins
            line_period_days[key]["oee"] = oee
            line_period_losses[key] += loss_total
            bd = line_period_losses_breakdown[key]
            bd["maintenance"]      += loss_m
            bd["planned_downtime"] += loss_p
            bd["public_holiday"]   += loss_h
            bd["other_loss"]       += loss_o

        ws = _week_str(cal_date)
        if ws in week_set:
            wkey = (r.line_code, ws)
            if r.is_working_day:
                line_week_days[wkey]["working_days"] += 1
            line_week_days[wkey]["effective_mins"] += effective_mins
            line_week_days[wkey]["oee"] = oee

    # ── 9b. Prorated headcount exceptions ─────────────────────────────────────
    # For each exception, find the working-day overlap with every horizon month
    # and produce a prorated delta:
    #     prorated_delta = delta × (overlap_working_days / month_working_days)
    # Aggregate the deltas per (line/plant, role, period). Keep an audit list
    # of the underlying events so the People Fit panel can show the reasons.
    from datetime import timedelta as _timedelta

    # Per-plant union of working dates (any line in the plant operating that day)
    plant_working_dates: dict[str, set[date]] = defaultdict(set)
    for lc, dates in line_working_dates.items():
        plant_code_of_line = (lines_meta.get(lc) or {}).get("plant_code")
        if plant_code_of_line:
            plant_working_dates[plant_code_of_line] |= dates

    def _month_window(period: str) -> tuple[date, date]:
        year, month = int(period[:4]), int(period[5:7])
        if month == 12:
            nxt = date(year + 1, 1, 1)
        else:
            nxt = date(year, month + 1, 1)
        return date(year, month, 1), nxt - _timedelta(days=1)

    def _count_working_in_range(dates: set[date], start: date, end: date) -> int:
        return sum(1 for d in dates if start <= d <= end)

    # (line, role, period) → adjustment (signed FTE deltas applied to that role)
    line_role_adjustments: dict[tuple, float] = defaultdict(float)
    # (line, period) → list[exception detail dict] for UI
    line_exception_detail: dict[tuple, list[dict]] = defaultdict(list)
    # (plant, role, period) → adjustment
    plant_role_adjustments: dict[tuple, float] = defaultdict(float)
    plant_exception_detail: dict[tuple, list[dict]] = defaultdict(list)

    for exc in headcount_exceptions:
        sd, ed = exc["start"], exc["end"]
        if sd is None or ed is None or ed < sd:
            continue
        delta = exc["delta"]
        if delta == 0:
            continue

        for period in horizon_months:
            month_start, month_end = _month_window(period)
            overlap_start = max(sd, month_start)
            overlap_end   = min(ed, month_end)
            if overlap_end < overlap_start:
                continue

            if exc["line_code"]:
                lc = exc["line_code"]
                working_dates = line_working_dates.get(lc, set())
                month_wd = sum(1 for d in working_dates if month_start <= d <= month_end)
                if month_wd == 0:
                    continue
                overlap_wd = _count_working_in_range(working_dates, overlap_start, overlap_end)
                if overlap_wd == 0:
                    continue
                prorated = delta * (overlap_wd / month_wd)

                roles_on_line = line_hc_roles.get(lc, [])
                total_req = sum(r["required"] for r in roles_on_line) or 0
                if exc["role_code"]:
                    # Apply only to the named role
                    line_role_adjustments[(lc, exc["role_code"], period)] += prorated
                elif total_req > 0:
                    # Distribute across roles proportionally to per-line requirement
                    for r in roles_on_line:
                        share = prorated * (r["required"] / total_req)
                        line_role_adjustments[(lc, r["role_code"], period)] += share

                line_exception_detail[(lc, period)].append({
                    "scope":  "LINE",
                    "code":   lc,
                    "role":   exc["role_code"],
                    "start":  str(sd),
                    "end":    str(ed),
                    "delta":  delta,
                    "delta_prorated": round(prorated, 2),
                    "reason": exc["reason"],
                })

            elif exc["plant_code"] and exc["role_code"]:
                pc = exc["plant_code"]
                working_dates = plant_working_dates.get(pc, set())
                month_wd = sum(1 for d in working_dates if month_start <= d <= month_end)
                if month_wd == 0:
                    continue
                overlap_wd = _count_working_in_range(working_dates, overlap_start, overlap_end)
                if overlap_wd == 0:
                    continue
                prorated = delta * (overlap_wd / month_wd)
                plant_role_adjustments[(pc, exc["role_code"], period)] += prorated

                plant_exception_detail[(pc, period)].append({
                    "scope":  "PLANT",
                    "code":   pc,
                    "role":   exc["role_code"],
                    "start":  str(sd),
                    "end":    str(ed),
                    "delta":  delta,
                    "delta_prorated": round(prorated, 2),
                    "reason": exc["reason"],
                })

    # ── 10. Production orders → required litres per line × period ─────────────
    # Routing: always use items.primary_line_code (from sku_masterdata).
    # production_orders.production_line is ignored for calculations — metadata only.
    # firm = YPAC (released), planned = LA (planned)
    line_period_firm: dict[tuple, float] = defaultdict(float)
    line_period_planned: dict[tuple, float] = defaultdict(float)
    # Track litres by pack size per line × period — used for weighted-average capacity calc
    line_period_pack_litres: dict[tuple, float] = defaultdict(float)  # (line, period, pack_size_l) → litres
    # Weekly equivalents
    line_week_firm: dict[tuple, float] = defaultdict(float)
    line_week_planned: dict[tuple, float] = defaultdict(float)
    line_week_pack_litres: dict[tuple, float] = defaultdict(float)
    # Unassigned: SKU has no primary_line_code in sku_masterdata
    unassigned_firm: dict[tuple, float] = defaultdict(float)   # (item_code, period, order_type)
    unassigned_planned: dict[tuple, float] = defaultdict(float)
    unassigned_counts: dict[tuple, int] = defaultdict(int)

    for r in order_rows:
        if r.net_quantity is None or r.basic_start_date is None:
            continue

        # ABC filter — skip excluded SKUs; track no-indicator items for the KPI warning
        if not _abc_included(r.item_code):
            _abc_excluded_items.add(r.item_code)
            continue
        if item_abc.get(r.item_code) is None:
            _abc_no_indicator_items.add(r.item_code)

        d = r.basic_start_date
        if hasattr(d, 'date'):
            d = d.date()

        pack_l = item_pack.get(r.item_code, 0.0)
        litres = float(r.net_quantity) * pack_l
        routing_line = item_primary_line.get(r.item_code)

        p = _period(d)
        ws = _week_str(d)

        if not routing_line:
            if p in horizon_months_set:
                key = (r.item_code or "UNKNOWN", p, r.order_type or "OTHER")
                if r.order_type == "YPAC":
                    unassigned_firm[key] += litres
                else:
                    unassigned_planned[key] += litres
                unassigned_counts[key] += 1
        else:
            if p in horizon_months_set:
                if r.order_type == "YPAC":
                    line_period_firm[(routing_line, p)] += litres
                else:
                    line_period_planned[(routing_line, p)] += litres
                if pack_l > 0:
                    line_period_pack_litres[(routing_line, p, pack_l)] += litres
            if ws in week_set:
                if r.order_type == "YPAC":
                    line_week_firm[(routing_line, ws)] += litres
                else:
                    line_week_planned[(routing_line, ws)] += litres
                if pack_l > 0:
                    line_week_pack_litres[(routing_line, ws, pack_l)] += litres

    # ── 11. Available litres per line × period ────────────────────────────────
    # Available capacity is calculated as:
    #   weighted_avg_lpm × OEE × available_mins_per_day × working_days
    #
    # weighted_avg_lpm = Σ(litres_i × lpm_i) / Σ(litres_i)
    #   where i iterates over pack sizes in the planned product mix for that period.
    #
    # This reflects the physical reality that a line runs one product at a time;
    # throughput depends on the fill speed for each pack size being run.
    # A line running mostly large packs (higher L/min) has more litres available
    # than one running mostly small packs (lower L/min).
    #
    # Fallback (no orders in period): max L/min across all pack sizes the line
    # can run — this is the theoretical ceiling and the most conservative estimate.
    #
    # If no pack capabilities are configured → available_litres = None (no data).

    # Pre-compute weighted L/min per line × period (monthly)
    line_period_weighted_lpm: dict[tuple, float] = {}
    for lc, pack_caps_list in line_pack.items():
        lpm_by_pack: dict[float, float] = {pc["pack_size_l"]: pc["litres_per_minute"] for pc in pack_caps_list}
        max_lpm = max(lpm_by_pack.values())
        for period in horizon_months:
            mix: dict[float, float] = {
                ps: line_period_pack_litres.get((lc, period, ps), 0.0)
                for ps in lpm_by_pack
            }
            total_mix = sum(mix.values())
            if total_mix > 0:
                weighted_lpm = sum(mix[ps] * lpm_by_pack[ps] for ps in mix) / total_mix
            else:
                weighted_lpm = max_lpm
            line_period_weighted_lpm[(lc, period)] = weighted_lpm

    # Pre-compute weighted L/min per line × week
    line_week_weighted_lpm: dict[tuple, float] = {}
    for lc, pack_caps_list in line_pack.items():
        lpm_by_pack = {pc["pack_size_l"]: pc["litres_per_minute"] for pc in pack_caps_list}
        max_lpm = max(lpm_by_pack.values())
        for week in horizon_weeks:
            mix = {ps: line_week_pack_litres.get((lc, week, ps), 0.0) for ps in lpm_by_pack}
            total_mix = sum(mix.values())
            weighted_lpm = sum(mix[ps] * lpm_by_pack[ps] for ps in mix) / total_mix if total_mix > 0 else max_lpm
            line_week_weighted_lpm[(lc, week)] = weighted_lpm

    # Max L/min per line — used to convert actual_litres → actual_hours for historical periods
    max_lpm_by_line: dict[str, float] = {
        lc: max(pc["litres_per_minute"] for pc in caps)
        for lc, caps in line_pack.items() if caps
    }

    def _available(line_code: str, period: str) -> float | None:
        if line_code not in line_pack:
            return None
        key = (line_code, period)
        cal = line_period_days.get(key, {})
        effective_mins = cal.get("effective_mins", 0.0)
        oee = cal.get("oee", 0.55)
        if effective_mins <= 0:
            return 0.0
        wlpm = line_period_weighted_lpm.get(key)
        if wlpm is None:
            return None
        return wlpm * oee * effective_mins

    def _available_weekly(line_code: str, week: str) -> float | None:
        if line_code not in line_pack:
            return None
        key = (line_code, week)
        cal = line_week_days.get(key, {})
        effective_mins = cal.get("effective_mins", 0.0)
        oee = cal.get("oee", 0.55)
        if effective_mins <= 0:
            return 0.0
        wlpm = line_week_weighted_lpm.get(key)
        if wlpm is None:
            return None
        return wlpm * oee * effective_mins

    # ── 12. Headcount check per line × period ─────────────────────────────────
    def _labour_status(line_code: str, period: str) -> str:
        """Return OK / SHORTFALL / NO_DATA for a line × period."""
        required = hc_required.get(line_code)
        if required is None or required == 0:
            return "NO_DATA"
        year, month = int(period[:4]), int(period[5:7])
        has_data = False
        for (lc, day_str), planned in hc_plan.items():
            if lc != line_code:
                continue
            day_date = datetime.fromisoformat(day_str).date() if isinstance(day_str, str) else day_str
            if day_date.year == year and day_date.month == month:
                has_data = True
                if planned < required:
                    return "SHORTFALL"
        return "OK" if has_data else "NO_DATA"

    def _hc_planned_avg(line_code: str, period: str) -> float | None:
        """Mean daily planned headcount across all days in the period for a line."""
        year, month = int(period[:4]), int(period[5:7])
        vals = [
            v for (lc, d), v in hc_plan.items()
            if lc == line_code
            and (datetime.fromisoformat(d).date() if isinstance(d, str) else d).year == year
            and (datetime.fromisoformat(d).date() if isinstance(d, str) else d).month == month
        ]
        return round(sum(vals) / len(vals), 1) if vals else None

    def _hc_shortfall(line_code: str, period: str) -> float | None:
        """max(0, required - planned_avg), None when either is absent."""
        req = hc_required.get(line_code)
        avg = _hc_planned_avg(line_code, period)
        if req is None or avg is None:
            return None
        return max(0.0, float(req) - avg)

    def _plant_hc_planned_avg(plant_code: str, role_code: str, period: str) -> float | None:
        """Mean daily planned headcount for a plant support role in a period."""
        year, month = int(period[:4]), int(period[5:7])
        vals = [
            v for (pc, rc, d), v in plant_hc_plan.items()
            if pc == plant_code and rc == role_code
            and (datetime.fromisoformat(d).date() if isinstance(d, str) else d).year == year
            and (datetime.fromisoformat(d).date() if isinstance(d, str) else d).month == month
        ]
        return round(sum(vals) / len(vals), 1) if vals else None

    def _plant_hc_shortfall(plant_code: str, role_code: str, required: int, period: str) -> float | None:
        """max(0, required - planned_avg) for a plant support role, None if no plan data."""
        avg = _plant_hc_planned_avg(plant_code, role_code, period)
        if avg is None:
            return None
        return round(max(0.0, float(required) - avg), 1)

    # ── 13. Build per-line monthly breakdown ──────────────────────────────────
    # Risk is capacity-led: a line is Critical only when utilisation exceeds 100%.
    # A material (>= HC_MATERIAL) staffing gap escalates to High, not Critical — so
    # a low-utilisation line is never shown as a capacity emergency on its own.
    def _risk_status(util_pct: float | None, material_short: bool) -> str:
        if util_pct is None:
            return "High" if material_short else "No data"
        if util_pct > 100:
            return "Critical"
        if util_pct > 90 or material_short:
            return "High"
        if util_pct > 75:
            return "Watch"
        return "Stable"

    def _risk_score(util_pct: float | None, material_short: bool) -> int:
        if util_pct is None:
            return 15 if material_short else 0
        score = min(100, int(util_pct))
        if material_short:
            score = min(100, score + 15)
        return score

    def _primary_driver(util_pct: float | None, material_short: bool) -> str:
        if util_pct is None:
            return "LABOUR" if material_short else "NO_DATA"
        if util_pct > 90:
            return "CAPACITY"
        if material_short:
            return "LABOUR"
        return "STABLE"

    lines_out = []
    for line_code, meta in sorted(lines_meta.items()):

        # ── Weekly buckets ────────────────────────────────────────────────────
        weekly = []
        for week in horizon_weeks:
            wfirm    = line_week_firm.get((line_code, week), 0.0)
            wplanned = line_week_planned.get((line_code, week), 0.0)
            wprod    = wfirm + wplanned
            wavail   = _available_weekly(line_code, week)
            wcal     = line_week_days.get((line_code, week), {})
            wdays    = wcal.get("working_days", 0)
            woee     = wcal.get("oee", 0.55)
            weff_mins = wcal.get("effective_mins", 0.0)

            if wavail is not None and wavail > 0:
                wutil = round((wprod / wavail) * 100, 1)
                wgap  = round(wavail - wprod, 0)
            elif wavail == 0.0:
                wutil, wgap = 0.0, 0.0
            else:
                wutil, wgap = None, None

            wavail_h = (
                round(weff_mins * woee / 60.0, 1)
                if wavail is not None
                else None
            )
            wprod_h  = _to_hours(wprod, wavail, wavail_h)
            wgap_h   = round(wavail_h - wprod_h, 1) if wavail_h is not None and wprod_h is not None else None

            weekly.append({
                "period":            week,
                "working_days":      wdays,
                "available_litres":  round(wavail, 0) if wavail is not None else None,
                "firm_litres":       round(wfirm, 0),
                "planned_litres":    round(wplanned, 0),
                "production_litres": round(wprod, 0),
                "utilisation_pct":   wutil,
                "gap_litres":        wgap,
                "available_hours":   wavail_h,
                "firm_hours":        _to_hours(wfirm,    wavail, wavail_h),
                "planned_hours":     _to_hours(wplanned, wavail, wavail_h),
                "production_hours":  wprod_h,
                "gap_hours":         wgap_h,
            })

        monthly = []
        for period in horizon_months:
            firm = line_period_firm.get((line_code, period), 0.0)
            planned = line_period_planned.get((line_code, period), 0.0)
            production = firm + planned
            demand = line_period_demand.get((line_code, period), 0.0)
            actual = actual_by_line_period.get((line_code, period))
            avail = _available(line_code, period)
            cal = line_period_days.get((line_code, period), {})
            working_days = cal.get("working_days", 0)
            labour = _labour_status(line_code, period)

            if avail is not None and avail > 0:
                util_pct = round((production / avail) * 100, 1)
                gap = round(avail - production, 0)
            elif avail == 0.0:
                util_pct = 0.0
                gap = 0.0
            else:
                util_pct = None
                gap = None

            # Hours: available_hours = effective_mins × oee / 60
            # (effective_mins already reflects planned_hours per day from the calendar)
            oee_val     = cal.get("oee", 0.55)
            effective_m = cal.get("effective_mins", 0.0)
            if avail is None:
                available_hours = None
            else:
                available_hours = round(effective_m * oee_val / 60.0, 1)

            production_h = _to_hours(production, avail, available_hours)
            gap_hours = (
                round(available_hours - production_h, 1)
                if available_hours is not None and production_h is not None
                else None
            )

            # Actual hours: actual_litres / (max_lpm × 60). Uses max fill speed as proxy
            # for historical periods where weighted mix is unknown.
            max_lpm = max_lpm_by_line.get(line_code)
            actual_hours = (
                round(actual / (max_lpm * 60), 1)
                if actual is not None and max_lpm and max_lpm > 0
                else None
            )

            # Planned downtime — total + breakdown (independent of capacity calc)
            loss_total = line_period_losses.get((line_code, period), 0.0)
            loss_bd = line_period_losses_breakdown.get((line_code, period),
                                                       {"maintenance": 0.0, "planned_downtime": 0.0,
                                                        "public_holiday": 0.0, "other_loss": 0.0})

            # Headcount — standard from Sheet 1, exceptions applied as a delta
            standard_hc = _hc_planned_avg(line_code, period)
            # Total per-line exception delta this period = sum across the line's roles
            line_adj_total = sum(
                line_role_adjustments.get((line_code, r["role_code"], period), 0.0)
                for r in line_hc_roles.get(line_code, [])
            )
            if standard_hc is not None:
                effective_hc = round(max(0.0, standard_hc + line_adj_total), 2)
            else:
                effective_hc = None
            req_val = hc_required.get(line_code)
            effective_shortfall = (
                round(max(0.0, float(req_val) - effective_hc), 2)
                if req_val is not None and effective_hc is not None
                else None
            )

            monthly.append({
                "period": period,
                "working_days": working_days,
                # litres
                "available_litres":  round(avail, 0) if avail is not None else None,
                "demand_litres":     round(demand, 0),
                "firm_litres":       round(firm, 0),
                "planned_litres":    round(planned, 0),
                "production_litres": round(production, 0),
                "actual_litres":     round(actual, 0) if actual is not None else None,
                "utilisation_pct":   util_pct,
                "gap_litres":        gap,
                "labour_status":     labour,
                # hours
                "available_hours":   available_hours,
                "firm_hours":        _to_hours(firm,    avail, available_hours),
                "planned_hours":     _to_hours(planned, avail, available_hours),
                "production_hours":  production_h,
                "demand_hours":      _to_hours(demand,  avail, available_hours),
                "gap_hours":         gap_hours,
                "actual_hours":      actual_hours,
                # headcount — hc_planned_avg is the EFFECTIVE figure
                # (standard + exception deltas). hc_planned_standard is the
                # raw Sheet-1 value before adjustments.
                "hc_required":          req_val,
                "hc_planned_avg":       effective_hc,
                "hc_planned_standard":  standard_hc,
                "hc_shortfall":         effective_shortfall,
                "hc_exceptions":        line_exception_detail.get((line_code, period), []),
                # planned downtime (annotation; does not subtract from available)
                "loss_hours":        round(loss_total, 1),
                "loss_breakdown": {
                    "maintenance":       round(loss_bd["maintenance"], 1),
                    "planned_downtime":  round(loss_bd["planned_downtime"], 1),
                    "public_holiday":    round(loss_bd["public_holiday"], 1),
                    "other_loss":        round(loss_bd["other_loss"], 1),
                },
            })

        # Peak utilisation across all months (worst case)
        utils = [m["utilisation_pct"] for m in monthly if m["utilisation_pct"] is not None]
        peak_util = max(utils) if utils else None
        # Overall labour status: SHORTFALL if any month has shortfall
        labour_statuses = [m["labour_status"] for m in monthly]
        if "SHORTFALL" in labour_statuses:
            overall_labour = "SHORTFALL"
        elif "OK" in labour_statuses:
            overall_labour = "OK"
        else:
            overall_labour = "NO_DATA"

        # Material shortfall: a whole-person (>= HC_MATERIAL) gap in any month.
        material_short = any(
            m["hc_shortfall"] is not None and m["hc_shortfall"] >= HC_MATERIAL
            for m in monthly
        )

        risk = _risk_status(peak_util, material_short)
        score = _risk_score(peak_util, material_short)
        driver = _primary_driver(peak_util, material_short)

        lines_out.append({
            "line_code": line_code,
            "line_name": f"Line {line_code}",
            "plant_code": meta["plant_code"],
            "pool_code": meta["pool_code"],
            "pool_max_concurrent": meta["pool_max_concurrent"],
            "oee_target": meta["oee_target"],
            "available_mins_per_day": int(meta["available_mins_per_day"]),
            "risk_status": risk,
            "risk_score": score,
            "primary_driver": driver,
            "labour_status": overall_labour,
            "material_labour_shortfall": material_short,
            "hc_roles": line_hc_roles.get(line_code, []),
            "monthly": monthly,
            "weekly": weekly,
        })

    # Sort by risk_score descending
    lines_out.sort(key=lambda x: x["risk_score"], reverse=True)

    # ── 14. Unassigned orders ──────────────────────────────────────────────────
    # These are SKUs with no primary_line_code in sku_masterdata.
    unassigned_out = []
    all_unassigned_keys = set(unassigned_firm.keys()) | set(unassigned_planned.keys())
    for key in sorted(all_unassigned_keys):
        item_code, period, order_type = key
        firm_l = unassigned_firm.get(key, 0.0)
        fc_l = unassigned_planned.get(key, 0.0)
        count = unassigned_counts.get(key, 0)
        unassigned_out.append({
            "item_code": item_code,
            "period": period,
            "order_type": order_type,
            "total_litres": round(firm_l + fc_l, 0),
            "order_count": count,
        })

    # ── 15. KPIs ───────────────────────────────────────────────────────────────
    critical = sum(1 for l in lines_out if l["risk_status"] == "Critical")
    high = sum(1 for l in lines_out if l["risk_status"] == "High")
    labour_shortfalls = sum(1 for l in lines_out if l["material_labour_shortfall"])
    no_data = sum(1 for l in lines_out if l["risk_status"] == "No data")

    # Site-level KPIs:
    #   overall_utilisation_pct       = Σ production / Σ available           (theoretical load)
    #   overall_plan_feasibility_pct  = Σ min(prod, avail) / Σ production    (the actionable signal)
    # Feasibility < 100% means some demand can't be made on the constrained
    # lines and needs OT / extra shift / reschedule.
    _total_prod = 0.0
    _total_avail = 0.0
    _deliverable = 0.0
    _any_avail = False
    for l in lines_out:
        for m in l["monthly"]:
            p = m.get("production_litres") or 0.0
            a = m.get("available_litres")
            if a is None:
                _deliverable += p
                continue
            _any_avail = True
            _total_prod += p
            _total_avail += a
            if p > 0:
                _deliverable += min(p, a)
    overall_util = None
    overall_feasibility = None
    if _any_avail and _total_avail > 0:
        overall_util = round((_total_prod / _total_avail) * 100, 1)
    if _total_prod > 0:
        overall_feasibility = round((_deliverable / _total_prod) * 100, 1)

    # Total annual gap: sum of ALL deficit months across ALL lines.
    # Only negative gaps contribute (months where production > available capacity).
    # Surplus months and surplus lines do not offset deficits — capacity is not transferable.
    # This gives the true annual capacity shortfall that needs to be resolved.
    all_deficit_gaps_l = []
    for l in lines_out:
        for m in l["monthly"]:
            if m["gap_litres"] is not None and m["gap_litres"] < 0:
                all_deficit_gaps_l.append(m["gap_litres"])
    total_gap = round(sum(all_deficit_gaps_l), 0) if all_deficit_gaps_l else None

    # total_gap_hours: same — sum of all deficit months in hours
    all_deficit_gaps_h = []
    for l in lines_out:
        for m in l["monthly"]:
            if m["gap_hours"] is not None and m["gap_hours"] < 0:
                all_deficit_gaps_h.append(m["gap_hours"])
    total_gap_hours = round(sum(all_deficit_gaps_h), 1) if all_deficit_gaps_h else None

    # Peak utilisation — single highest value across all lines + periods
    peak_util_val: float | None = None
    peak_util_period: str | None = None
    for l in lines_out:
        for m in l["monthly"]:
            if m["utilisation_pct"] is not None:
                if peak_util_val is None or m["utilisation_pct"] > peak_util_val:
                    peak_util_val = m["utilisation_pct"]
                    peak_util_period = m["period"]

    kpis = {
        "critical_lines": critical,
        "high_lines": high,
        "overall_utilisation_pct": overall_util,                # theoretical: Σ production / Σ available
        "overall_plan_feasibility_pct": overall_feasibility,    # actionable: Σ min(prod, avail) / Σ production
        "total_gap_litres": total_gap,
        "lines_with_labour_shortfall": labour_shortfalls,
        "lines_with_no_data": no_data,
        "total_gap_hours": total_gap_hours,
        "peak_util_pct": peak_util_val,
        "peak_util_period": peak_util_period,
        # ABC filter info — visible on the dashboard as context for what's included
        "abc_excluded_sku_count": len(_abc_excluded_items),
        "abc_no_indicator_sku_count": len(_abc_no_indicator_items),
        "included_abc_indicators": sorted(included_abc),
    }

    # ── Resource type hourly rates (for scenario cost estimates) ───────────────
    cursor.execute("""
        SELECT resource_type_code, standard_hourly_rate
        FROM dbo.resource_types
        WHERE standard_hourly_rate IS NOT NULL
    """)
    resource_type_rates = {
        r.resource_type_code: float(r.standard_hourly_rate)
        for r in cursor.fetchall()
    }

    # Per-plant per-period working days = max of the plant's lines' working days.
    # Plant-shared roles cover the plant whenever ANY line is operating, so this
    # is the operating envelope for converting FTE planned to role-hours available.
    plant_period_working_days: dict[tuple, int] = {}
    plant_period_mins: dict[tuple, float] = {}
    for line_code, meta in lines_meta.items():
        plant_code = meta["plant_code"]
        line_mins = meta["available_mins_per_day"]
        for period in horizon_months:
            cal = line_period_days.get((line_code, period), {})
            wd = cal.get("working_days", 0)
            key = (plant_code, period)
            if wd > plant_period_working_days.get(key, 0):
                plant_period_working_days[key] = wd
                plant_period_mins[key] = line_mins

    # Build plant_support_requirements with per-period headcount data.
    # hc_planned_avg = EFFECTIVE figure (standard + prorated exceptions).
    # hc_planned_standard = the raw Sheet-2 value before adjustments.
    plant_support_out: dict[str, list] = {}
    for plant_code, roles in plant_support.items():
        role_list = []
        for role in roles:
            role_code_str = role["role_code"]
            monthly_hc = []
            for period in horizon_months:
                standard = _plant_hc_planned_avg(plant_code, role_code_str, period)
                adj = plant_role_adjustments.get((plant_code, role_code_str, period), 0.0)
                if standard is not None:
                    effective = round(max(0.0, standard + adj), 2)
                else:
                    effective = None
                shortfall = (
                    round(max(0.0, float(role["required"]) - effective), 2)
                    if effective is not None else None
                )
                exceptions_here = [
                    e for e in plant_exception_detail.get((plant_code, period), [])
                    if e["role"] == role_code_str
                ]
                wd = plant_period_working_days.get((plant_code, period), 0)
                monthly_hc.append({
                    "period": period,
                    "hc_planned_avg":      effective,
                    "hc_planned_standard": standard,
                    "hc_shortfall":        shortfall,
                    "hc_exceptions":       exceptions_here,
                    "working_days":        wd,
                })
            role_list.append({
                "role_code": role_code_str,
                "required": role["required"],
                "monthly": monthly_hc,
            })
        plant_support_out[plant_code] = role_list

    # ── Portfolio changes (metadata only) ───────────────────────────────────────
    # Demand for new launches flows through demand_plan + production_orders;
    # this file's role is to LABEL the change (what / when / line) so the UI
    # can mark launch months on the charts and list the events for governance.
    cursor.execute("""
        SELECT item_code, change_type, effective_date, description, impact_notes
        FROM dbo.portfolio_changes WHERE batch_id = ?
    """, batch_id)

    portfolio_changes_out = []
    for r in cursor.fetchall():
        eff = r.effective_date
        if hasattr(eff, "date"):
            eff = eff.date()
        portfolio_changes_out.append({
            "item_code": r.item_code,
            "change_type": r.change_type or "OTHER",
            "effective_date": str(eff) if eff else None,
            "effective_period": _period(eff) if eff else None,
            "description": r.description,
            "impact_notes": r.impact_notes,
            "line_code": item_primary_line.get(r.item_code),
        })

    _ct_order = {"NEW_LAUNCH": 0, "DISCONTINUE": 1}
    portfolio_changes_out.sort(key=lambda x: (_ct_order.get(x["change_type"], 2), x["effective_period"] or "9999-99"))

    return {
        "batch_id": batch_id,
        "plan_cycle_date": str(plan_cycle_date),
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "horizon_start": horizon_start,
        "horizon_months": horizon_months,
        "horizon_weeks": horizon_weeks,
        "kpis": kpis,
        "lines": lines_out,
        "unassigned_orders": unassigned_out,
        "portfolio_changes": portfolio_changes_out,        # introductions / phase-outs + capacity impact
        "plant_support_requirements": plant_support_out,  # plant_code → [{role_code, required, monthly}]
        "resource_type_rates": resource_type_rates,        # role_code → standard_hourly_rate
        "settings": {
            "cogs_opex_per_litre": cogs_per_litre,
        },
    }
