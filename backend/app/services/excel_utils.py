"""
Shared Excel parsing and type validation helpers.

Used by validation_service, masterdata_service, and publish_service.
"""

import re
from datetime import date, datetime
from decimal import Decimal


def _strip_qty_suffix(s: str) -> str:
    """Strip trailing SAP unit suffix from a quantity string, e.g. '1200 EA' → '1200'."""
    return re.sub(r'\s+[A-Za-z]+$', '', s.strip())


def find_header_row(ws, required_cols: list[str], candidates: tuple = (1, 2, 3)) -> int:
    """Scan candidate rows and return the one that contains the most required column names.
    Used when the exact header row position is uncertain (e.g. SAP exports that may or
    may not include a title / filter row before the column headers)."""
    req = set(required_cols)
    best_row, best_score = candidates[0], -1
    for row_num in candidates:
        hdrs = {
            str(cell.value).strip().lower().replace(" ", "_")
            for cell in next(ws.iter_rows(min_row=row_num, max_row=row_num), [])
            if cell.value is not None
        }
        score = len(req & hdrs)
        if score > best_score:
            best_score, best_row = score, row_num
    return best_row


def get_headers(ws, header_row: int = 1) -> list[str]:
    """Read the header row and return normalised column names (lower, underscored).
    Duplicate names get a numeric suffix: _2, _3, etc. (handles SAP exports that
    repeat a column header, e.g. master_stock has two 'Material' columns)."""
    headers = []
    seen: dict[str, int] = {}
    for cell in next(ws.iter_rows(min_row=header_row, max_row=header_row), []):
        val = cell.value
        if val is not None:
            name = str(val).strip().lower().replace(" ", "_").replace("-", "-")
            count = seen.get(name, 0) + 1
            seen[name] = count
            headers.append(name if count == 1 else f"{name}_{count}")
    return headers


def get_data_rows(ws, headers: list[str], start_row: int = 2) -> list[tuple[int, dict]]:
    """Return [(excel_row_num, {col: val}), ...] skipping blank rows."""
    rows = []
    # iter_rows yields contiguous rows from start_row, so the row number is
    # start_row + offset. (Don't read cell.row — in read-only mode an empty
    # leading cell is an EmptyCell with no .row attribute.)
    for offset, excel_row in enumerate(ws.iter_rows(min_row=start_row)):
        vals = [cell.value for cell in excel_row]
        if all(v is None or (isinstance(v, str) and v.strip() == "") for v in vals):
            continue
        row_num = start_row + offset
        row_dict = {headers[i]: vals[i] for i in range(min(len(headers), len(vals)))}
        rows.append((row_num, row_dict))
    return rows


def to_date(val) -> date | None:
    """Convert various representations to a Python date, or None if unparseable."""
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    if val is None:
        return None
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def is_valid_date(val) -> bool:
    if isinstance(val, (date, datetime)):
        return True
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            datetime.strptime(s, fmt)
            return True
        except ValueError:
            continue
    return False


def is_valid_decimal(val) -> bool:
    if isinstance(val, (int, float, Decimal)):
        return True
    try:
        float(_strip_qty_suffix(str(val)))
        return True
    except (ValueError, TypeError):
        return False


def is_valid_bit(val) -> bool:
    if isinstance(val, bool):
        return True
    if isinstance(val, int) and val in (0, 1):
        return True
    return str(val).strip().lower() in ("0", "1", "yes", "no", "true", "false", "y", "n")


def is_valid_int(val) -> bool:
    if isinstance(val, bool):
        return False  # booleans are ints in Python but not meaningful here
    if isinstance(val, int):
        return True
    try:
        f = float(str(val).strip())
        return f == int(f)
    except (ValueError, TypeError):
        return False


def to_bit(val, default: int = 1) -> int:
    """Coerce a value to 0 or 1."""
    if val is None or (isinstance(val, str) and val.strip() == ""):
        return default
    if isinstance(val, bool):
        return 1 if val else 0
    try:
        return 1 if int(float(str(val))) else 0
    except (ValueError, TypeError):
        return default


def to_decimal(val) -> float | None:
    """Coerce to float, None if empty. Strips trailing unit suffix (e.g. '1200 EA' → 1200.0)."""
    if val is None or (isinstance(val, str) and val.strip() == ""):
        return None
    try:
        s = _strip_qty_suffix(str(val)) if isinstance(val, str) else str(val)
        return float(s)
    except (ValueError, TypeError):
        return None
