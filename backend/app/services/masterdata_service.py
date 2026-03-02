"""
Masterdata upload service.

Handles validation (synchronous, not persisted) and full-replace import
for all 4 masterdata file types:

  line_pack_capabilities      → line_pack_capabilities table
  line_resource_requirements  → line_resource_requirements table
  plant_resource_requirements → plant_resource_requirements table
  warehouse_capacity          → warehouse_capacity table

Note: item attributes (moq, sku_status, mrp_type, units_per_pallet, pack_size_l) are
updated via the master_stock batch upload — not via a separate masterdata upload.

Stages run: 2 (structure), 3 (field mapping), 4 (data types), 5 (FK checks), 6 (rules)
BLOCKED → reject upload, data not imported.
WARNING → data imported, warnings returned in response.
"""

from datetime import date, datetime
from decimal import Decimal

import openpyxl
import pyodbc

# ---------------------------------------------------------------------------
# Schemas — same pattern as validation_service.FILE_SCHEMAS
# ---------------------------------------------------------------------------

MASTERDATA_SCHEMAS: dict = {
    "line_pack_capabilities": {
        "header_row": 2,  # Row 1 is descriptions (ignored), row 2 is column keys
        "required": ["line_code", "pack_size_l"],
        "optional": ["bottles_per_minute", "is_active", "oee_target"],
        "types": {
            "line_code":          "str",
            "pack_size_l":        "decimal",
            "bottles_per_minute": "decimal",
            "is_active":          "bit",
            "oee_target":         "decimal",
        },
        "fk_checks": {
            "line_code": ("dbo.lines", "line_code"),
        },
    },
    "line_resource_requirements": {
        "header_row": 2,
        "required": ["line_code", "resource_type_code", "headcount_required"],
        "optional": [],
        "types": {
            "line_code":          "str",
            "resource_type_code": "str",
            "headcount_required": "decimal",
        },
        "fk_checks": {
            "line_code":          ("dbo.lines", "line_code"),
            "resource_type_code": ("dbo.resource_types", "resource_type_code"),
        },
    },
    "plant_resource_requirements": {
        "header_row": 2,
        "required": ["plant_code", "resource_type_code", "headcount_required"],
        "optional": [],
        "types": {
            "plant_code":         "str",
            "resource_type_code": "str",
            "headcount_required": "decimal",
        },
        "fk_checks": {
            "plant_code":         ("dbo.plants", "plant_code"),
            "resource_type_code": ("dbo.resource_types", "resource_type_code"),
        },
    },
    "warehouse_capacity": {
        "header_row": 2,
        "required": ["warehouse_code", "pack_type_code", "max_pallet_capacity"],
        "optional": [],
        "types": {
            "warehouse_code":     "str",
            "pack_type_code":     "str",
            "max_pallet_capacity": "decimal",
        },
        "fk_checks": {
            "warehouse_code": ("dbo.warehouses", "warehouse_code"),
            "pack_type_code": ("dbo.pack_types", "pack_type_code"),
        },
    },
}

