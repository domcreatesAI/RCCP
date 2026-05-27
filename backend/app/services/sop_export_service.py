"""
Build the S&OP verification workbook from RCCP engine output.

Produces the same Excel shown/downloadable from the Executive Summary so the
on-screen figures can be cross-checked against a flat table:
  - filled volume   = actual production (MB51), summed over the 3 months before cycle
  - volume planned  = MRP proposals (LA orders),  forward horizon
  - volume firmed   = firm orders (YPAC),          forward horizon
  - capacity        = available litres @ OEE,      forward horizon
  - s&op forecast   = demand_plan (S&OP),          forward horizon

Two sheets: "Per Line" (totals over the forward horizon) and "Monthly Detail"
(one row per line x month, window-agnostic).

Used by both the API endpoint (in-memory) and scripts/export_sop_verification.py (to disk).
"""

from __future__ import annotations

from datetime import datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# ─── Moove brand ────────────────────────────────────────────────────────────────
NAVY = "0C3C5D"
LIME_TINT = "F0F7CC"
WHITE = "FFFFFF"
INK = "0F1A24"

LINE_ORDER = ["A101", "A102", "A103", "A201", "A202", "A302", "A303",
              "A304", "A305", "A307", "A308", "A401", "A501", "A502"]

# Lines hidden from the dashboards — excluded here too so the workbook reconciles
# with what users see. Mirrors HIDDEN_LINE_CODES in frontend/src/components/rccp/brand.ts.
HIDDEN_LINES = {"A501", "A502"}

THIN = Side(style="thin", color="E2E6EA")
BORDER = Border(bottom=THIN)


def _add_months(yyyy_mm: str, n: int) -> str:
    y, m = int(yyyy_mm[:4]), int(yyyy_mm[5:7])
    m += n
    while m > 12:
        m -= 12
        y += 1
    while m < 1:
        m += 12
        y -= 1
    return f"{y:04d}-{m:02d}"


def _line_sort_key(code: str) -> tuple:
    return (LINE_ORDER.index(code) if code in LINE_ORDER else 999, code)


# ─── Public API ─────────────────────────────────────────────────────────────────
def build_verification_workbook(dash: dict, horizon_months: int = 12) -> Workbook:
    """Build the verification workbook from a compute_dashboard() result."""
    cycle_period = dash["plan_cycle_date"][:7]                       # 'YYYY-MM'
    forward_periods = {_add_months(cycle_period, i) for i in range(horizon_months)}
    # Dashboard charts show actuals for the 3 months before the plan cycle.
    past_periods = {_add_months(cycle_period, -i) for i in (1, 2, 3)}

    lines = sorted(
        (l for l in dash["lines"] if l["line_code"] not in HIDDEN_LINES),
        key=lambda l: _line_sort_key(l["line_code"]),
    )

    summary_rows: list[dict] = []
    detail_rows: list[dict] = []
    for l in lines:
        filled = planned = firmed = capacity = sop = 0.0
        for m in l["monthly"]:
            p = m["period"]
            is_forward = p in forward_periods
            is_past = p in past_periods

            if is_forward:
                window = "forward"
            elif is_past:
                window = "past"            # one of the 3 months shown on the chart
            elif p < cycle_period:
                window = "before"          # older history (not on chart)
            else:
                window = "later"           # beyond the forward horizon
            detail_rows.append({
                "line": l["line_code"],
                "plant": l["plant_code"],
                "period": p,
                "window": window,
                "filled": m.get("actual_litres"),
                "planned": m.get("planned_litres") or 0.0,
                "firmed": m.get("firm_litres") or 0.0,
                "capacity": m.get("available_litres"),
                "sop": m.get("demand_litres") or 0.0,
            })

            if is_past and m.get("actual_litres") is not None:
                filled += m["actual_litres"]
            if is_forward:
                planned += m.get("planned_litres") or 0.0
                firmed += m.get("firm_litres") or 0.0
                capacity += (m.get("available_litres") or 0.0)
                sop += m.get("demand_litres") or 0.0

        summary_rows.append({
            "line": l["line_code"], "plant": l["plant_code"],
            "filled": filled, "planned": planned, "firmed": firmed,
            "capacity": capacity, "sop": sop,
        })

    wb = Workbook()
    _build_summary_sheet(wb.active, summary_rows, dash["batch_id"], cycle_period, horizon_months)
    _build_detail_sheet(wb.create_sheet("Monthly Detail"), detail_rows)
    return wb


def workbook_bytes(dash: dict, horizon_months: int = 12) -> bytes:
    """Build the workbook and return it as .xlsx bytes (for streaming)."""
    buf = BytesIO()
    build_verification_workbook(dash, horizon_months).save(buf)
    return buf.getvalue()


# ─── Sheet builders ─────────────────────────────────────────────────────────────
def _num(cell, value, *, bold=False, color=INK):
    if value is None:
        cell.value = "—"
    else:
        cell.value = round(value)
        cell.number_format = "#,##0"
    cell.alignment = Alignment(horizontal="right")
    cell.font = Font(name="Calibri", size=11, bold=bold, color=color)


