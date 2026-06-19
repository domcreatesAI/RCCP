"""
Standardised reason codes — single source of truth for downtime and absence
reasons. Used by the template (dropdowns) and validation (soft check). Free-text
is still accepted at upload; an off-list value raises a WARNING, never a block.
Add a standard reason by editing the lists below.
"""

# Why a line lost available time (line_capacity_calendar.downtime_reason)
CAPACITY_DOWNTIME_REASONS = [
    "Breakdown",
    "Maintenance",
    "Stock check",
    "Planned shutdown",
]

# Why planned headcount is reduced (headcount_exceptions.reason)
HEADCOUNT_ABSENCE_REASONS = [
    "Annual leave",
    "Sickness",
    "Training",
]


def is_known_reason(value, allowed: list[str]) -> bool:
    """Case-insensitive membership test; blank counts as known (handled elsewhere)."""
    if value is None:
        return True
    s = str(value).strip()
    if s == "":
        return True
    return s.casefold() in {r.casefold() for r in allowed}
