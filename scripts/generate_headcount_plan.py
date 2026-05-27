"""
Generate a pre-filled Headcount Plan Excel file for upload to RCCP One.

Covers 01/01/2026 – 31/12/2030.
One row per production line per working day (weekends and bank holidays = 0 headcount).

planned_headcount = LINE_OPERATOR + TEAM_LEADER per line (LINE-scoped roles only).
Plant-scoped resources (Robot Operators, Material Handlers, Forklift Drivers, Technician)
are tracked separately in plant_resource_requirements — they do not appear here.

Shift pattern mirrors the capacity calendar:
  Mon–Thu: working day (8.5h shift) → full headcount
  Fri:     working day (6.0h shift) → full headcount
  Sat/Sun: non-working               → planned_headcount = 0
  Bank hol: non-working              → planned_headcount = 0

Run from the repo root:
    python scripts/generate_headcount_plan.py
Output: uploads/headcount_plan_2026_2030.xlsx
"""

import os
from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

# ---------------------------------------------------------------------------
# Planned headcount per line: LINE_OPERATOR + TEAM_LEADER
# Lines with no Team Leader requirement simply have 0 TL (not a separate row)
# ---------------------------------------------------------------------------
LINE_HEADCOUNT = {
    # Plant 1
    "A101": 3,   # 2 operators + 1 TL
    "A102": 3,   # 2 operators + 1 TL
    "A103": 3,   # 2 operators + 1 TL
    # Plant 2
    "A201": 1,   # 1 operator
    "A202": 1,   # 1 operator
    # Plant 3
    "A302": 1,   # 1 operator
    "A303": 4,   # 3 operators + 1 TL
    "A304": 3,   # 2 operators + 1 TL
    "A305": 3,   # 2 operators + 1 TL
    "A307": 1,   # 1 operator
    "A308": 1,   # 1 operator
    # Plant 4
    "A401": 4,   # 3 operators + 1 TL
    # Plant 5
    "A501": 2,   # 2 operators
    "A502": 2,   # 2 operators
}

LINES = [
    "A101", "A102", "A103",
    "A201", "A202",
    "A302", "A303", "A304", "A305", "A307", "A308",
    "A401",
    "A501", "A502",
]

# ---------------------------------------------------------------------------
# UK Bank Holidays 2026–2030
# ---------------------------------------------------------------------------
UK_BANK_HOLIDAYS = {
    date(2026,  1,  1), date(2026,  4,  3), date(2026,  4,  6),
    date(2026,  5,  4), date(2026,  5, 25), date(2026,  8, 31),
    date(2026, 12, 25), date(2026, 12, 28),

    date(2027,  1,  1), date(2027,  3, 26), date(2027,  3, 29),
    date(2027,  5,  3), date(2027,  5, 31), date(2027,  8, 30),
    date(2027, 12, 27), date(2027, 12, 28),

    date(2028,  1,  3), date(2028,  4, 14), date(2028,  4, 17),
    date(2028,  5,  1), date(2028,  5, 29), date(2028,  8, 28),
    date(2028, 12, 25), date(2028, 12, 26),

    date(2029,  1,  1), date(2029,  3, 30), date(2029,  4,  2),
    date(2029,  5,  7), date(2029,  5, 28), date(2029,  8, 27),
    date(2029, 12, 25), date(2029, 12, 26),

    date(2030,  1,  1), date(2030,  4, 19), date(2030,  4, 22),
    date(2030,  5,  6), date(2030,  5, 27), date(2030,  8, 26),
    date(2030, 12, 25), date(2030, 12, 26),
}

# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
_HEADER_FILL = PatternFill("solid", fgColor="1E3A5F")
_HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
_DESC_FILL   = PatternFill("solid", fgColor="FFE066")
_DESC_FONT   = Font(color="7A5700", italic=True, size=9)
_BH_FILL     = PatternFill("solid", fgColor="FFF3CD")
_WE_FILL     = PatternFill("solid", fgColor="F3F4F6")
_CENTER      = Alignment(horizontal="center", vertical="center")
_LEFT        = Alignment(horizontal="left",   vertical="center")

COLUMNS = [
    "line_code",
    "plan_date",
    "planned_headcount",
    "shift_code",
    "available_hours",
    "notes",
]

DESCRIPTIONS = [
    "Production line code (e.g. A101). Must match a line in the masterdata.",
    "Date in DD/MM/YYYY format (e.g. 01/03/2026).",
    "Number of operators planned for this line on this date. Required. Must be >= 0.",
    "Optional shift identifier. DAY = single shift.",
    "Total labour hours available (headcount x shift hours). Optional.",
    "Free text notes. Optional.",
]