def _build_summary_sheet(ws, rows, batch_id, cycle_period, horizon_months):
    ws.title = "Per Line"
    ws.sheet_view.showGridLines = False

    ws["A1"] = "S&OP Verification — Capacity vs Volumes (litres)"
    ws["A1"].font = Font(name="Calibri", size=15, bold=True, color=NAVY)
    ws["A2"] = (f"Batch {batch_id}  ·  plan cycle {cycle_period}  ·  "
                f"filled = past actuals (MB51)  ·  planned/firmed/capacity/S&OP = forward {horizon_months}M  ·  "
                f"generated {datetime.now():%d %b %Y %H:%M}")
    ws["A2"].font = Font(name="Calibri", size=9, italic=True, color="6B7A8A")

    headers = ["Line", "Plant", "Filled volume", "Volume planned",
               "Volume firmed", "Capacity", "S&OP forecast"]
    header_row = 4
    for c, h in enumerate(headers, start=1):
        cell = ws.cell(row=header_row, column=c, value=h)
        cell.font = Font(name="Calibri", size=11, bold=True, color=WHITE)
        cell.fill = PatternFill("solid", fgColor=NAVY)
        cell.alignment = Alignment(horizontal="left" if c <= 2 else "right", vertical="center")
        cell.border = Border(bottom=Side(style="thin", color=NAVY))

    r = header_row + 1
    totals = {"filled": 0.0, "planned": 0.0, "firmed": 0.0, "capacity": 0.0, "sop": 0.0}
    for row in rows:
        ws.cell(row=r, column=1, value=row["line"]).font = Font(bold=True, color=NAVY, size=11)
        ws.cell(row=r, column=2, value=row["plant"]).font = Font(color=INK, size=11)
        _num(ws.cell(row=r, column=3), row["filled"])
        _num(ws.cell(row=r, column=4), row["planned"])
        _num(ws.cell(row=r, column=5), row["firmed"])
        _num(ws.cell(row=r, column=6), row["capacity"])
        _num(ws.cell(row=r, column=7), row["sop"])
        for c in range(1, 8):
            ws.cell(row=r, column=c).border = BORDER
        for k in totals:
            totals[k] += row[k]
        r += 1

    ws.cell(row=r, column=1, value="TOTAL").font = Font(bold=True, color=NAVY, size=11)
    ws.cell(row=r, column=2, value="")
    _num(ws.cell(row=r, column=3), totals["filled"], bold=True, color=NAVY)
    _num(ws.cell(row=r, column=4), totals["planned"], bold=True, color=NAVY)
    _num(ws.cell(row=r, column=5), totals["firmed"], bold=True, color=NAVY)
    _num(ws.cell(row=r, column=6), totals["capacity"], bold=True, color=NAVY)
    _num(ws.cell(row=r, column=7), totals["sop"], bold=True, color=NAVY)
    for c in range(1, 8):
        cell = ws.cell(row=r, column=c)
        cell.fill = PatternFill("solid", fgColor=LIME_TINT)
        cell.border = Border(top=Side(style="thin", color=NAVY))

    for i, w in enumerate([10, 10, 16, 16, 16, 16, 16], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A5"


def _build_detail_sheet(ws, rows):
    ws.sheet_view.showGridLines = False
    headers = ["Line", "Plant", "Period", "Window", "Filled volume",
               "Volume planned", "Volume firmed", "Capacity", "S&OP forecast"]
    for c, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=c, value=h)
        cell.font = Font(name="Calibri", size=11, bold=True, color=WHITE)
        cell.fill = PatternFill("solid", fgColor=NAVY)
        cell.alignment = Alignment(horizontal="left" if c <= 4 else "right", vertical="center")

    r = 2
    for row in rows:
        ws.cell(row=r, column=1, value=row["line"]).font = Font(bold=True, color=NAVY, size=10)
        ws.cell(row=r, column=2, value=row["plant"])
        ws.cell(row=r, column=3, value=row["period"])
        wcell = ws.cell(row=r, column=4, value=row["window"])
        if row["window"] == "forward":
            wcell.font = Font(color=NAVY, size=10, bold=True)
        elif row["window"] == "past":
            wcell.font = Font(color="7B9400", size=10, bold=True)
        else:
            wcell.font = Font(color="9CABB9", size=10)
        _num(ws.cell(row=r, column=5), row["filled"])
        _num(ws.cell(row=r, column=6), row["planned"])
        _num(ws.cell(row=r, column=7), row["firmed"])
        _num(ws.cell(row=r, column=8), row["capacity"])
        _num(ws.cell(row=r, column=9), row["sop"])
        for c in range(1, 10):
            ws.cell(row=r, column=c).border = BORDER
        r += 1

    for i, w in enumerate([10, 10, 12, 11, 16, 16, 16, 14, 16], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:I{r - 1}"
