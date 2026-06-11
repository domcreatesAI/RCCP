"""
Generate a pre-filled Headcount Plan workbook for upload to RCCP One.

Produces three sheets matching the in-app template:

  Sheet 1 — "Line Headcount"   monthly per line  (line_code, plan_month, planned_headcount, notes)
  Sheet 2 — "Plant Support"    monthly per plant role  (plant_code, resource_type_code, plan_month, planned_headcount)
  Sheet 3 — "Exceptions"       known absences  (line/plant, role, start, end, delta, reason)

Covers 01/2026 – 12/2030 (60 months).
planned_headcount on Sheet 1 = LINE_OPERATOR + TEAM_LEADER per line (combined).
Plant-shared roles (Forklift, Materials Handler, Robot Operator, Technician)
live on Sheet 2.

Run from the repo root:
    python scripts/generate_headcount_plan.py
Output: uploads/headcount_plan_2026_2030.xlsx
"""

import os
from datetime import date
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter


# ---------------------------------------------------------------------------
# Sheet 1 — Line headcount (LINE_OPERATOR + TEAM_LEADER combined per line)
# ---------------------------------------------------------------------------
LINE_HEADCOUNT = {
    # Plant 1
    "A101": 3,   # 2 operators + 1 TL
    "A102": 3,   # 2 operators + 1 TL
    "A103": 3,   # 2 operators + 1 TL
    # Plant 2
    "A201": 1,
    "A202": 1,
    # Plant 3
    "A302": 1,
    "A303": 4,   # 3 operators + 1 TL
    "A304": 3,   # 2 operators + 1 TL
    "A305": 3,   # 2 operators + 1 TL
    "A307": 1,
    "A308": 1,
    # Plant 4
    "A401": 4,   # 3 operators + 1 TL
    # Plant 5
    "A501": 2,
    "A502": 2,
}

LINES = list(LINE_HEADCOUNT.keys())


# ---------------------------------------------------------------------------
# Sheet 2 — Plant-shared headcount (forklift, material handler, robot op, technician)
# Adjust to match dbo.plant_resource_requirements; numbers below produce
# "ALL CLEAR" for each plant.
# ---------------------------------------------------------------------------
PLANT_SUPPORT_HEADCOUNT: dict[str, dict[str, int]] = {
    "Plant 1": {
        "FORKLIFT_DRIVER":  2,
        "MATERIAL_HANDLER": 2,
        "ROBOT_OPERATOR":   1,
        "TECHNICIAN":       1,
    },
    # Plant 2 has no plant-shared role requirements at present.
    "Plant 3": {
        "ROBOT_OPERATOR":   4,
    },
    "Plant 4": {
        "ROBOT_OPERATOR":   1,
    },
    # Plant 5 has no plant-shared role requirements at present.
}


# ---------------------------------------------------------------------------
# Sheet 3 — Sample exceptions (clearly flagged as samples)
# Leave the file empty if you don't want any pre-populated rows.
# ---------------------------------------------------------------------------
SAMPLE_EXCEPTIONS = [
    # line/plant         role               start         end           delta  reason
    ("A101", "",         "",                "15/05/2026", "19/05/2026", -1,    "Annual leave (sample — remove if not real)"),
    ("",     "Plant 1",  "FORKLIFT_DRIVER", "01/06/2026", "12/06/2026", -1,    "Long-term sick (sample — remove if not real)"),
]


# ---------------------------------------------------------------------------
# Date range — 60 months from Jan 2026 through Dec 2030 inclusive
# ---------------------------------------------------------------------------
START_YEAR, START_MONTH = 2026, 1
END_YEAR,   END_MONTH   = 2030, 12


def months_in_range() -> list[date]:
    out = []
    y, m = START_YEAR, START_MONTH
    while (y, m) <= (END_YEAR, END_MONTH):
        out.append(date(y, m, 1))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
