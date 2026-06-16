"""
Generate a fully-staffed Headcount Plan workbook for upload to RCCP One.

Produces three sheets matching the in-app template:

  Sheet 1 — "Line Headcount"   monthly per line  (line_code, plan_month, planned_headcount, notes)
  Sheet 2 — "Plant Support"    monthly per plant role  (plant_code, resource_type_code, plan_month, planned_headcount)
  Sheet 3 — "Exceptions"       known absences (header only — no rows = no absences)

Covers 01/2026 – 12/2030 (60 months).

"100% staffed": planned_headcount is read LIVE from the requirement tables, so
planned == required everywhere and the People Fit panel reads ALL CLEAR:
  Sheet 1 planned_headcount = SUM(dbo.line_resource_requirements) per line
                              (LINE_OPERATOR + TEAM_LEADER + PALLETISING_OPERATOR)
  Sheet 2 planned_headcount = dbo.plant_resource_requirements per plant × role

No exception rows are written — a fully-staffed plan has no absences. Add this
cycle's real leave/sickness/training on Sheet 3 before uploading if needed.

Run from the repo root:
    python scripts/generate_headcount_plan.py
Output: uploads/headcount_plan_2026_2030.xlsx
"""

import os
import sys
from datetime import date
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

# Make the backend package importable so we can read live requirements from the DB.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.database import get_connection  # noqa: E402


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


def _num(v: float):
    """Whole numbers as int (3.0 -> 3); keep fractional (3.5)."""
    return int(v) if float(v).is_integer() else float(v)


def load_requirements():
    """Return (line_headcount: {line: total}, plant_support: [(plant, role, hc)])."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT line_code, SUM(headcount_required)
        FROM dbo.line_resource_requirements
        GROUP BY line_code
        ORDER BY line_code
        """
    )
    line_headcount = {str(r[0]).strip(): _num(r[1]) for r in cur.fetchall()}

    cur.execute(
        """
        SELECT plant_code, resource_type_code, headcount_required
        FROM dbo.plant_resource_requirements
        ORDER BY plant_code, resource_type_code
        """
    )
    plant_support = [(str(r[0]).strip(), str(r[1]).strip(), _num(r[2])) for r in cur.fetchall()]
    conn.close()
    return line_headcount, plant_support


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
_HEADER_FILL = PatternFill("solid", fgColor="1E3A5F")
_HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
_DESC_FILL   = PatternFill("solid", fgColor="FFE066")
_DESC_FONT   = Font(color="7A5700", italic=True, size=9)
_CENTER      = Alignment(horizontal="center", vertical="center")
_LEFT        = Alignment(horizontal="left",   vertical="center")


def _write_sheet(wb, sheet_name, is_first, columns, rows) -> None:
    """Row 1 = descriptions (amber), row 2 = column keys, data from row 3."""
    ws = wb.active if is_first else wb.create_sheet(sheet_name)
    ws.title = sheet_name

    for col_idx, (_key, desc, _width) in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=col_idx, value=desc)
        cell.font = _DESC_FONT
        cell.fill = _DESC_FILL
        cell.alignment = _LEFT

    for col_idx, (key, _desc, width) in enumerate(columns, start=1):
        cell = ws.cell(row=2, column=col_idx, value=key)
        cell.font = _HEADER_FONT
        cell.fill = _HEADER_FILL
        cell.alignment = _CENTER
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    for row_offset, row in enumerate(rows, start=3):
        for col_idx, val in enumerate(row, start=1):
            ws.cell(row=row_offset, column=col_idx, value=val)

    ws.freeze_panes = "A3"


