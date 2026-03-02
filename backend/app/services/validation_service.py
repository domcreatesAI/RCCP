"""
7-stage validation pipeline for RCCP planning data files.

Stages:
  1. REQUIRED_FILE_CHECK        — batch-level: all 5 required files present?
  2. TEMPLATE_STRUCTURE_CHECK   — file opens as valid Excel with a header row
  3. FIELD_MAPPING_CHECK        — required columns present with correct names
  4. DATA_TYPE_CHECK            — correct types per column
  5. REFERENCE_CHECK            — FK values exist in masterdata tables
  6. BUSINESS_RULE_CHECK        — domain-specific business rules
  7. BATCH_READINESS            — overall batch can-publish status

master_stock: Uploadable template (row 1 = descriptions, row 2 = headers, row 3+ = data).
  Plain numbers — no SAP UoM suffix. 11 columns including MOQ and Item status.
  On PASS/WARNING, items.mrp_type, items.units_per_pallet, items.pack_size_l,
  items.moq and items.sku_status are updated (COALESCE — blank values keep existing).

demand_plan: wide-format SAP PIR export (material_id × month). Stages 3–6 fully implemented.
  Row 1 = descriptions (ignored), Row 2 = headers, Row 3+ = data.
  Fixed columns: material_id, plant (ignored: mrp_area, version, req_type, version_active, req_plan, req_seg, uom).
  Month columns: M{MM}.{YYYY} format (e.g. M03.2026). Non-UK plants must be filtered out before upload.

Template files (line_capacity_calendar, headcount_plan, portfolio_changes): all stages run fully.
"""

import re
from datetime import date, datetime
from decimal import Decimal

import openpyxl
import pyodbc

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REQUIRED_FILE_TYPES = frozenset({
    "master_stock",
    "demand_plan",
    "line_capacity_calendar",
    "headcount_plan",
    "portfolio_changes",
})

STAGE_NAMES = {
    1: "REQUIRED_FILE_CHECK",
    2: "TEMPLATE_STRUCTURE_CHECK",
    3: "FIELD_MAPPING_CHECK",
    4: "DATA_TYPE_CHECK",
    5: "REFERENCE_CHECK",
    6: "BUSINESS_RULE_CHECK",
    7: "BATCH_READINESS",
}

# ---------------------------------------------------------------------------
# File schemas
# ---------------------------------------------------------------------------
# Each template file has:
#   required  — columns that MUST be present (missing = BLOCKED)
#   optional  — columns that MAY be present (missing = WARNING)
#   types     — {col: type_spec}
#     type_spec: 'str' | 'date' | 'decimal' | 'bit' | ('enum', [values])
#   fk_checks — {col: (table, pk_col)} for reference checks
#   min_rows  — minimum data rows required (0 = empty file is valid)

# Matches normalized month column headers (after _get_headers lowercasing/underscore):
#   01/2026  01.2026  2026/01  2026.01  jan_2026  jan-2026  2026-01
_MONTH_HEADER_RE = re.compile(
    r'^('
    r'\d{2}[./]\d{4}'           # 01/2026 or 01.2026
    r'|\d{4}[./]\d{2}'          # 2026/01 or 2026.01
    r'|[a-z]{3}[_\-]\d{4}'     # jan_2026 or jan-2026
    r'|\d{4}-\d{2}'             # 2026-01
    r'|m\d{2}\.\d{4}'           # m03.2026 (SAP PIR format — normalised from M03.2026)
    r')$'
)


def _detect_month_columns(headers: list) -> list:
    return [h for h in headers if _MONTH_HEADER_RE.match(str(h).strip())]


