"""
Generate a pre-filled Line Capacity Calendar Excel file for upload to RCCP One.

Covers 01/01/2026 – 31/12/2030.
One row per production line per day (14 lines × ~1826 days = ~25,564 rows).

Non-working days:
  - Saturdays and Sundays → is_working_day = 0, planned_hours = 0
  - UK bank holidays      → is_working_day = 0, planned_hours = 0,
                            public_holiday_hours = 7.0

Working days: is_working_day = 1, planned_hours = 7.0

Run from the repo root:
    python scripts/generate_capacity_calendar.py
Output: uploads/capacity_calendar_2026_2030.xlsx
"""

import os
from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

# ---------------------------------------------------------------------------
# Production lines (all 14 active lines)
# ---------------------------------------------------------------------------
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
    # 2026
    date(2026,  1,  1),  # New Year's Day
    date(2026,  4,  3),  # Good Friday
    date(2026,  4,  6),  # Easter Monday
    date(2026,  5,  4),  # Early May Bank Holiday
    date(2026,  5, 25),  # Spring Bank Holiday
    date(2026,  8, 31),  # Summer Bank Holiday
    date(2026, 12, 25),  # Christmas Day
    date(2026, 12, 28),  # Boxing Day (substitute — 26 Dec is Saturday)

    # 2027
    date(2027,  1,  1),  # New Year's Day
    date(2027,  3, 26),  # Good Friday
    date(2027,  3, 29),  # Easter Monday
    date(2027,  5,  3),  # Early May Bank Holiday
    date(2027,  5, 31),  # Spring Bank Holiday
    date(2027,  8, 30),  # Summer Bank Holiday
    date(2027, 12, 27),  # Christmas Day (substitute — 25 Dec is Saturday)
    date(2027, 12, 28),  # Boxing Day (substitute — 26 Dec is Sunday)

    # 2028
    date(2028,  1,  3),  # New Year's Day (substitute — 1 Jan is Saturday)
    date(2028,  4, 14),  # Good Friday
    date(2028,  4, 17),  # Easter Monday
    date(2028,  5,  1),  # Early May Bank Holiday (1 May is Monday)
    date(2028,  5, 29),  # Spring Bank Holiday
    date(2028,  8, 28),  # Summer Bank Holiday
    date(2028, 12, 25),  # Christmas Day
    date(2028, 12, 26),  # Boxing Day

    # 2029
    date(2029,  1,  1),  # New Year's Day
    date(2029,  3, 30),  # Good Friday
    date(2029,  4,  2),  # Easter Monday
    date(2029,  5,  7),  # Early May Bank Holiday
    date(2029,  5, 28),  # Spring Bank Holiday
    date(2029,  8, 27),  # Summer Bank Holiday
    date(2029, 12, 25),  # Christmas Day
    date(2029, 12, 26),  # Boxing Day

    # 2030
    date(2030,  1,  1),  # New Year's Day
    date(2030,  4, 19),  # Good Friday
    date(2030,  4, 22),  # Easter Monday
    date(2030,  5,  6),  # Early May Bank Holiday
    date(2030,  5, 27),  # Spring Bank Holiday
    date(2030,  8, 26),  # Summer Bank Holiday
    date(2030, 12, 25),  # Christmas Day
    date(2030, 12, 26),  # Boxing Day
}

# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
_HEADER_FILL = PatternFill("solid", fgColor="1E3A5F")
_HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
_DESC_FILL   = PatternFill("solid", fgColor="FFE066")   # amber — row 1 descriptions
_DESC_FONT   = Font(color="7A5700", italic=True, size=9)
_BH_FILL     = PatternFill("solid", fgColor="FFF3CD")   # amber tint for bank holidays
_WE_FILL     = PatternFill("solid", fgColor="F3F4F6")   # light grey for weekends
_CENTER      = Alignment(horizontal="center", vertical="center")
_LEFT        = Alignment(horizontal="left",   vertical="center")

COLUMNS = [
    "line_code",
    "calendar_date",
    "is_working_day",
    "planned_hours",
    "maintenance_hours",
    "public_holiday_hours",
    "planned_downtime_hours",
    "other_loss_hours",
    "notes",
]