_HEADER_FILL = PatternFill("solid", fgColor="1E3A5F")
_HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
_DESC_FILL   = PatternFill("solid", fgColor="FFE066")
_DESC_FONT   = Font(color="7A5700", italic=True, size=9)
_CENTER      = Alignment(horizontal="center", vertical="center")
_LEFT        = Alignment(horizontal="left",   vertical="center")


def _write_sheet(
    wb: Workbook,
    sheet_name: str,
    is_first: bool,
    columns: list[tuple[str, str, int]],   # (key, description, col_width)
    rows: list[list],
) -> None:
    """Write a sheet with row 1 = descriptions (amber), row 2 = column keys, data from row 3."""
    ws = wb.active if is_first else wb.create_sheet(sheet_name)
    ws.title = sheet_name

    # Row 1: descriptions
    for col_idx, (_key, desc, _width) in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=col_idx, value=desc)
        cell.font = _DESC_FONT
        cell.fill = _DESC_FILL
        cell.alignment = _LEFT

    # Row 2: column keys
    for col_idx, (key, _desc, width) in enumerate(columns, start=1):
        cell = ws.cell(row=2, column=col_idx, value=key)
        cell.font = _HEADER_FONT
        cell.fill = _HEADER_FILL
        cell.alignment = _CENTER
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    # Data rows
    for row_offset, row in enumerate(rows, start=3):
        for col_idx, val in enumerate(row, start=1):
            ws.cell(row=row_offset, column=col_idx, value=val)

    ws.freeze_panes = "A3"