def generate() -> None:
    months = months_in_range()
    line_headcount, plant_support = load_requirements()
    lines = list(line_headcount.keys())
    wb = Workbook()

    # ── Sheet 1 — Line headcount ─────────────────────────────────────────
    line_cols = [
        ("line_code",         "Production line code (e.g. A101). Must match a line in the masterdata.",                                       12),
        ("plan_month",        "1st of the month in DD/MM/YYYY (e.g. 01/05/2026).",                                                            16),
        ("planned_headcount", "Total people available for this line that month (LINE_OPERATOR + TEAM_LEADER + PALLETISING_OPERATOR). >= 0.", 20),
        ("notes",             "Free text notes (e.g. '2 leavers in June'). Optional.",                                                        32),
    ]
    line_rows = [
        [lc, m.strftime("%d/%m/%Y"), line_headcount[lc], ""]
        for m in months for lc in lines
    ]
    _write_sheet(wb, "Line Headcount", is_first=True, columns=line_cols, rows=line_rows)

    # ── Sheet 2 — Plant Support ──────────────────────────────────────────
    plant_cols = [
        ("plant_code",         "Plant code matching masterdata (e.g. 'Plant 1').",                          14),
        ("resource_type_code", "Plant-level role code (FORKLIFT_DRIVER, MATERIAL_HANDLER, ROBOT_OPERATOR, TECHNICIAN).", 24),
        ("plan_month",         "1st of the month in DD/MM/YYYY (e.g. 01/05/2026).",                         16),
        ("planned_headcount",  "Number of staff planned for this plant-level role that month. >= 0.",        20),
    ]
    plant_rows = [
        [pc, rc, m.strftime("%d/%m/%Y"), hc]
        for (pc, rc, hc) in plant_support for m in months
    ]
    _write_sheet(wb, "Plant Support", is_first=False, columns=plant_cols, rows=plant_rows)

    # ── Sheet 3 — Exceptions (header only; 100% staffed = no absences) ────
    exc_cols = [
        ("line_code",          "Production line code (e.g. A101). Required for line-role exceptions; leave blank for plant-shared.", 12),
        ("plant_code",         "Plant code (e.g. 'Plant 1'). Required for plant-shared role exceptions; leave blank for line.",      12),
        ("resource_type_code", "Required for PLANT rows. Optional for LINE rows — blank = applied to all line roles proportionally.", 24),
        ("start_date",         "First affected date in DD/MM/YYYY.",                                                                  14),
        ("end_date",           "Last affected date in DD/MM/YYYY (inclusive). Same as start for a one-day event.",                    14),
        ("delta_headcount",    "Change vs the standard headcount during the range. Negative for absences (e.g. -1 = one person out).", 18),
        ("reason",             "Free text: annual leave, sickness, training, etc. Surfaces on the People Fit panel.",                 32),
    ]
    _write_sheet(wb, "Exceptions", is_first=False, columns=exc_cols, rows=[])

    # ── Info sheet ───────────────────────────────────────────────────────
    ws_info = wb.create_sheet("Info")
    ws_info.column_dimensions["A"].width = 80
    info_lines = [
        ("RCCP One — Headcount Plan 2026–2030 (100% staffed)", Font(bold=True, size=13)),
        ("", None),
        (f"Generated: {date.today().strftime('%d/%m/%Y')}", Font(size=10)),
        (f"Lines: {len(lines)}", Font(size=10)),
        (f"Date range: 01/{START_MONTH:02d}/{START_YEAR} – 12/{END_MONTH:02d}/{END_YEAR}  ({len(months)} months)", Font(size=10)),
        (f"Line Headcount rows: {len(line_rows):,}", Font(size=10)),
        (f"Plant Support rows: {len(plant_rows):,}", Font(size=10)),
        ("Exception rows: 0  (fully staffed — no absences)", Font(size=10)),
        ("", None),
        ("planned_headcount is read live from the requirement tables, so planned == required", Font(size=10)),
        ("everywhere and the People Fit panel reads ALL CLEAR. Add this cycle's real", Font(size=10)),
        ("leave/sickness/training on the Exceptions sheet before uploading if needed.", Font(size=10)),
        ("", None),
        ("Per-line headcount (Sheet 1):", Font(bold=True, size=10)),
        *[(f"  {lc}: {line_headcount[lc]}", Font(size=10)) for lc in lines],
        ("", None),
        ("Per-plant shared crew (Sheet 2):", Font(bold=True, size=10)),
        *[(f"  {pc} · {rc}: {hc}", Font(size=10)) for (pc, rc, hc) in plant_support],
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
    print(f"  Sheet 1 (Line Headcount): {len(line_rows):,} rows  ({len(lines)} lines × {len(months)} months)")
    print(f"  Sheet 2 (Plant Support):  {len(plant_rows):,} rows")
    print(f"  Sheet 3 (Exceptions):     0 rows (fully staffed)")


if __name__ == "__main__":
    generate()