COL_WIDTHS = {
    "line_code":         12,
    "plan_date":         16,
    "planned_headcount": 20,
    "shift_code":        14,
    "available_hours":   18,
    "notes":             28,
}

# Hours per working day by weekday (matches capacity calendar shift pattern)
SHIFT_HOURS = {
    0: 8.5,  # Monday
    1: 8.5,  # Tuesday
    2: 8.5,  # Wednesday
    3: 8.5,  # Thursday
    4: 6.0,  # Friday
}


def generate() -> None:
    start = date(2026, 1, 1)
    end   = date(2030, 12, 31)

    wb = Workbook()
    ws = wb.active
    ws.title = "Data"

    # Row 1: field descriptions
    for col_idx, desc in enumerate(DESCRIPTIONS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=desc)
        cell.font      = _DESC_FONT
        cell.fill      = _DESC_FILL
        cell.alignment = _LEFT

    # Row 2: column keys
    for col_idx, col in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=2, column=col_idx, value=col)
        cell.font      = _HEADER_FONT
        cell.fill      = _HEADER_FILL
        cell.alignment = _CENTER
        ws.column_dimensions[get_column_letter(col_idx)].width = COL_WIDTHS.get(col, 16)

    ws.freeze_panes = "A3"

    row_num = 3
    current = start
    while current <= end:
        weekday    = current.weekday()
        is_weekend = weekday >= 5
        is_bank_hol = current in UK_BANK_HOLIDAYS
        is_working  = not is_weekend and not is_bank_hol

        if is_bank_hol:
            notes = "Bank holiday"
        elif is_weekend:
            notes = "Weekend"
        else:
            notes = ""

        shift_hours = SHIFT_HOURS.get(weekday, 0.0)

        for line in LINES:
            headcount  = LINE_HEADCOUNT[line] if is_working else 0
            avail_hrs  = round(headcount * shift_hours, 1) if is_working else 0.0

            ws.cell(row=row_num, column=1, value=line)
            ws.cell(row=row_num, column=2, value=current.strftime("%d/%m/%Y"))
            ws.cell(row=row_num, column=3, value=headcount)
            ws.cell(row=row_num, column=4, value="DAY" if is_working else "")
            ws.cell(row=row_num, column=5, value=avail_hrs)
            ws.cell(row=row_num, column=6, value=notes)

            if is_bank_hol:
                for c in range(1, 7):
                    ws.cell(row=row_num, column=c).fill = _BH_FILL
            elif is_weekend:
                for c in range(1, 7):
                    ws.cell(row=row_num, column=c).fill = _WE_FILL

            row_num += 1

        current += timedelta(days=1)

    # Info sheet
    ws2 = wb.create_sheet("Info")
    ws2.column_dimensions["A"].width = 70
    info = [
        "RCCP One — Headcount Plan 2026–2030",
        "",
        f"Generated: {date.today().strftime('%d/%m/%Y')}",
        f"Lines: {len(LINES)}",
        f"Date range: 01/01/2026 – 31/12/2030",
        f"Total rows: {row_num - 3:,}",
        "",
        "planned_headcount = LINE_OPERATOR + TEAM_LEADER per line.",
        "Plant-scoped resources (Robot Operators, Material Handlers,",
        "Forklift Drivers, Technician) are NOT in this file — they are",
        "managed via plant_resource_requirements masterdata.",
        "",
        "Headcount per line:",
    ]
    for line in LINES:
        info.append(f"  {line}: {LINE_HEADCOUNT[line]}")
    info += [
        "",
        "Shift pattern: Mon–Thu 8.5h | Fri 6.0h | Sat–Sun non-working",
        "available_hours = planned_headcount x shift_hours",
        "",
        "BEFORE UPLOADING — review and adjust:",
        "  - Planned headcount for lines with different staffing",
        "  - Any planned leave / reduced manning periods",
        "  - Factory shutdown weeks (set planned_headcount = 0)",
    ]
    for i, line in enumerate(info, start=1):
        cell = ws2.cell(row=i, column=1, value=line)
        cell.font      = Font(bold=(i == 1), size=12 if i == 1 else 10)
        cell.alignment = _LEFT

    out_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "headcount_plan_2026_2030.xlsx")

    wb.save(out_path)
    print(f"Saved: {os.path.abspath(out_path)}")
    print(f"Rows:  {row_num - 3:,}  ({len(LINES)} lines x {(end - start).days + 1} days)")
    print()
    print("Headcount per line (LINE_OPERATOR + TEAM_LEADER):")
    for line in LINES:
        print(f"  {line}: {LINE_HEADCOUNT[line]}")


if __name__ == "__main__":
    generate()