def generate() -> None:
    months = months_in_range()
    wb = Workbook()

    # ── Sheet 1 — Line headcount ─────────────────────────────────────────
    line_cols = [
        ("line_code",         "Production line code (e.g. A101). Must match a line in the masterdata.",                                                       12),
        ("plan_month",        "1st of the month in DD/MM/YYYY (e.g. 01/05/2026).",                                                                            16),
        ("planned_headcount", "Total operators available for this line that month (LINE_OPERATOR + TEAM_LEADER combined). Required. >= 0.",                  20),
        ("notes",             "Free text notes (e.g. '2 leavers in June'). Optional.",                                                                        32),
    ]
    line_rows = []
    for m in months:
        for lc in LINES:
            line_rows.append([
                lc,
                m.strftime("%d/%m/%Y"),
                LINE_HEADCOUNT[lc],
                "",
            ])
    _write_sheet(wb, "Line Headcount", is_first=True, columns=line_cols, rows=line_rows)

    # ── Sheet 2 — Plant Support ──────────────────────────────────────────
    plant_cols = [
        ("plant_code",         "Plant code matching masterdata (e.g. P1, P2).",                                       14),
        ("resource_type_code", "Resource type code from masterdata (e.g. Forklift_Driver, Materials_Handler).",        24),
        ("plan_month",         "1st of the month in DD/MM/YYYY (e.g. 01/05/2026).",                                    16),
        ("planned_headcount",  "Number of staff planned for this plant-level role that month. >= 0.",                  20),
    ]
    plant_rows = []
    for plant_code, roles in PLANT_SUPPORT_HEADCOUNT.items():
        for role_code, headcount in roles.items():
            for m in months:
                plant_rows.append([
                    plant_code,
                    role_code,
                    m.strftime("%d/%m/%Y"),
                    headcount,
                ])
    _write_sheet(wb, "Plant Support", is_first=False, columns=plant_cols, rows=plant_rows)

    # ── Sheet 3 — Exceptions ─────────────────────────────────────────────
    exc_cols = [
        ("line_code",          "Production line code (e.g. A101). Required for line-role exceptions; leave blank for plant-shared.", 12),
        ("plant_code",         "Plant code (e.g. P1). Required for plant-shared role exceptions; leave blank for line.",             12),
        ("resource_type_code", "Required for PLANT rows. Optional for LINE rows — blank = applied to all line roles proportionally.", 24),
        ("start_date",         "First affected date in DD/MM/YYYY.",                                                                  14),
        ("end_date",           "Last affected date in DD/MM/YYYY (inclusive). Same as start for a one-day event.",                    14),
        ("delta_headcount",    "Change vs the standard headcount during the date range. Negative for absences (e.g. -1 = one person out).", 18),
        ("reason",             "Free text: annual leave, sickness, training, etc. Surfaces on the People Fit panel.",                 32),
    ]
    _write_sheet(wb, "Exceptions", is_first=False, columns=exc_cols, rows=SAMPLE_EXCEPTIONS)

    # ── Info sheet ───────────────────────────────────────────────────────
    ws_info = wb.create_sheet("Info")
    ws_info.column_dimensions["A"].width = 78
    info_lines = [
        ("RCCP One — Headcount Plan 2026–2030", Font(bold=True, size=13)),
        ("", None),
        (f"Generated: {date.today().strftime('%d/%m/%Y')}", Font(size=10)),
        (f"Lines: {len(LINES)}", Font(size=10)),
        (f"Plants with shared crew: {len(PLANT_SUPPORT_HEADCOUNT)}", Font(size=10)),
        (f"Date range: 01/{START_MONTH:02d}/{START_YEAR} – 12/{END_MONTH:02d}/{END_YEAR}  ({len(months)} months)", Font(size=10)),
        (f"Line Headcount rows: {len(line_rows):,}", Font(size=10)),
        (f"Plant Support rows: {len(plant_rows):,}", Font(size=10)),
        (f"Exception sample rows: {len(SAMPLE_EXCEPTIONS)}", Font(size=10)),
        ("", None),
        ("HOW THIS FILE WORKS", Font(bold=True, size=11)),
        ("• Sheet 1 — one row per line per month. planned_headcount is the standard staffing for that line "
         "(LINE_OPERATOR + TEAM_LEADER combined; the engine splits them per masterdata).", Font(size=10)),
        ("• Sheet 2 — one row per plant × shared-role × month. Forklift drivers, materials handlers, robot ops, technicians.", Font(size=10)),
        ("• Sheet 3 — known absences vs the standard. The engine prorates each event into the affected month(s). "
         "Two sample rows are included — REMOVE OR REPLACE BEFORE UPLOADING IF NOT REAL.", Font(size=10)),
        ("", None),
        ("Per-line headcount (Sheet 1):", Font(bold=True, size=10)),
        *[(f"  {lc}: {LINE_HEADCOUNT[lc]}", Font(size=10)) for lc in LINES],
        ("", None),
        ("Per-plant shared crew (Sheet 2):", Font(bold=True, size=10)),
        *[(f"  {pc} · {rc}: {hc}", Font(size=10))
          for pc, roles in PLANT_SUPPORT_HEADCOUNT.items()
          for rc, hc in roles.items()],
        ("", None),
        ("BEFORE UPLOADING", Font(bold=True, size=11)),
        ("• Confirm the standard headcount figures with Manufacturing.", Font(size=10)),
        ("• Update Sheet 3 with this cycle's known absences (annual leave, sickness, training, etc.) "
         "and remove the sample rows.", Font(size=10)),
        ("• Bank holidays do NOT need an exception row — line_capacity_calendar already shuts the line that day.", Font(size=10)),
    ]
    for i, (text, font) in enumerate(info_lines, start=1):
        cell = ws_info.cell(row=i, column=1, value=text)
        if font is not None:
            cell.font = font
        cell.alignment = _LEFT

    # ── Save ─────────────────────────────────────────────────────────────
    out_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "headcount_plan_2026_2030.xlsx")
    wb.save(out_path)

    print(f"Saved: {os.path.abspath(out_path)}")
    print(f"  Sheet 1 (Line Headcount): {len(line_rows):,} rows  ({len(LINES)} lines × {len(months)} months)")
    print(f"  Sheet 2 (Plant Support):  {len(plant_rows):,} rows")
    print(f"  Sheet 3 (Exceptions):     {len(SAMPLE_EXCEPTIONS)} sample rows (replace before uploading)")


if __name__ == "__main__":
    generate()