def month_col_to_date(col: str) -> date | None:
    """Convert a normalised month column header to the first day of that month.

    Handles the SAP PIR format after _get_headers normalisation:
      m03.2026  →  date(2026, 3, 1)       (SAP PIR: M03.2026)
      03.2026   →  date(2026, 3, 1)       (MM.YYYY)
      03/2026   →  date(2026, 3, 1)       (MM/YYYY)
      2026.03   →  date(2026, 3, 1)       (YYYY.MM)
      2026/03   →  date(2026, 3, 1)       (YYYY/MM)
      2026-03   →  date(2026, 3, 1)       (YYYY-MM)
      jan_2026  →  date(2026, 1, 1)       (Mon_YYYY)
      jan-2026  →  date(2026, 1, 1)       (Mon-YYYY)

    Returns None if the header cannot be parsed.
    """
    import calendar as _cal
    h = col.strip()

    # m03.2026 or 03.2026 or 03/2026 — month.year or month/year
    if re.match(r'^m?\d{2}[./]\d{4}$', h):
        parts = re.split(r'[./]', h.lstrip('m'))
        mm, yyyy = int(parts[0]), int(parts[1])
    # 2026.03 or 2026/03 or 2026-03 — year.month
    elif re.match(r'^\d{4}[./-]\d{2}$', h):
        parts = re.split(r'[./-]', h)
        yyyy, mm = int(parts[0]), int(parts[1])
    # jan_2026 or jan-2026
    elif re.match(r'^[a-z]{3}[_\-]\d{4}$', h):
        mon_abbr, yr = re.split(r'[_\-]', h)
        month_map = {m.lower(): i for i, m in enumerate(_cal.month_abbr) if m}
        mm = month_map.get(mon_abbr)
        yyyy = int(yr)
        if mm is None:
            return None
    else:
        return None

    try:
        return date(yyyy, mm, 1)
    except ValueError:
        return None


