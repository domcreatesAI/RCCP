"""
RCCP Engine — Phase 2 throughput-based capacity calculation.

Computes available litres vs required litres per line per month over a
12-month rolling horizon from the batch's earliest production order date.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, date
from typing import Any


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

def compute_dashboard(conn, batch_id: int) -> dict:
    cursor = conn.cursor()

    # ── 1. Verify batch is PUBLISHED ──────────────────────────────────────────
    cursor.execute(
        "SELECT batch_id, batch_name, status, plan_cycle_date FROM dbo.import_batches WHERE batch_id = ?",
        batch_id,
    )
    row = cursor.fetchone()
    if not row:
        raise ValueError(f"Batch {batch_id} not found")
    batch_status = row.status
    if batch_status != "PUBLISHED":
        raise ValueError(f"Batch {batch_id} is {batch_status}; RCCP requires a PUBLISHED batch")

    plan_cycle_date = row.plan_cycle_date
    if hasattr(plan_cycle_date, 'date'):
        plan_cycle_date = plan_cycle_date.date()

    # ── 2. Load capacity calendar ──────────────────────────────────────────────
    # vw_line_capacity_with_net provides net_theoretical_hours per line per day.
    # oee_target and available_mins_per_day are loaded separately in step 7 (lines_meta).
    cursor.execute("""
        SELECT line_code, calendar_date, is_working_day
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

    # ── 5. Load item pack sizes + primary line routing ────────────────────────
    # primary_line_code from sku_masterdata is the routing source of truth.
    # production_orders.production_line is metadata only — not used for calculations.
    cursor.execute("SELECT item_code, pack_size_l, primary_line_code FROM dbo.items")
    item_pack: dict[str, float] = {}
    item_primary_line: dict[str, str] = {}
    for r in cursor.fetchall():
        if r.pack_size_l is not None:
            item_pack[r.item_code] = float(r.pack_size_l)
        if r.primary_line_code is not None:
            item_primary_line[r.item_code] = r.primary_line_code

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
        routing_line = item_primary_line.get(r.item_code)
        if not routing_line:
            continue
        pack_l = item_pack.get(r.item_code, 0.0)
        litres = float(r.demand_qty) * pack_l
        line_period_demand[(routing_line, r.period)] += litres

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
            "oee_target": float(r.oee_target) if r.oee_target else 0.55,
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

    if order_dates:
        horizon_start_date = min(order_dates)
        horizon_start = _period(horizon_start_date)
    else:
        horizon_start_date = plan_cycle_date
        horizon_start = _period(plan_cycle_date)

    horizon_months = _months_range(horizon_start, 18)   # 18 months for full horizon
    horizon_weeks  = _weeks_range(horizon_start_date, 26)  # 26 weeks covers 4W/8W/12W views
    horizon_months_set = set(horizon_months)
    week_set = set(horizon_weeks)

    # ── 9. Build working-day calendar: line × period → {working_days, oee, mins} ──
    # OEE and available_mins come from lines_meta (loaded in step 7).
    line_period_days: dict[tuple, dict] = defaultdict(lambda: {"working_days": 0, "oee": 0.55, "mins": 420.0})
    line_week_days:   dict[tuple, dict] = defaultdict(lambda: {"working_days": 0, "oee": 0.55, "mins": 420.0})
    for r in capacity_rows:
        cal_date = r.calendar_date
        if hasattr(cal_date, 'date'):
            cal_date = cal_date.date()
        meta = lines_meta.get(r.line_code, {})
        p = _period(cal_date)
        if p in horizon_months_set:
            key = (r.line_code, p)
            if r.is_working_day:
                line_period_days[key]["working_days"] += 1
            line_period_days[key]["oee"] = meta.get("oee_target", 0.55)
            line_period_days[key]["mins"] = meta.get("available_mins_per_day", 420.0)
        ws = _week_str(cal_date)
        if ws in week_set:
            wkey = (r.line_code, ws)
            if r.is_working_day:
                line_week_days[wkey]["working_days"] += 1
            line_week_days[wkey]["oee"] = meta.get("oee_target", 0.55)
            line_week_days[wkey]["mins"] = meta.get("available_mins_per_day", 420.0)

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

    def _available(line_code: str, period: str) -> float | None:
        if line_code not in line_pack:
            return None
        key = (line_code, period)
        cal = line_period_days.get(key, {})
        working_days = cal.get("working_days", 0)
        oee = cal.get("oee", 0.55)
        mins = cal.get("mins", 420.0)
        if working_days == 0:
            return 0.0
        wlpm = line_period_weighted_lpm.get(key)
        if wlpm is None:
            return None
        return wlpm * oee * mins * working_days

    def _available_weekly(line_code: str, week: str) -> float | None:
        if line_code not in line_pack:
            return None
        key = (line_code, week)
        cal = line_week_days.get(key, {})
        working_days = cal.get("working_days", 0)
        oee = cal.get("oee", 0.55)
        mins = cal.get("mins", 420.0)
        if working_days == 0:
            return 0.0
        wlpm = line_week_weighted_lpm.get(key)
        if wlpm is None:
            return None
        return wlpm * oee * mins * working_days

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
    def _risk_status(util_pct: float | None, labour: str) -> str:
        if util_pct is None:
            return "No data"
        if util_pct > 100 or labour == "SHORTFALL":
            return "Critical"
        if util_pct > 90:
            return "High"
        if util_pct > 75:
            return "Watch"
        return "Stable"

    def _risk_score(util_pct: float | None, labour: str) -> int:
        if util_pct is None:
            return 0
        score = min(100, int(util_pct))
        if labour == "SHORTFALL":
            score = min(100, score + 15)
        return score

    def _primary_driver(util_pct: float | None, labour: str) -> str:
        if util_pct is None:
            return "NO_DATA"
        if util_pct > 100:
            return "CAPACITY"
        if labour == "SHORTFALL":
            return "LABOUR"
        if util_pct > 90:
            return "CAPACITY"
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
            wmins    = wcal.get("mins", 420.0)

            if wavail is not None and wavail > 0:
                wutil = round((wprod / wavail) * 100, 1)
                wgap  = round(wavail - wprod, 0)
            elif wavail == 0.0:
                wutil, wgap = 0.0, 0.0
            else:
                wutil, wgap = None, None

            wavail_h = round(wdays * woee * wmins / 60.0, 1) if wavail not in (None,) else (0.0 if wavail == 0.0 else None)
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

            # Hours: available_hours = working_days × oee × mins / 60
            oee_val  = cal.get("oee", 0.55)
            mins_val = cal.get("mins", 420.0)
            if avail is None:
                available_hours = None
            elif avail == 0.0:
                available_hours = 0.0
            else:
                available_hours = round(working_days * oee_val * mins_val / 60.0, 1)

            production_h = _to_hours(production, avail, available_hours)
            gap_hours = (
                round(available_hours - production_h, 1)
                if available_hours is not None and production_h is not None
                else None
            )

            monthly.append({
                "period": period,
                "working_days": working_days,
                # litres
                "available_litres": round(avail, 0) if avail is not None else None,
                "demand_litres": round(demand, 0),
                "firm_litres": round(firm, 0),
                "planned_litres": round(planned, 0),
                "production_litres": round(production, 0),
                "utilisation_pct": util_pct,
                "gap_litres": gap,
                "labour_status": labour,
                # hours
                "available_hours":  available_hours,
                "firm_hours":       _to_hours(firm,    avail, available_hours),
                "planned_hours":    _to_hours(planned, avail, available_hours),
                "production_hours": production_h,
                "demand_hours":     _to_hours(demand,  avail, available_hours),
                "gap_hours":        gap_hours,
                # headcount
                "hc_required":      hc_required.get(line_code),
                "hc_planned_avg":   _hc_planned_avg(line_code, period),
                "hc_shortfall":     _hc_shortfall(line_code, period),
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

        risk = _risk_status(peak_util, overall_labour)
        score = _risk_score(peak_util, overall_labour)
        driver = _primary_driver(peak_util, overall_labour)

        lines_out.append({
            "line_code": line_code,
            "line_name": f"Line {line_code}",
            "plant_code": meta["plant_code"],
            "pool_code": meta["pool_code"],
            "pool_max_concurrent": meta["pool_max_concurrent"],
            "risk_status": risk,
            "risk_score": score,
            "primary_driver": driver,
            "labour_status": overall_labour,
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
    labour_shortfalls = sum(1 for l in lines_out if l["labour_status"] == "SHORTFALL")
    no_data = sum(1 for l in lines_out if l["risk_status"] == "No data")

    peak_utils = [
        max((m["utilisation_pct"] for m in l["monthly"] if m["utilisation_pct"] is not None), default=None)
        for l in lines_out
    ]
    valid_peaks = [u for u in peak_utils if u is not None]
    overall_util = round(sum(valid_peaks) / len(valid_peaks), 1) if valid_peaks else None

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
        "overall_utilisation_pct": overall_util,
        "total_gap_litres": total_gap,
        "lines_with_labour_shortfall": labour_shortfalls,
        "lines_with_no_data": no_data,
        "total_gap_hours": total_gap_hours,
        "peak_util_pct": peak_util_val,
        "peak_util_period": peak_util_period,
    }

    # Build plant_support_requirements with per-period headcount data
    plant_support_out: dict[str, list] = {}
    for plant_code, roles in plant_support.items():
        role_list = []
        for role in roles:
            monthly_hc = []
            for period in horizon_months:
                avg = _plant_hc_planned_avg(plant_code, role["role_code"], period)
                shortfall = _plant_hc_shortfall(plant_code, role["role_code"], role["required"], period)
                monthly_hc.append({
                    "period": period,
                    "hc_planned_avg": avg,
                    "hc_shortfall": shortfall,
                })
            role_list.append({
                "role_code": role["role_code"],
                "required": role["required"],
                "monthly": monthly_hc,
            })
        plant_support_out[plant_code] = role_list

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
        "plant_support_requirements": plant_support_out,  # plant_code → [{role_code, required, monthly}]
    }
