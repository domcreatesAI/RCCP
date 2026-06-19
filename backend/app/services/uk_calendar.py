"""
Shared UK working-calendar logic for the Line Capacity Calendar.

Single source of truth for:
  - UK bank holidays 2026–2030
  - the productive shift pattern (on-site hours minus 1h breaks)
  - building line_capacity_calendar rows (one per line per day)

Used by template_service (the Tmpl download) and scripts/generate_capacity_calendar.py.

Shift pattern (planned_hours = productive hours after breaks):
  Mon–Thu: 8.0h  (9.0h on site − 1h breaks)
  Fri:     5.5h  (6.5h on site − 1h breaks)
  Sat/Sun: 0 (non-working)
UK bank holidays: non-working (planned_hours = 0); labelled in downtime_reason.
downtime_hours + downtime_reason capture lost time that subtracts from the shift.
"""

from datetime import date, timedelta

# Productive hours by weekday (Mon=0 … Sun=6)
PLANNED_HOURS_BY_WEEKDAY = {
    0: 8.0,  # Monday    — 9.0h on site − 1h breaks
    1: 8.0,  # Tuesday
    2: 8.0,  # Wednesday
    3: 8.0,  # Thursday
    4: 5.5,  # Friday    — 6.5h on site − 1h breaks
    5: 0.0,  # Saturday
    6: 0.0,  # Sunday
}

UK_BANK_HOLIDAYS = {
    # 2026
    date(2026, 1, 1), date(2026, 4, 3), date(2026, 4, 6), date(2026, 5, 4),
    date(2026, 5, 25), date(2026, 8, 31), date(2026, 12, 25), date(2026, 12, 28),
    # 2027
    date(2027, 1, 1), date(2027, 3, 26), date(2027, 3, 29), date(2027, 5, 3),
    date(2027, 5, 31), date(2027, 8, 30), date(2027, 12, 27), date(2027, 12, 28),
    # 2028
    date(2028, 1, 3), date(2028, 4, 14), date(2028, 4, 17), date(2028, 5, 1),
    date(2028, 5, 29), date(2028, 8, 28), date(2028, 12, 25), date(2028, 12, 26),
    # 2029
    date(2029, 1, 1), date(2029, 3, 30), date(2029, 4, 2), date(2029, 5, 7),
    date(2029, 5, 28), date(2029, 8, 27), date(2029, 12, 25), date(2029, 12, 26),
    # 2030
    date(2030, 1, 1), date(2030, 4, 19), date(2030, 4, 22), date(2030, 5, 6),
    date(2030, 5, 27), date(2030, 8, 26), date(2030, 12, 25), date(2030, 12, 26),
}

DEFAULT_START = date(2026, 1, 1)
DEFAULT_END = date(2030, 12, 31)


def build_calendar_rows(lines: list[str], start: date = DEFAULT_START, end: date = DEFAULT_END) -> list[list]:
    """One row per line per day, in line_capacity_calendar column order:
       [line_code, calendar_date (DD/MM/YYYY), is_working_day, planned_hours,
        downtime_hours, downtime_reason].
    Weekends and UK bank holidays are non-working (planned_hours = 0); their
    downtime_reason carries a label (0 downtime, so it doesn't affect capacity).
    Planners add downtime_hours + a reason on days a line is lost to maintenance etc."""
    rows: list[list] = []
    current = start
    while current <= end:
        weekday = current.weekday()
        is_weekend = weekday >= 5
        is_bank_hol = current in UK_BANK_HOLIDAYS
        is_working = not is_weekend and not is_bank_hol
        planned_hours = PLANNED_HOURS_BY_WEEKDAY[weekday] if is_working else 0.0
        reason = "Bank holiday" if is_bank_hol else ("Weekend" if is_weekend else "")
        date_str = current.strftime("%d/%m/%Y")
        for line in lines:
            rows.append([
                line, date_str, 1 if is_working else 0, planned_hours, 0, reason,
            ])
        current += timedelta(days=1)
    return rows