FILE_SCHEMAS: dict = {
    "master_stock": {
        # Uploadable template. Row 1 = descriptions (ignored), Row 2 = column headers, Row 3+ = data.
        # Plain numbers — no SAP UoM suffix.
        # MOQ and item_status are optional: blank = keep existing items table value.
        "header_row": 2,
        "data_start_row": 3,
        "required": ["material", "plant", "unrestrictedstock", "unrestricted_-_sales"],
        "optional": [
            "abc_indicator", "mrp_type", "safety_stock", "rounding_value",
            "volume", "moq", "item_status",
        ],
        "types": {
            "material":             "str",
            "plant":                "str",
            "unrestrictedstock":    "decimal",
            "unrestricted_-_sales": "decimal",
            "safety_stock":         "decimal",
            "mrp_type":             "str",
            "rounding_value":       "decimal",
            "volume":               "decimal",
            "abc_indicator":        "str",
            "moq":                  "decimal",
            "item_status":          "int",
        },
        "fk_checks": {
            "material": ("dbo.items",      "item_code"),
            "plant":    ("dbo.warehouses", "warehouse_code"),
        },
        "min_rows": 1,
    },
    "demand_plan": {
        "is_sap": False,
        "header_row": 2,        # Row 1 = descriptions (ignored), Row 2 = column keys
        "data_start_row": 3,
        # Column names (row 2 keys — must match exactly after _get_headers normalisation):
        # Ignored SAP columns (mrp_area, version, req_type, version_active, req_plan, req_seg, uom)
        # are simply passed over — do not add to optional or they would generate WARNINGs.
        "required": ["material_id", "plant"],
        "optional": [],
        "types": {
            "material_id": "str",
            "plant":       "str",
            # Month columns are dynamic — validated separately via wide_format logic
        },
        "fk_checks": {
            "material_id": ("dbo.items",      "item_code"),
            "plant":       ("dbo.warehouses", "warehouse_code"),
        },
        "min_rows": 1,
        "wide_format": True,
    },
    "line_capacity_calendar": {
        "is_sap": False,
        "header_row": 2,       # Row 1 is descriptions (ignored), row 2 is column keys
        "data_start_row": 3,
        "required": ["line_code", "calendar_date", "is_working_day", "planned_hours"],
        "optional": [
            "maintenance_hours", "public_holiday_hours",
            "planned_downtime_hours", "other_loss_hours", "notes",
        ],
        "types": {
            "line_code":               "str",
            "calendar_date":           "date",
            "is_working_day":          "bit",
            "planned_hours":           "decimal",
            "maintenance_hours":       "decimal",
            "public_holiday_hours":    "decimal",
            "planned_downtime_hours":  "decimal",
            "other_loss_hours":        "decimal",
            "notes":                   "str",
        },
        "fk_checks": {"line_code": ("dbo.lines", "line_code")},
        "min_rows": 1,
    },
    "headcount_plan": {
        "is_sap": False,
        "header_row": 2,
        "data_start_row": 3,
        "required": ["line_code", "plan_date", "planned_headcount"],
        "optional": ["shift_code", "available_hours", "notes"],
        "types": {
            "line_code":         "str",
            "plan_date":         "date",
            "planned_headcount": "decimal",
            "shift_code":        "str",
            "available_hours":   "decimal",
            "notes":             "str",
        },
        "fk_checks": {"line_code": ("dbo.lines", "line_code")},
        "min_rows": 1,
    },
    "portfolio_changes": {
        "is_sap": False,
        "header_row": 2,
        "data_start_row": 3,
        "required": ["change_type", "effective_date"],
        "optional": ["item_code", "description", "impact_notes"],
        "types": {
            "change_type":   ("enum", ["NEW_LAUNCH", "DISCONTINUE", "REFORMULATION", "LINE_CHANGE", "OTHER"]),
            "effective_date": "date",
            "item_code":     "str",
            "description":   "str",
            "impact_notes":  "str",
        },
        "fk_checks": {},
        "min_rows": 0,  # Empty file is valid — no changes this cycle
    },
}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run_validation(
    conn: pyodbc.Connection,
    batch_id: int,
    batch_file_id: int,
    file_type: str,
    stored_file_path: str,
) -> None:
    """Run all 7 stages for one file. Writes results to import_validation_results
    and updates validation_status on import_batch_files. Commits when done."""

    cursor = conn.cursor()

    # Clear previous results for this file
    cursor.execute(
        "DELETE FROM dbo.import_validation_results WHERE batch_file_id = ?",
        batch_file_id,
    )

    schema = FILE_SCHEMAS.get(file_type, {"is_sap": True})
    is_sap = schema.get("is_sap", False)

    # --- Stage 1: batch-level required file check ---
    _stage1(cursor, conn, batch_id, batch_file_id)

    # --- Stage 2: structure check (open file, verify header row) ---
    wb = _stage2(cursor, batch_file_id, stored_file_path, schema.get("header_row", 1))

    if wb is None:
        # File couldn't be opened — skip remaining content stages
        for n in range(3, 7):
            _write(cursor, batch_file_id, n, STAGE_NAMES[n], "INFO",
                   "Stage skipped — file could not be opened (Stage 2 blocked)")
    elif is_sap:
        # SAP file — column mapping not yet confirmed
        for n in range(3, 7):
            _write(cursor, batch_file_id, n, STAGE_NAMES[n], "INFO",
                   "SAP export — column mapping not yet confirmed. "
                   "Update file_schemas when SAP export headers are available.")
    else:
        ws = wb.active
        headers = _get_headers(ws, schema.get("header_row", 1))
        data_rows = _get_data_rows(ws, headers, schema.get("data_start_row", 2))

        # SAP UoM stripping: cells like "0 EA" or "5.000 ERR" → bare float
        sap_uom_cols = set(schema.get("sap_uom_cols", []))
        if sap_uom_cols:
            data_rows = [
                (rn, {k: (_strip_sap_uom(v) if k in sap_uom_cols else v) for k, v in rd.items()})
                for rn, rd in data_rows
            ]

        # Stage 3: field mapping
        blocked_cols = _stage3(cursor, batch_file_id, schema, headers)

        if blocked_cols:
            for n in range(4, 7):
                _write(cursor, batch_file_id, n, STAGE_NAMES[n], "INFO",
                       "Stage skipped — required columns missing (Stage 3 blocked)")
        elif not data_rows and schema.get("min_rows", 1) == 0:
            # Empty file — valid for portfolio_changes
            for n in range(4, 7):
                _write(cursor, batch_file_id, n, STAGE_NAMES[n], "PASS",
                       "No data rows — empty file is valid for this file type")
        elif not data_rows:
            for n in range(4, 7):
                _write(cursor, batch_file_id, n, STAGE_NAMES[n], "BLOCKED",
                       f"File has a header row but no data rows. "
                       f"At least {schema.get('min_rows', 1)} data row(s) required.")
        else:
            _stage4(cursor, batch_file_id, schema, headers, data_rows)
            _stage5(cursor, conn, batch_file_id, schema, headers, data_rows)
            _stage6(cursor, batch_file_id, file_type, schema, headers, data_rows)

            # master_stock side-effect: update items.mrp_type, units_per_pallet, pack_size_l
            # Only runs when no BLOCKED issues from stages 3–6.
            if file_type == "master_stock":
                chk = conn.cursor()
                chk.execute(
                    """SELECT COUNT(*) FROM dbo.import_validation_results
                       WHERE batch_file_id = ?
                         AND validation_stage BETWEEN 3 AND 6
                         AND severity = 'BLOCKED'""",
                    batch_file_id,
                )
                if chk.fetchone()[0] == 0:
                    _update_items_from_master_stock(cursor, conn, batch_file_id, headers, data_rows)

    # --- Stage 7: batch readiness (always runs) ---
    _stage7(cursor, conn, batch_id, batch_file_id)

    # Update validation_status on the file record
    _update_file_status(cursor, batch_file_id)

    conn.commit()