# Row 1 descriptions (validator ignores row 1 — leave in file for reference)
DESCRIPTIONS = [
    "Production line code (e.g. A101). Must match a line in the masterdata.",
    "Date in DD/MM/YYYY format.",
    "1 = working day, 0 = non-working day (weekend, bank holiday).",
    "Total planned production hours (0–24). Review and adjust per line/shift pattern.",
    "Scheduled maintenance time (hours). Optional — leave 0 if none.",
    "Public holiday loss (hours). Optional.",
    "Other planned downtime (hours). Optional.",
    "Any other losses not covered above (hours). Optional.",
    "Free text notes. Optional.",
]

COL_WIDTHS = {
    "line_code":             12,
    "calendar_date":         16,
    "is_working_day":        16,
    "planned_hours":         16,
    "maintenance_hours":     20,
    "public_holiday_hours":  22,
    "planned_downtime_hours":24,
    "other_loss_hours":      18,
    "notes":                 28,
}


def generate() -> None:
    start = date(2026, 1, 1)
    end   = date(2030, 12, 31)

    wb = Workbook()
    ws = wb.active
    ws.title = "Data"

    # Row 1: field descriptions (amber — validator ignores this row entirely)
    for col_idx, desc in enumerate(DESCRIPTIONS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=desc)
        cell.font      = _DESC_FONT
        cell.fill      = _DESC_FILL
        cell.alignment = _LEFT

    # Row 2: column keys — what the validator reads
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
        is_weekend    = current.weekday() >= 5          # Sat=5, Sun=6
        is_bank_hol   = current in UK_BANK_HOLIDAYS
        is_working    = not is_weekend and not is_bank_hol

        for line in LINES:
            ws.cell(row=row_num, column=1, value=line)
            # Write date as DD/MM/YYYY string so the upload format matches
            ws.cell(row=row_num, column=2, value=current.strftime("%d/%m/%Y"))
            ws.cell(row=row_num, column=3, value=1 if is_working else 0)
            ws.cell(row=row_num, column=4, value=7.0 if is_working else 0.0)
            ws.cell(row=row_num, column=5, value=0)    # maintenance_hours
            ws.cell(row=row_num, column=6, value=7.0 if is_bank_hol else 0)  # public_holiday_hours
            ws.cell(row=row_num, column=7, value=0)    # planned_downtime_hours
            ws.cell(row=row_num, column=8, value=0)    # other_loss_hours

            notes = ""
            if is_bank_hol:
                notes = "Bank holiday"
            elif is_weekend:
                notes = "Weekend"
            ws.cell(row=row_num, column=9, value=notes)

            # Shade non-working rows for readability
            if is_bank_hol:
                for c in range(1, 10):
                    ws.cell(row=row_num, column=c).fill = _BH_FILL
            elif is_weekend:
                for c in range(1, 10):
                    ws.cell(row=row_num, column=c).fill = _WE_FILL

            row_num += 1

        current += timedelta(days=1)

    # Summary sheet
    ws2 = wb.create_sheet("Info")
    ws2.column_dimensions["A"].width = 60
    info = [
        "RCCP One — Line Capacity Calendar 2026–2030",
        "",
        f"Generated: {date.today().strftime('%d/%m/%Y')}",
        f"Lines: {len(LINES)}",
        f"Date range: 01/01/2026 – 31/12/2030",
        f"Total rows: {row_num - 3:,}",
        "",
        "Non-working day rules applied:",
        "  - Saturdays and Sundays → is_working_day=0, planned_hours=0",
        "  - UK bank holidays 2026–2030 → is_working_day=0, planned_hours=0,",
        "                                   public_holiday_hours=7.0",
        "",
        "Amber rows = UK bank holidays",
        "Grey rows  = weekends",
        "",
        "BEFORE UPLOADING — review and adjust:",
        "  - planned_hours for lines with shorter/longer shifts",
        "  - maintenance_hours for scheduled maintenance windows",
        "  - Any site-specific shutdowns (e.g. factory closure weeks)",
    ]
    for i, line in enumerate(info, start=1):
        cell = ws2.cell(row=i, column=1, value=line)
        if i == 1:
            cell.font = Font(bold=True, size=12)
        else:
            cell.font = Font(size=10)
        cell.alignment = _LEFT

    out_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "capacity_calendar_2026_2030.xlsx")

    wb.save(out_path)
    print(f"Saved: {os.path.abspath(out_path)}")
    print(f"Rows: {row_num - 3:,}  ({len(LINES)} lines × {(end - start).days + 1} days)")


if __name__ == "__main__":
    generate()