VALID_MASTERDATA_TYPES = frozenset(MASTERDATA_SCHEMAS.keys())


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def validate_and_import(
    conn: pyodbc.Connection,
    masterdata_type: str,
    stored_file_path: str,
    original_filename: str,
    uploaded_by: str | None,
) -> dict:
    """
    Validate and import a masterdata file.

    Returns:
        {
          "success": bool,
          "rows_imported": int | None,
          "errors": [...],    # BLOCKED issues — non-empty means upload rejected
          "warnings": [...],  # WARNING issues — present even on success
        }
    """
    schema = MASTERDATA_SCHEMAS[masterdata_type]
    issues: list[dict] = []

    header_row = schema.get("header_row", 1)

    # Stage 2: structure
    wb = _stage2(stored_file_path, issues, header_row)
    if wb is None:
        return {"success": False, "rows_imported": None,
                "errors": issues, "warnings": []}

    ws = wb.active
    headers = _get_headers(ws, header_row)
    data_rows = _get_data_rows(ws, headers, header_row + 1)

    # Stage 3: field mapping
    blocked_cols = _stage3(schema, headers, issues)
    if blocked_cols:
        return {"success": False, "rows_imported": None,
                "errors": [i for i in issues if i["severity"] == "BLOCKED"],
                "warnings": [i for i in issues if i["severity"] == "WARNING"]}

    if not data_rows:
        issues.append({
            "stage": 3, "stage_name": "FIELD_MAPPING_CHECK",
            "severity": "BLOCKED",
            "field": None, "row": None,
            "message": "File has a header row but no data rows.",
        })
        return {"success": False, "rows_imported": None,
                "errors": [i for i in issues if i["severity"] == "BLOCKED"],
                "warnings": [i for i in issues if i["severity"] == "WARNING"]}

    # Stage 4: data types
    _stage4(schema, headers, data_rows, issues)

    # Stage 5: FK / reference checks
    _stage5(conn, schema, headers, data_rows, issues)

    # Stage 6: business rules
    _stage6(masterdata_type, schema, headers, data_rows, issues)

    errors = [i for i in issues if i["severity"] == "BLOCKED"]
    warnings = [i for i in issues if i["severity"] == "WARNING"]

    if errors:
        return {"success": False, "rows_imported": None,
                "errors": errors, "warnings": warnings}

    # All clear — import the data
    rows_imported = _import(conn, masterdata_type, schema, headers, data_rows, uploaded_by)

    # Commit the import immediately — this is the critical data.
    conn.commit()

    # Record upload in audit table (non-critical — data is already committed above).
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO dbo.masterdata_uploads
                (masterdata_type, original_filename, row_count, uploaded_by, stored_file_path)
            VALUES (?, ?, ?, ?, ?)
            """,
            masterdata_type, original_filename, rows_imported, uploaded_by, stored_file_path,
        )
        conn.commit()
    except Exception as audit_err:
        # Audit write failed (e.g. stored_file_path column missing — run script 14).
        # The import data is already committed — do not fail the request.
        warnings.append({
            "stage": 6, "stage_name": "BUSINESS_RULE_CHECK",
            "severity": "WARNING", "field": None, "row": None,
            "message": (
                f"Data imported successfully but audit trail could not be written: "
                f"{str(audit_err)[:200]}. "
                f"Run db/schema/14_masterdata_stored_path.sql to fix."
            ),
        })

    return {"success": True, "rows_imported": rows_imported,
            "errors": [], "warnings": warnings}


def get_status(conn: pyodbc.Connection) -> list[dict]:
    """Return last-upload info for all masterdata types."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            masterdata_type,
            MAX(uploaded_at) AS last_uploaded_at,
            MAX(CASE WHEN uploaded_at = (
                SELECT MAX(u2.uploaded_at) FROM dbo.masterdata_uploads u2
                WHERE u2.masterdata_type = u.masterdata_type
            ) THEN uploaded_by END) AS last_uploaded_by,
            MAX(CASE WHEN uploaded_at = (
                SELECT MAX(u2.uploaded_at) FROM dbo.masterdata_uploads u2
                WHERE u2.masterdata_type = u.masterdata_type
            ) THEN row_count END) AS last_row_count,
            MAX(CASE WHEN uploaded_at = (
                SELECT MAX(u2.uploaded_at) FROM dbo.masterdata_uploads u2
                WHERE u2.masterdata_type = u.masterdata_type
            ) THEN original_filename END) AS last_original_filename
        FROM dbo.masterdata_uploads u
        GROUP BY masterdata_type
        """,
    )
    uploaded = {
        r[0]: {
            "last_uploaded_at": str(r[1]) if r[1] else None,
            "last_uploaded_by": r[2],
            "last_row_count": r[3],
            "last_original_filename": r[4],
        }
        for r in cursor.fetchall()
    }

    return [
        {
            "masterdata_type": t,
            "last_uploaded_at": uploaded.get(t, {}).get("last_uploaded_at"),
            "last_uploaded_by": uploaded.get(t, {}).get("last_uploaded_by"),
            "last_row_count": uploaded.get(t, {}).get("last_row_count"),
            "last_original_filename": uploaded.get(t, {}).get("last_original_filename"),
        }
        for t in VALID_MASTERDATA_TYPES
    ]


def get_latest_upload_path(conn: pyodbc.Connection, masterdata_type: str) -> dict | None:
    """Return stored_file_path and original_filename for the most recent successful upload."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT TOP 1 stored_file_path, original_filename
        FROM dbo.masterdata_uploads
        WHERE masterdata_type = ? AND stored_file_path IS NOT NULL
        ORDER BY uploaded_at DESC
        """,
        masterdata_type,
    )
    row = cursor.fetchone()
    if not row:
        return None
    return {"stored_file_path": row[0], "original_filename": row[1]}


# ---------------------------------------------------------------------------
# Validation stages
# ---------------------------------------------------------------------------

def _stage2(stored_file_path: str, issues: list, header_row: int = 1) -> object | None:
    try:
        wb = openpyxl.load_workbook(stored_file_path, read_only=True, data_only=True)
    except Exception as exc:
        issues.append({
            "stage": 2, "stage_name": "TEMPLATE_STRUCTURE_CHECK",
            "severity": "BLOCKED", "field": None, "row": None,
            "message": f"File could not be opened as a valid Excel workbook: {str(exc)[:200]}",
        })
        return None

    ws = wb.active
    if ws is None:
        issues.append({
            "stage": 2, "stage_name": "TEMPLATE_STRUCTURE_CHECK",
            "severity": "BLOCKED", "field": None, "row": None,
            "message": "Workbook has no active sheet.",
        })
        return None

    header_vals = [cell.value for cell in next(ws.iter_rows(min_row=header_row, max_row=header_row), [])]
    if all(v is None for v in header_vals):
        issues.append({
            "stage": 2, "stage_name": "TEMPLATE_STRUCTURE_CHECK",
            "severity": "BLOCKED", "field": None, "row": None,
            "message": f"Header row (row {header_row}) is empty — expected column names.",
        })
        return None

    return wb


def _stage3(schema: dict, headers: list, issues: list) -> list:
    """Returns list of blocked column names."""
    header_set = set(headers)
    blocked = [c for c in schema["required"] if c not in header_set]
    for col in blocked:
        issues.append({
            "stage": 3, "stage_name": "FIELD_MAPPING_CHECK",
            "severity": "BLOCKED", "field": col, "row": None,
            "message": f"Required column '{col}' not found in header row.",
        })
    for col in schema.get("optional", []):
        if col not in header_set:
            issues.append({
                "stage": 3, "stage_name": "FIELD_MAPPING_CHECK",
                "severity": "WARNING", "field": col, "row": None,
                "message": f"Optional column '{col}' not found — will be treated as NULL.",
            })
    return blocked


def _stage4(schema: dict, headers: list, data_rows: list, issues: list) -> None:
    types = schema.get("types", {})
    required_set = set(schema["required"])
    header_set = set(headers)

    for row_num, row_dict in data_rows:
        for col, type_spec in types.items():
            if col not in header_set:
                continue
            val = row_dict.get(col)
            is_empty = val is None or (isinstance(val, str) and val.strip() == "")
            if is_empty:
                if col in required_set:
                    issues.append({
                        "stage": 4, "stage_name": "DATA_TYPE_CHECK",
                        "severity": "BLOCKED", "field": col, "row": row_num,
                        "message": f"Row {row_num}: '{col}' is required but empty.",
                    })
                continue

            if type_spec == "date":
                if not _is_valid_date(val):
                    issues.append({
                        "stage": 4, "stage_name": "DATA_TYPE_CHECK",
                        "severity": "BLOCKED", "field": col, "row": row_num,
                        "message": f"Row {row_num}: '{col}' expected a date, got: '{val}'.",
                    })
            elif type_spec == "decimal":
                if not _is_valid_decimal(val):
                    issues.append({
                        "stage": 4, "stage_name": "DATA_TYPE_CHECK",
                        "severity": "BLOCKED", "field": col, "row": row_num,
                        "message": f"Row {row_num}: '{col}' expected a number, got: '{val}'.",
                    })
            elif type_spec == "int":
                if not _is_valid_int(val):
                    issues.append({
                        "stage": 4, "stage_name": "DATA_TYPE_CHECK",
                        "severity": "BLOCKED", "field": col, "row": row_num,
                        "message": f"Row {row_num}: '{col}' expected a whole number, got: '{val}'.",
                    })
            elif type_spec == "bit":
                if not _is_valid_bit(val):
                    issues.append({
                        "stage": 4, "stage_name": "DATA_TYPE_CHECK",
                        "severity": "BLOCKED", "field": col, "row": row_num,
                        "message": f"Row {row_num}: '{col}' expected 0 or 1, got: '{val}'.",
                    })

        if len(issues) >= 20:
            issues.append({
                "stage": 4, "stage_name": "DATA_TYPE_CHECK",
                "severity": "BLOCKED", "field": None, "row": None,
                "message": "Too many type errors — fix the file and re-upload.",
            })
            break


def _stage5(conn: pyodbc.Connection, schema: dict, headers: list,
            data_rows: list, issues: list) -> None:
    header_set = set(headers)
    for col, (table, pk_col) in schema.get("fk_checks", {}).items():
        if col not in header_set:
            continue
        c2 = conn.cursor()
        c2.execute(f"SELECT {pk_col} FROM {table}")  # noqa: S608 — constants only
        valid_values = {str(r[0]).strip() for r in c2.fetchall()}

        for row_num, row_dict in data_rows:
            val = row_dict.get(col)
            if val is None or (isinstance(val, str) and val.strip() == ""):
                continue
            if str(val).strip() not in valid_values:
                issues.append({
                    "stage": 5, "stage_name": "REFERENCE_CHECK",
                    "severity": "BLOCKED", "field": col, "row": row_num,
                    "message": f"Row {row_num}: '{val}' not found in {table} ({pk_col}).",
                })


def _stage6(masterdata_type: str, schema: dict, headers: list,
            data_rows: list, issues: list) -> None:
    header_set = set(headers)

    if masterdata_type in ("line_resource_requirements", "plant_resource_requirements"):
        if "headcount_required" in header_set:
            for row_num, row_dict in data_rows:
                val = row_dict.get("headcount_required")
                if val is not None and _is_valid_decimal(val) and float(val) <= 0:
                    issues.append({
                        "stage": 6, "stage_name": "BUSINESS_RULE_CHECK",
                        "severity": "BLOCKED", "field": "headcount_required", "row": row_num,
                        "message": f"Row {row_num}: headcount_required must be > 0, got: {val}.",
                    })

    elif masterdata_type == "warehouse_capacity":
        if "max_pallet_capacity" in header_set:
            for row_num, row_dict in data_rows:
                val = row_dict.get("max_pallet_capacity")
                if val is not None and _is_valid_decimal(val) and float(val) <= 0:
                    issues.append({
                        "stage": 6, "stage_name": "BUSINESS_RULE_CHECK",
                        "severity": "BLOCKED", "field": "max_pallet_capacity", "row": row_num,
                        "message": f"Row {row_num}: max_pallet_capacity must be > 0, got: {val}.",
                    })

    elif masterdata_type == "line_pack_capabilities":
        for col in ("pack_size_l", "bottles_per_minute"):
            if col not in header_set:
                continue
            for row_num, row_dict in data_rows:
                val = row_dict.get(col)
                if val is not None and _is_valid_decimal(val) and float(val) <= 0:
                    issues.append({
                        "stage": 6, "stage_name": "BUSINESS_RULE_CHECK",
                        "severity": "BLOCKED", "field": col, "row": row_num,
                        "message": f"Row {row_num}: {col} must be > 0, got: {val}.",
                    })
        if "oee_target" in header_set:
            for row_num, row_dict in data_rows:
                val = row_dict.get("oee_target")
                if val is not None and _is_valid_decimal(val) and not (0 < float(val) <= 1):
                    issues.append({
                        "stage": 6, "stage_name": "BUSINESS_RULE_CHECK",
                        "severity": "BLOCKED", "field": "oee_target", "row": row_num,
                        "message": f"Row {row_num}: oee_target must be between 0 and 1 (e.g. 0.65 = 65%), got: {val}.",
                    })



# ---------------------------------------------------------------------------
# Import handlers (full-replace per type)
# ---------------------------------------------------------------------------

def _import(conn: pyodbc.Connection, masterdata_type: str, schema: dict,
            headers: list, data_rows: list, uploaded_by: str | None) -> int:
    handlers = {
        "line_pack_capabilities":     _import_line_pack_capabilities,
        "line_resource_requirements":  _import_line_resource_requirements,
        "plant_resource_requirements": _import_plant_resource_requirements,
        "warehouse_capacity":          _import_warehouse_capacity,
    }
    return handlers[masterdata_type](conn, headers, data_rows, uploaded_by)


def _import_line_pack_capabilities(conn, headers, data_rows, uploaded_by):
    header_set = set(headers)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM dbo.line_pack_capabilities")
    count = 0
    for _, row in data_rows:
        bpm = _get_decimal(row, "bottles_per_minute", header_set)
        is_active = _get_bit(row, "is_active", header_set, default=1)
        oee_target = _get_decimal(row, "oee_target", header_set)
        cursor.execute(
            """
            INSERT INTO dbo.line_pack_capabilities
                (line_code, pack_size_l, bottles_per_minute, is_active, oee_target, updated_by)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            str(row["line_code"]).strip(),
            float(row["pack_size_l"]),
            bpm,
            is_active,
            oee_target,
            uploaded_by,
        )
        count += 1
    return count