# ---------------------------------------------------------------------------
# Stage implementations
# ---------------------------------------------------------------------------

def _stage1(cursor, conn: pyodbc.Connection, batch_id: int, batch_file_id: int) -> None:
    stage_num, stage_name = 1, STAGE_NAMES[1]
    c2 = conn.cursor()
    c2.execute(
        """
        SELECT COUNT(DISTINCT file_type)
        FROM dbo.import_batch_files
        WHERE batch_id = ? AND is_current_version = 1
          AND file_type IN (
              'master_stock', 'demand_plan', 'line_capacity_calendar',
              'headcount_plan', 'portfolio_changes'
          )
        """,
        batch_id,
    )
    count = c2.fetchone()[0]
    if count >= 5:
        _write(cursor, batch_file_id, stage_num, stage_name, "PASS",
               "All 5 required files are present in this batch")
    else:
        missing = 5 - count
        _write(cursor, batch_file_id, stage_num, stage_name, "WARNING",
               f"{count}/5 required files present — {missing} still to upload")


def _stage2(cursor, batch_file_id: int, stored_file_path: str, header_row: int = 1):
    stage_num, stage_name = 2, STAGE_NAMES[2]
    try:
        wb = openpyxl.load_workbook(stored_file_path, read_only=True, data_only=True)
    except Exception as exc:
        _write(cursor, batch_file_id, stage_num, stage_name, "BLOCKED",
               f"File could not be opened as a valid Excel workbook: {str(exc)[:200]}")
        return None

    ws = wb.active
    if ws is None:
        _write(cursor, batch_file_id, stage_num, stage_name, "BLOCKED",
               "Workbook has no active sheet")
        return None

    header_vals = [cell.value for cell in next(ws.iter_rows(min_row=header_row, max_row=header_row), [])]
    if all(v is None for v in header_vals):
        _write(cursor, batch_file_id, stage_num, stage_name, "BLOCKED",
               f"Header row (row {header_row}) is empty — expected column names")
        return None

    data_row_count = max(0, (ws.max_row or header_row) - header_row)
    _write(cursor, batch_file_id, stage_num, stage_name, "PASS",
           f"File opened successfully. Sheet: '{ws.title}'. "
           f"~{data_row_count} data row(s) detected.")
    return wb


def _stage3(cursor, batch_file_id: int, schema: dict, headers: list) -> list:
    """Returns list of blocked (missing required) column names."""
    stage_num, stage_name = 3, STAGE_NAMES[3]
    header_set = set(headers)
    required = schema.get("required", [])
    optional = schema.get("optional", [])

    blocked_cols = [c for c in required if c not in header_set]
    warning_cols = [c for c in optional if c not in header_set]

    for col in blocked_cols:
        _write(cursor, batch_file_id, stage_num, stage_name, "BLOCKED",
               f"Required column '{col}' not found in header row",
               field_name=col)

    for col in warning_cols:
        _write(cursor, batch_file_id, stage_num, stage_name, "WARNING",
               f"Optional column '{col}' not found — will be treated as NULL",
               field_name=col)

    # Wide-format: check that at least one month column is present
    if schema.get("wide_format") and not blocked_cols:
        month_cols = _detect_month_columns(headers)
        if not month_cols:
            _write(cursor, batch_file_id, stage_num, stage_name, "BLOCKED",
                   "No month columns detected. Expected columns like 'M03.2026', '01/2026', 'Jan-2026' or '2026-01' "
                   "alongside MaterialID and Plant.")
            blocked_cols.append("__month_columns__")  # sentinel to block stages 4–6
        else:
            sample = ", ".join(month_cols[:3]) + ("…" if len(month_cols) > 3 else "")
            _write(cursor, batch_file_id, stage_num, stage_name, "PASS",
                   f"Found {len(month_cols)} month column(s): {sample}")
    elif not blocked_cols and not warning_cols:
        _write(cursor, batch_file_id, stage_num, stage_name, "PASS",
               "All expected columns are present")

    return blocked_cols


