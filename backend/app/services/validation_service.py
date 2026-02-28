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

SAP files (master_stock, demand_plan): stages 3–6 return INFO until column
headers are confirmed. Stages 1, 2, 7 run fully.

Template files (line_capacity_calendar, headcount_plan, portfolio_changes,
oee_daily): all stages run fully.
"""

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

FILE_SCHEMAS: dict = {
    "master_stock": {"is_sap": True},
    "demand_plan":  {"is_sap": True},
    "line_capacity_calendar": {
        "is_sap": False,
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
    "oee_daily": {
        "is_sap": False,
        "required": ["line_code", "record_date", "oee_pct"],
        "optional": ["availability_pct", "performance_pct", "quality_pct"],
        "types": {
            "line_code":        "str",
            "record_date":      "date",
            "oee_pct":          "decimal",
            "availability_pct": "decimal",
            "performance_pct":  "decimal",
            "quality_pct":      "decimal",
        },
        "fk_checks": {"line_code": ("dbo.lines", "line_code")},
        "min_rows": 1,
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
    wb = _stage2(cursor, batch_file_id, stored_file_path)

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
        headers = _get_headers(ws)
        data_rows = _get_data_rows(ws, headers)

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


def _stage2(cursor, batch_file_id: int, stored_file_path: str):
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

    first_row_vals = [cell.value for cell in next(ws.iter_rows(min_row=1, max_row=1), [])]
    if all(v is None for v in first_row_vals):
        _write(cursor, batch_file_id, stage_num, stage_name, "BLOCKED",
               "Header row (row 1) is empty — expected column names")
        return None

    data_row_count = max(0, (ws.max_row or 1) - 1)
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

    if not blocked_cols and not warning_cols:
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

    elif file_type == "oee_daily":
        for pct_col in ("oee_pct", "availability_pct", "performance_pct", "quality_pct"):
            if pct_col not in header_set:
                continue
            for row_num, row_dict in data_rows:
                val = row_dict.get(pct_col)
                if val is not None and _is_valid_decimal(val):
                    f = float(val)
                    if f < 0 or f > 1:
                        errors.append((row_num, pct_col, "BLOCKED",
                                       f"{pct_col} must be 0–1 (e.g. 0.85 = 85%), got: {val}",
                                       str(val)))

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
    """Set validation_status on import_batch_files to the worst severity found."""
    cursor.execute(
        """
        UPDATE dbo.import_batch_files
        SET validation_status = (
            SELECT TOP 1 severity
            FROM dbo.import_validation_results
            WHERE batch_file_id = ?
            ORDER BY
                CASE severity
                    WHEN 'BLOCKED' THEN 1
                    WHEN 'WARNING' THEN 2
                    WHEN 'INFO'    THEN 3
                    WHEN 'PASS'    THEN 4
                    ELSE 5
                END ASC
        )
        WHERE batch_file_id = ?
        """,
        batch_file_id,
        batch_file_id,
    )


def _get_headers(ws) -> list[str]:
    """Read row 1 and return normalised column names (lower, underscored)."""
    headers = []
    for cell in next(ws.iter_rows(min_row=1, max_row=1), []):
        val = cell.value
        if val is not None:
            headers.append(str(val).strip().lower().replace(" ", "_"))
    return headers


def _get_data_rows(ws, headers: list[str]) -> list[tuple[int, dict]]:
    """Return [(excel_row_num, {col: val}), ...] skipping blank rows."""
    rows = []
    for excel_row in ws.iter_rows(min_row=2):
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