def _import_line_resource_requirements(conn, headers, data_rows, uploaded_by):
    cursor = conn.cursor()
    cursor.execute("DELETE FROM dbo.line_resource_requirements")
    count = 0
    for _, row in data_rows:
        cursor.execute(
            """
            INSERT INTO dbo.line_resource_requirements
                (line_code, resource_type_code, headcount_required, updated_by)
            VALUES (?, ?, ?, ?)
            """,
            str(row["line_code"]).strip(),
            str(row["resource_type_code"]).strip(),
            float(row["headcount_required"]),
            uploaded_by,
        )
        count += 1
    return count


def _import_plant_resource_requirements(conn, headers, data_rows, uploaded_by):
    cursor = conn.cursor()
    cursor.execute("DELETE FROM dbo.plant_resource_requirements")
    count = 0
    for _, row in data_rows:
        cursor.execute(
            """
            INSERT INTO dbo.plant_resource_requirements
                (plant_code, resource_type_code, headcount_required, updated_by)
            VALUES (?, ?, ?, ?)
            """,
            str(row["plant_code"]).strip(),
            str(row["resource_type_code"]).strip(),
            float(row["headcount_required"]),
            uploaded_by,
        )
        count += 1
    return count


def _import_warehouse_capacity(conn, headers, data_rows, uploaded_by):
    cursor = conn.cursor()
    cursor.execute("DELETE FROM dbo.warehouse_capacity")
    count = 0
    for _, row in data_rows:
        cursor.execute(
            """
            INSERT INTO dbo.warehouse_capacity
                (warehouse_code, pack_type_code, max_pallet_capacity, updated_by)
            VALUES (?, ?, ?, ?)
            """,
            str(row["warehouse_code"]).strip(),
            str(row["pack_type_code"]).strip(),
            int(float(row["max_pallet_capacity"])),
            uploaded_by,
        )
        count += 1
    return count