def _stage4(cursor, batch_file_id: int, schema: dict, headers: list, data_rows: list) -> None:
    stage_num, stage_name = 4, STAGE_NAMES[4]
    types = schema.get("types", {})
    required_cols = set(schema.get("required", []))
    header_set = set(headers)
    errors: list[tuple] = []

    for row_num, row_dict in data_rows:
        for col, type_spec in types.items():
            if col not in header_set:
                continue
            val = row_dict.get(col)
            is_empty = val is None or (isinstance(val, str) and val.strip() == "")

            if is_empty:
                if col in required_cols:
                    errors.append((row_num, col, "BLOCKED", "Required value is empty", None))
                continue

            if type_spec == "date":
                if not _is_valid_date(val):
                    errors.append((row_num, col, "BLOCKED",
                                   f"Expected a date, got: '{val}'", str(val)))
            elif type_spec == "decimal":
                if not _is_valid_decimal(val):
                    errors.append((row_num, col, "BLOCKED",
                                   f"Expected a number, got: '{val}'", str(val)))
            elif type_spec == "bit":
                if not _is_valid_bit(val):
                    errors.append((row_num, col, "BLOCKED",
                                   f"Expected 0/1 or Yes/No, got: '{val}'", str(val)))
            elif isinstance(type_spec, tuple) and type_spec[0] == "enum":
                allowed = type_spec[1]
                if str(val).strip().upper() not in [a.upper() for a in allowed]:
                    errors.append((row_num, col, "BLOCKED",
                                   f"'{val}' not in allowed values: {', '.join(allowed)}",
                                   str(val)))

    # Wide-format: validate dynamic month column values as decimals ≥ 0
    if schema.get("wide_format"):
        month_cols = _detect_month_columns(headers)
        for col in month_cols:
            for row_num, row_dict in data_rows:
                val = row_dict.get(col)
                if val is None or (isinstance(val, str) and val.strip() == ""):
                    continue  # blank month cell treated as zero — allowed
                if not _is_valid_decimal(val):
                    errors.append((row_num, col, "BLOCKED",
                                   f"Expected a number in month column '{col}', got: '{val}'",
                                   str(val)))

    _emit_errors(cursor, batch_file_id, stage_num, stage_name, errors,
                 pass_msg=f"All data types valid across {len(data_rows)} row(s)")


def _stage5(cursor, conn: pyodbc.Connection, batch_file_id: int,
            schema: dict, headers: list, data_rows: list) -> None:
    stage_num, stage_name = 5, STAGE_NAMES[5]
    fk_checks = schema.get("fk_checks", {})
    header_set = set(headers)
    errors: list[tuple] = []

    for col, (table, pk_col) in fk_checks.items():
        if col not in header_set:
            continue
        c2 = conn.cursor()
        c2.execute(f"SELECT {pk_col} FROM {table}")  # noqa: S608 — table/col from trusted constants
        valid_values = {str(r[0]).strip() for r in c2.fetchall()}

        for row_num, row_dict in data_rows:
            val = row_dict.get(col)
            if val is None or (isinstance(val, str) and val.strip() == ""):
                continue  # Nulls handled by stage 4
            if str(val).strip() not in valid_values:
                errors.append((row_num, col, "BLOCKED",
                               f"'{val}' not found in {table} ({pk_col})", str(val)))

    _emit_errors(cursor, batch_file_id, stage_num, stage_name, errors,
                 pass_msg="All reference checks passed")


def _stage6(cursor, batch_file_id: int, file_type: str,
            schema: dict, headers: list, data_rows: list) -> None:
    stage_num, stage_name = 6, STAGE_NAMES[6]
    header_set = set(headers)
    errors: list[tuple] = []

    if file_type == "headcount_plan":
        for col in ("planned_headcount", "available_hours"):
            if col not in header_set:
                continue
            for row_num, row_dict in data_rows:
                val = row_dict.get(col)
                if val is not None and _is_valid_decimal(val) and float(val) < 0:
                    errors.append((row_num, col, "BLOCKED",
                                   f"{col} cannot be negative: {val}", str(val)))

    elif file_type == "line_capacity_calendar":
        if "planned_hours" in header_set:
            for row_num, row_dict in data_rows:
                val = row_dict.get("planned_hours")
                if val is not None and _is_valid_decimal(val):
                    f = float(val)
                    if f < 0:
                        errors.append((row_num, "planned_hours", "BLOCKED",
                                       f"planned_hours cannot be negative: {val}", str(val)))
                    elif f > 24:
                        errors.append((row_num, "planned_hours", "BLOCKED",
                                       f"planned_hours cannot exceed 24: {val}", str(val)))
        for loss_col in ("maintenance_hours", "public_holiday_hours",
                         "planned_downtime_hours", "other_loss_hours"):
            if loss_col not in header_set:
                continue
            for row_num, row_dict in data_rows:
                val = row_dict.get(loss_col)
                if val is not None and _is_valid_decimal(val) and float(val) < 0:
                    errors.append((row_num, loss_col, "BLOCKED",
                                   f"{loss_col} cannot be negative: {val}", str(val)))

    elif file_type == "demand_plan":
        month_cols = _detect_month_columns(headers)
        for col in month_cols:
            for row_num, row_dict in data_rows:
                val = row_dict.get(col)
                if val is not None and _is_valid_decimal(val) and float(val) < 0:
                    errors.append((row_num, col, "BLOCKED",
                                   f"Demand quantity cannot be negative: {val}", str(val)))

    elif file_type == "master_stock":
        # unrestrictedstock, safety_stock, rounding_value cannot be negative.
        # unrestricted_-_sales CAN be negative (back-order: sales orders exceed available stock).
        for col in ("unrestrictedstock", "safety_stock", "rounding_value"):
            if col not in header_set:
                continue
            for row_num, row_dict in data_rows:
                val = row_dict.get(col)
                if val is not None and _is_valid_decimal(val) and float(val) < 0:
                    errors.append((row_num, col, "BLOCKED",
                                   f"{col} cannot be negative: {val}", str(val)))
        # moq cannot be negative (0 is valid — means no minimum order quantity)
        if "moq" in header_set:
            for row_num, row_dict in data_rows:
                val = row_dict.get("moq")
                if val is not None and _is_valid_decimal(val) and float(val) < 0:
                    errors.append((row_num, "moq", "BLOCKED",
                                   f"moq cannot be negative: {val}", str(val)))
        # item_status must be blank or 1 (In Design) / 2 (Phase Out) / 3 (Obsolete)
        if "item_status" in header_set:
            for row_num, row_dict in data_rows:
                val = row_dict.get("item_status")
                is_empty = val is None or (isinstance(val, str) and val.strip() == "")
                if not is_empty and _is_valid_int(val) and int(float(val)) not in (1, 2, 3):
                    errors.append((row_num, "item_status", "BLOCKED",
                                   f"item_status must be blank, 1 (In Design), "
                                   f"2 (Phase Out) or 3 (Obsolete), got: {val}", str(val)))

    # portfolio_changes: no extra rules beyond data type checks

    _emit_errors(cursor, batch_file_id, stage_num, stage_name, errors,
                 pass_msg="All business rules passed")