# ---------------------------------------------------------------------------
# Excel helpers
# ---------------------------------------------------------------------------

def _get_headers(ws, header_row: int = 1) -> list[str]:
    headers = []
    for cell in next(ws.iter_rows(min_row=header_row, max_row=header_row), []):
        val = cell.value
        if val is not None:
            headers.append(str(val).strip().lower().replace(" ", "_"))
    return headers


def _get_data_rows(ws, headers: list[str], start_row: int = 2) -> list[tuple[int, dict]]:
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
# Value coercion helpers
# ---------------------------------------------------------------------------

def _get_decimal(row: dict, col: str, header_set: set) -> float | None:
    if col not in header_set:
        return None
    val = row.get(col)
    if val is None or (isinstance(val, str) and val.strip() == ""):
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _get_int(row: dict, col: str, header_set: set) -> int | None:
    v = _get_decimal(row, col, header_set)
    return int(v) if v is not None else None


def _get_str(row: dict, col: str, header_set: set) -> str | None:
    if col not in header_set:
        return None
    val = row.get(col)
    if val is None or (isinstance(val, str) and val.strip() == ""):
        return None
    return str(val).strip()


def _get_bit(row: dict, col: str, header_set: set, default: int = 1) -> int:
    if col not in header_set:
        return default
    val = row.get(col)
    if val is None or (isinstance(val, str) and val.strip() == ""):
        return default
    if isinstance(val, bool):
        return 1 if val else 0
    try:
        return 1 if int(float(str(val))) else 0
    except (ValueError, TypeError):
        return default


# ---------------------------------------------------------------------------
# Type validators (same logic as validation_service)
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