def _stage7(cursor, conn: pyodbc.Connection, batch_id: int, batch_file_id: int) -> None:
    stage_num, stage_name = 7, STAGE_NAMES[7]
    c2 = conn.cursor()

    c2.execute(
        """
        SELECT COUNT(DISTINCT file_type)
        FROM dbo.import_batch_files
        WHERE batch_id = ? AND is_current_version = 1
          AND file_type IN (
              'master_stock', 'demand_plan', 'line_capacity_calendar',
              'headcount_plan', 'portfolio_changes'
          )
        """,
        batch_id,
    )
    required_count = c2.fetchone()[0]

    c2.execute(
        """
        SELECT COUNT(*) FROM dbo.import_validation_results ivr
        JOIN dbo.import_batch_files ibf ON ivr.batch_file_id = ibf.batch_file_id
        WHERE ibf.batch_id = ? AND ibf.is_current_version = 1
          AND ivr.severity = 'BLOCKED'
        """,
        batch_id,
    )
    blocked_count = c2.fetchone()[0]

    c2.execute(
        """
        SELECT COUNT(*) FROM dbo.import_validation_results ivr
        JOIN dbo.import_batch_files ibf ON ivr.batch_file_id = ibf.batch_file_id
        WHERE ibf.batch_id = ? AND ibf.is_current_version = 1
          AND ivr.severity = 'WARNING'
        """,
        batch_id,
    )
    warning_count = c2.fetchone()[0]

    if required_count < 5:
        _write(cursor, batch_file_id, stage_num, stage_name, "WARNING",
               f"Batch not ready to publish: {required_count}/5 required files uploaded")
    elif blocked_count > 0:
        _write(cursor, batch_file_id, stage_num, stage_name, "BLOCKED",
               f"Batch cannot be published: {blocked_count} BLOCKED issue(s) across all files")
    elif warning_count > 0:
        _write(cursor, batch_file_id, stage_num, stage_name, "WARNING",
               f"Batch can be published but has {warning_count} warning(s). Review before publishing.")
    else:
        _write(cursor, batch_file_id, stage_num, stage_name, "PASS",
               "All files validated. Batch is ready to publish.")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write(cursor, batch_file_id: int, stage_num: int, stage_name: str,
           severity: str, message: str, *,
           field_name: str | None = None,
           row_number: int | None = None,
           sample_value: str | None = None) -> None:
    cursor.execute(
        """
        INSERT INTO dbo.import_validation_results
            (batch_file_id, validation_stage, stage_name, severity,
             field_name, row_number, message, sample_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        batch_file_id, stage_num, stage_name, severity,
        field_name, row_number, message,
        sample_value[:500] if sample_value else None,
    )


def _emit_errors(cursor, batch_file_id: int, stage_num: int, stage_name: str,
                 errors: list, *, pass_msg: str) -> None:
    """Write up to 20 errors or a single PASS result."""
    if not errors:
        _write(cursor, batch_file_id, stage_num, stage_name, "PASS", pass_msg)
        return
    for row_num, col, severity, msg, sample in errors[:20]:
        _write(cursor, batch_file_id, stage_num, stage_name, severity, msg,
               field_name=col, row_number=row_num, sample_value=sample)
    if len(errors) > 20:
        _write(cursor, batch_file_id, stage_num, stage_name, "BLOCKED",
               f"{len(errors) - 20} more error(s) not shown — fix the file and re-upload")


def _update_file_status(cursor, batch_file_id: int) -> None:
    """Set validation_status on import_batch_files to the worst per-file severity.

    Only considers stages 1–6. Stage 7 (BATCH_READINESS) is batch-level context,
    not a per-file issue, so it is excluded from the per-file status.

    INFO is not a valid validation_status value (DB CHECK constraint) — files
    whose worst stage-1-to-6 result is INFO are stored as PASS.
    """
    cursor.execute(
        """
        UPDATE dbo.import_batch_files
        SET validation_status = CASE
            WHEN EXISTS (
                SELECT 1 FROM dbo.import_validation_results
                WHERE batch_file_id = ? AND validation_stage BETWEEN 2 AND 6 AND severity = 'BLOCKED'
            ) THEN 'BLOCKED'
            WHEN EXISTS (
                SELECT 1 FROM dbo.import_validation_results
                WHERE batch_file_id = ? AND validation_stage BETWEEN 2 AND 6 AND severity = 'WARNING'
            ) THEN 'WARNING'
            ELSE 'PASS'
        END
        WHERE batch_file_id = ?
        """,
        batch_file_id,
        batch_file_id,
        batch_file_id,
    )


def _strip_sap_uom(val):
    """Strip SAP unit-of-measure suffix from cells like '0 EA' or '5.000 ERR'.

    SAP MB52 exports write numeric values as '<number> <UoM>' strings.
    Returns the numeric value as a float when the pattern matches,
    or the original value unchanged otherwise.
    """
    if not isinstance(val, str):
        return val
    parts = val.strip().split()
    if len(parts) == 2:
        try:
            return float(parts[0].replace(',', ''))
        except ValueError:
            pass
    return val


def _update_items_from_master_stock(cursor, conn: pyodbc.Connection,
                                    batch_file_id: int,
                                    headers: list, data_rows: list) -> None:
    """Update items.mrp_type, items.units_per_pallet, items.pack_size_l from master_stock data.

    Called after successful (no-BLOCKED) master_stock validation.
    Takes the first non-null value per item_code across all warehouse rows.
    Wrapped in try/except so a failure here does not affect the validation result.
    """
    try:
        header_set = set(headers)
        # Collect per-item values (first non-null wins across all warehouse rows)
        item_attrs: dict[str, dict] = {}
        for _, row in data_rows:
            material = row.get("material")
            if not material:
                continue
            item_code = str(material).strip()
            if item_code not in item_attrs:
                item_attrs[item_code] = {
                    "mrp_type": None, "units_per_pallet": None, "pack_size_l": None,
                    "moq": None, "sku_status": None,
                }
            attrs = item_attrs[item_code]

            if attrs["mrp_type"] is None and "mrp_type" in header_set:
                v = row.get("mrp_type")
                if v is not None and str(v).strip():
                    attrs["mrp_type"] = str(v).strip()

            if attrs["units_per_pallet"] is None and "rounding_value" in header_set:
                v = row.get("rounding_value")
                if v is not None and _is_valid_decimal(v) and float(v) > 0:
                    attrs["units_per_pallet"] = int(float(v))

            if attrs["pack_size_l"] is None and "volume" in header_set:
                v = row.get("volume")
                if v is not None and _is_valid_decimal(v) and float(v) > 0:
                    attrs["pack_size_l"] = float(v)

            # moq: 0 is valid (no minimum order quantity)
            if attrs["moq"] is None and "moq" in header_set:
                v = row.get("moq")
                if v is not None and _is_valid_decimal(v) and float(v) >= 0:
                    attrs["moq"] = float(v)

            # sku_status: from item_status column → items.sku_status
            if attrs["sku_status"] is None and "item_status" in header_set:
                v = row.get("item_status")
                if v is not None and _is_valid_int(v) and int(float(v)) in (1, 2, 3):
                    attrs["sku_status"] = int(float(v))

        upd = conn.cursor()
        for item_code, attrs in item_attrs.items():
            upd.execute(
                """UPDATE dbo.items
                   SET mrp_type         = COALESCE(?, mrp_type),
                       units_per_pallet = COALESCE(?, units_per_pallet),
                       pack_size_l      = COALESCE(?, pack_size_l),
                       moq              = COALESCE(?, moq),
                       sku_status       = COALESCE(?, sku_status)
                   WHERE item_code = ?""",
                attrs["mrp_type"],
                attrs["units_per_pallet"],
                attrs["pack_size_l"],
                attrs["moq"],
                attrs["sku_status"],
                item_code,
            )
    except Exception as exc:
        # Non-critical: write a WARNING result so the user is informed
        _write(cursor, batch_file_id, 6, STAGE_NAMES[6], "WARNING",
               f"Items table could not be updated from master_stock: {str(exc)[:200]}")


def _get_headers(ws, header_row: int = 1) -> list[str]:
    """Read the header row and return normalised column names (lower, underscored)."""
    headers = []
    for cell in next(ws.iter_rows(min_row=header_row, max_row=header_row), []):
        val = cell.value
        if val is not None:
            headers.append(str(val).strip().lower().replace(" ", "_"))
    return headers


def _get_data_rows(ws, headers: list[str], start_row: int = 2) -> list[tuple[int, dict]]:
    """Return [(excel_row_num, {col: val}), ...] skipping blank rows.

    start_row defaults to 2 (immediately after the header).
    Set to 3 for template files that include a description row at row 2.
    """
    rows = []
    for excel_row in ws.iter_rows(min_row=start_row):
        vals = [cell.value for cell in excel_row]
        if all(v is None or (isinstance(v, str) and v.strip() == "") for v in vals):
            continue
        row_num = excel_row[0].row
        row_dict = {headers[i]: vals[i] for i in range(min(len(headers), len(vals)))}
        rows.append((row_num, row_dict))
    return rows


# ---------------------------------------------------------------------------
# Type validators
# ---------------------------------------------------------------------------

def _is_valid_date(val) -> bool:
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


def _is_valid_decimal(val) -> bool:
    if isinstance(val, (int, float, Decimal)):
        return True
    try:
        float(str(val).strip())
        return True
    except (ValueError, TypeError):
        return False


def _is_valid_bit(val) -> bool:
    if isinstance(val, bool):
        return True
    if isinstance(val, int) and val in (0, 1):
        return True
    return str(val).strip().lower() in ("0", "1", "yes", "no", "true", "false", "y", "n")


def _is_valid_int(val) -> bool:
    if isinstance(val, bool):
        return False  # booleans are ints in Python but not meaningful here
    if isinstance(val, int):
        return True
    try:
        f = float(str(val).strip())
        return f == int(f)
    except (ValueError, TypeError):
        return False
