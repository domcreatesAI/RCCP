"""
Masterdata upload service.

Handles validation (synchronous, not persisted) and full-replace import
for all masterdata file types:

  line_pack_capabilities      → line_pack_capabilities table (full replace)
  line_resource_requirements  → line_resource_requirements table (full replace)
  plant_resource_requirements → plant_resource_requirements table (full replace)
  warehouse_capacity          → warehouse_capacity table (full replace)
  sku_masterdata              → dbo.items (MERGE/upsert by item_code — never deletes)

Stages run: 2 (structure), 3 (field mapping), 4 (data types), 5 (FK checks), 6 (rules)
BLOCKED → reject upload, data not imported.
WARNING → data imported, warnings returned in response.

Stage 6 completeness checks:
  line_resource_requirements:  every active line must have every LINE-scope resource type
  plant_resource_requirements: every active plant must have every PLANT-scope resource type
  warehouse_capacity:          must have a row for every active pack_type_code

headcount_required >= 0 for both resource requirement tables (team leaders may be 0).
bottles_per_minute is now required for line_pack_capabilities.
"""

import io
from datetime import date, datetime
from decimal import Decimal

import openpyxl
import pyodbc

from app.services.excel_utils import (
    get_headers as _get_headers,
    get_data_rows as _get_data_rows,
    is_valid_date as _is_valid_date,
    is_valid_decimal as _is_valid_decimal,
    is_valid_bit as _is_valid_bit,
    is_valid_int as _is_valid_int,
)

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

MASTERDATA_SCHEMAS: dict = {
    "sku_masterdata": {
        "header_row": 2,
        # item_code is the only required column — all attributes are optional
        # so a partial upload (e.g. new SKUs only) is valid.
        "required": ["item_code"],
        "optional": [
            "item_description", "abc_indicator", "mrp_type", "pack_size_l",
            "moq", "pack_type_code", "sku_status", "rounding_value",
            "plant_code", "primary_line_code", "secondary_line_code",
            "tertiary_line_code", "quaternary_line_code", "unit_cost",
        ],
        "types": {
            "item_code":            "str",
            "item_description":     "str",
            "abc_indicator":        "str",
            "mrp_type":             "str",
            "pack_size_l":          "decimal",
            "moq":                  "decimal",
            "pack_type_code":       "str",
            "sku_status":           "int",
            "rounding_value":       "decimal",
            "plant_code":           "str",
            "primary_line_code":    "str",
            "secondary_line_code":  "str",
            "tertiary_line_code":   "str",
            "quaternary_line_code": "str",
            "unit_cost":            "decimal",
        },
        "fk_checks": {
            "pack_type_code":       ("dbo.pack_types", "pack_type_code"),
            "plant_code":           ("dbo.plants",     "plant_code"),
            "primary_line_code":    ("dbo.lines",      "line_code"),
            "secondary_line_code":  ("dbo.lines",      "line_code"),
            "tertiary_line_code":   ("dbo.lines",      "line_code"),
            "quaternary_line_code": ("dbo.lines",      "line_code"),
        },
    },
    "line_pack_capabilities": {
        "header_row": 2,
        # bottles_per_minute promoted to required
        "required": ["line_code", "pack_size_l", "bottles_per_minute"],
        "optional": ["is_active", "oee_target"],
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
            "warehouse_code":      "str",
            "pack_type_code":      "str",
            "max_pallet_capacity": "decimal",
        },
        "fk_checks": {
            "warehouse_code": ("dbo.warehouses", "warehouse_code"),
            "pack_type_code": ("dbo.pack_types", "pack_type_code"),
        },
    },
}

VALID_MASTERDATA_TYPES = frozenset(MASTERDATA_SCHEMAS.keys())

_MASTERDATA_TABLE: dict[str, str] = {
    "line_pack_capabilities":     "dbo.line_pack_capabilities",
    "line_resource_requirements":  "dbo.line_resource_requirements",
    "plant_resource_requirements": "dbo.plant_resource_requirements",
    "warehouse_capacity":          "dbo.warehouse_capacity",
    # sku_masterdata upserts into dbo.items — no dedicated table to count rows from
    # (table_row_count for sku_masterdata is derived from dbo.items directly in get_status)
}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def validate_and_import(
    conn: pyodbc.Connection,
    masterdata_type: str,
    file_content: bytes,
    original_filename: str,
    uploaded_by: str | None,
) -> dict:
    """
    Validate and import a masterdata file from raw bytes.

    Returns:
        {
          "success": bool,
          "rows_imported": int | None,
          "errors": [...],
          "warnings": [...],
        }
    """
    schema = MASTERDATA_SCHEMAS[masterdata_type]
    issues: list[dict] = []

    header_row = schema.get("header_row", 1)

    wb = _stage2(file_content, issues, header_row)
    if wb is None:
        return {"success": False, "rows_imported": None,
                "errors": issues, "warnings": []}

    ws = wb.active
    headers = _get_headers(ws, header_row)
    data_rows = _get_data_rows(ws, headers, header_row + 1)

    blocked_cols = _stage3(schema, headers, issues)
    if blocked_cols:
        return {"success": False, "rows_imported": None,
                "errors": [i for i in issues if i["severity"] == "BLOCKED"],
                "warnings": [i for i in issues if i["severity"] == "WARNING"]}

    if not data_rows:
        issues.append({
            "stage": 3, "stage_name": "FIELD_MAPPING_CHECK",
            "severity": "BLOCKED", "field": None, "row": None,
            "message": "File has a header row but no data rows.",
        })
        return {"success": False, "rows_imported": None,
                "errors": [i for i in issues if i["severity"] == "BLOCKED"],
                "warnings": [i for i in issues if i["severity"] == "WARNING"]}

    _stage4(schema, headers, data_rows, issues)
    _stage5(conn, schema, headers, data_rows, issues)
    _stage6(conn, masterdata_type, schema, headers, data_rows, issues)

    errors = [i for i in issues if i["severity"] == "BLOCKED"]
    warnings = [i for i in issues if i["severity"] == "WARNING"]

    if errors:
        return {"success": False, "rows_imported": None,
                "errors": errors, "warnings": warnings}

    rows_imported = _import(conn, masterdata_type, schema, headers, data_rows, uploaded_by)
    conn.commit()

    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT ISNULL(MAX(version_number), 0) FROM dbo.masterdata_uploads WHERE masterdata_type = ?",
            masterdata_type,
        )
        next_version = cursor.fetchone()[0] + 1

        cursor.execute(
            """
            INSERT INTO dbo.masterdata_uploads
                (masterdata_type, original_filename, row_count, uploaded_by,
                 version_number, file_content)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            masterdata_type, original_filename, rows_imported, uploaded_by,
            next_version, file_content,
        )
        conn.commit()
    except Exception as audit_err:
        warnings.append({
            "stage": 6, "stage_name": "BUSINESS_RULE_CHECK",
            "severity": "WARNING", "field": None, "row": None,
            "message": (
                f"Data imported successfully but audit trail could not be written: "
                f"{str(audit_err)[:200]}. "
                f"Run db/schema/17_file_content_versioning.sql to fix."
            ),
        })

    return {"success": True, "rows_imported": rows_imported,
            "errors": [], "warnings": warnings}


def get_status(conn: pyodbc.Connection) -> list[dict]:
    """Return last-upload info for all masterdata types."""
    cursor = conn.cursor()
    cursor.execute(
        """
        WITH latest AS (
            SELECT
                masterdata_type,
                uploaded_at,
                uploaded_by,
                row_count,
                original_filename,
                version_number,
                ROW_NUMBER() OVER (
                    PARTITION BY masterdata_type
                    ORDER BY uploaded_at DESC
                ) AS rn
            FROM dbo.masterdata_uploads
        )
        SELECT
            masterdata_type,
            uploaded_at        AS last_uploaded_at,
            uploaded_by        AS last_uploaded_by,
            row_count          AS last_row_count,
            original_filename  AS last_original_filename,
            version_number     AS last_version_number
        FROM latest
        WHERE rn = 1
        """,
    )
    uploaded = {
        r[0]: {
            "last_uploaded_at": str(r[1]) if r[1] else None,
            "last_uploaded_by": r[2],
            "last_row_count": r[3],
            "last_original_filename": r[4],
            "last_version_number": r[5],
        }
        for r in cursor.fetchall()
    }

    table_counts: dict[str, int] = {}
    for t, table in _MASTERDATA_TABLE.items():
        cursor.execute(f"SELECT COUNT(*) FROM {table}")  # noqa: S608
        table_counts[t] = cursor.fetchone()[0]

    # sku_masterdata rows live in dbo.items
    cursor.execute("SELECT COUNT(*) FROM dbo.items")
    table_counts["sku_masterdata"] = cursor.fetchone()[0]

    return [
        {
            "masterdata_type": t,
            "last_uploaded_at": uploaded.get(t, {}).get("last_uploaded_at"),
            "last_uploaded_by": uploaded.get(t, {}).get("last_uploaded_by"),
            "last_row_count": uploaded.get(t, {}).get("last_row_count"),
            "last_original_filename": uploaded.get(t, {}).get("last_original_filename"),
            "last_version_number": uploaded.get(t, {}).get("last_version_number"),
            "table_row_count": table_counts.get(t, 0),
        }
        for t in VALID_MASTERDATA_TYPES
    ]


def get_latest_upload_content(conn: pyodbc.Connection, masterdata_type: str) -> dict | None:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT TOP 1 file_content, original_filename, version_number
        FROM dbo.masterdata_uploads
        WHERE masterdata_type = ? AND file_content IS NOT NULL
        ORDER BY version_number DESC, uploaded_at DESC
        """,
        masterdata_type,
    )
    row = cursor.fetchone()
    if not row:
        return None
    return {
        "file_content": bytes(row[0]),
        "original_filename": row[1],
        "version_number": row[2],
    }


# ---------------------------------------------------------------------------
# Validation stages
# ---------------------------------------------------------------------------

def _stage2(file_content: bytes, issues: list, header_row: int = 1) -> object | None:
    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_content), read_only=True, data_only=True)
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
        c2.execute(f"SELECT {pk_col} FROM {table}")  # noqa: S608
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


def _stage6(conn: pyodbc.Connection, masterdata_type: str, schema: dict,
            headers: list, data_rows: list, issues: list) -> None:
    header_set = set(headers)

    if masterdata_type == "line_resource_requirements":
        # Value rule: headcount_required >= 0 (team leaders may be 0)
        if "headcount_required" in header_set:
            for row_num, row_dict in data_rows:
                val = row_dict.get("headcount_required")
                if val is not None and _is_valid_decimal(val) and float(val) < 0:
                    issues.append({
                        "stage": 6, "stage_name": "BUSINESS_RULE_CHECK",
                        "severity": "BLOCKED", "field": "headcount_required", "row": row_num,
                        "message": f"Row {row_num}: headcount_required cannot be negative, got: {val}.",
                    })

        # Completeness: every active line must have every LINE-scope resource type
        c = conn.cursor()
        c.execute("SELECT line_code FROM dbo.lines WHERE is_active = 1")
        active_lines = {str(r[0]).strip() for r in c.fetchall()}

        c.execute("SELECT resource_type_code FROM dbo.resource_types WHERE scope = 'LINE' AND is_active = 1")
        required_types = {str(r[0]).strip() for r in c.fetchall()}

        if active_lines and required_types:
            uploaded_pairs = {
                (str(row.get("line_code", "")).strip(),
                 str(row.get("resource_type_code", "")).strip())
                for _, row in data_rows
                if row.get("line_code") and row.get("resource_type_code")
            }
            for line in sorted(active_lines):
                for rtype in sorted(required_types):
                    if (line, rtype) not in uploaded_pairs:
                        issues.append({
                            "stage": 6, "stage_name": "BUSINESS_RULE_CHECK",
                            "severity": "BLOCKED",
                            "field": "line_code",
                            "row": None,
                            "message": (
                                f"Missing row for line '{line}' + resource type '{rtype}'. "
                                f"Every active line must have a headcount_required entry "
                                f"for every LINE-scope resource type."
                            ),
                        })

    elif masterdata_type == "plant_resource_requirements":
        # Value rule: headcount_required >= 0
        if "headcount_required" in header_set:
            for row_num, row_dict in data_rows:
                val = row_dict.get("headcount_required")
                if val is not None and _is_valid_decimal(val) and float(val) < 0:
                    issues.append({
                        "stage": 6, "stage_name": "BUSINESS_RULE_CHECK",
                        "severity": "BLOCKED", "field": "headcount_required", "row": row_num,
                        "message": f"Row {row_num}: headcount_required cannot be negative, got: {val}.",
                    })

        # Completeness: every active plant must have every PLANT-scope resource type
        c = conn.cursor()
        c.execute("SELECT plant_code FROM dbo.plants WHERE is_active = 1")
        active_plants = {str(r[0]).strip() for r in c.fetchall()}

        c.execute("SELECT resource_type_code FROM dbo.resource_types WHERE scope = 'PLANT' AND is_active = 1")
        required_types = {str(r[0]).strip() for r in c.fetchall()}

        if active_plants and required_types:
            uploaded_pairs = {
                (str(row.get("plant_code", "")).strip(),
                 str(row.get("resource_type_code", "")).strip())
                for _, row in data_rows
                if row.get("plant_code") and row.get("resource_type_code")
            }
            for plant in sorted(active_plants):
                for rtype in sorted(required_types):
                    if (plant, rtype) not in uploaded_pairs:
                        issues.append({
                            "stage": 6, "stage_name": "BUSINESS_RULE_CHECK",
                            "severity": "BLOCKED",
                            "field": "plant_code",
                            "row": None,
                            "message": (
                                f"Missing row for plant '{plant}' + resource type '{rtype}'. "
                                f"Every active plant must have a headcount_required entry "
                                f"for every PLANT-scope resource type."
                            ),
                        })

    elif masterdata_type == "warehouse_capacity":
        # Value rule: max_pallet_capacity > 0
        if "max_pallet_capacity" in header_set:
            for row_num, row_dict in data_rows:
                val = row_dict.get("max_pallet_capacity")
                if val is not None and _is_valid_decimal(val) and float(val) <= 0:
                    issues.append({
                        "stage": 6, "stage_name": "BUSINESS_RULE_CHECK",
                        "severity": "BLOCKED", "field": "max_pallet_capacity", "row": row_num,
                        "message": f"Row {row_num}: max_pallet_capacity must be > 0, got: {val}.",
                    })

        # Completeness: must have a row for every active pack_type_code
        c = conn.cursor()
        c.execute("SELECT pack_type_code FROM dbo.pack_types WHERE is_active = 1")
        required_pack_types = {str(r[0]).strip() for r in c.fetchall()}

        uploaded_pack_types = {
            str(row.get("pack_type_code", "")).strip()
            for _, row in data_rows
            if row.get("pack_type_code")
        }
        missing_types = required_pack_types - uploaded_pack_types
        for pt in sorted(missing_types):
            issues.append({
                "stage": 6, "stage_name": "BUSINESS_RULE_CHECK",
                "severity": "BLOCKED", "field": "pack_type_code", "row": None,
                "message": (
                    f"Pack type '{pt}' is active in the system but has no row in this upload. "
                    f"Every active pack type must have a max_pallet_capacity entry."
                ),
            })

    elif masterdata_type == "line_pack_capabilities":
        # Value rules: pack_size_l and bottles_per_minute must be > 0
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
        "sku_masterdata":              _import_sku_masterdata,
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


def _import_sku_masterdata(conn, headers, data_rows, uploaded_by):
    """MERGE sku_masterdata rows into dbo.items.

    Uses MERGE (upsert) by item_code:
      - WHEN MATCHED: update all non-null attribute columns (COALESCE keeps existing values
        when a cell is blank — allows partial uploads that only update specific fields).
      - WHEN NOT MATCHED: insert a new item row.

    Never deletes rows from dbo.items — removals must be done manually.
    """
    header_set = set(headers)
    cursor = conn.cursor()
    count = 0

    for _, row in data_rows:
        item_code = _get_str(row, "item_code", header_set)
        if not item_code:
            continue

        item_description     = _get_str(row, "item_description",     header_set)
        abc_indicator        = _get_str(row, "abc_indicator",        header_set)
        mrp_type             = _get_str(row, "mrp_type",             header_set)
        pack_size_l          = _get_decimal(row, "pack_size_l",      header_set)
        moq                  = _get_decimal(row, "moq",              header_set)
        pack_type_code       = _get_str(row, "pack_type_code",       header_set)
        rounding_value       = _get_decimal(row, "rounding_value",   header_set)
        units_per_pallet     = int(rounding_value) if rounding_value is not None and rounding_value > 0 else None
        plant_code           = _get_str(row, "plant_code",           header_set)
        primary_line_code    = _get_str(row, "primary_line_code",    header_set)
        secondary_line_code  = _get_str(row, "secondary_line_code",  header_set)
        tertiary_line_code   = _get_str(row, "tertiary_line_code",   header_set)
        quaternary_line_code = _get_str(row, "quaternary_line_code", header_set)
        unit_cost            = _get_decimal(row, "unit_cost",        header_set)

        # sku_status: valid values 1, 2, 3
        sku_status: int | None = None
        raw_status = row.get("sku_status") if "sku_status" in header_set else None
        if raw_status is not None and str(raw_status).strip():
            from app.services.excel_utils import is_valid_int as _iv
            if _iv(raw_status) and int(float(raw_status)) in (1, 2, 3):
                sku_status = int(float(raw_status))

        cursor.execute(
            """
            MERGE dbo.items AS target
            USING (SELECT ? AS item_code) AS source
            ON target.item_code = source.item_code

            WHEN MATCHED THEN
                UPDATE SET
                    item_description     = COALESCE(?, target.item_description),
                    abc_indicator        = COALESCE(?, target.abc_indicator),
                    mrp_type             = COALESCE(?, target.mrp_type),
                    pack_size_l          = COALESCE(?, target.pack_size_l),
                    moq                  = COALESCE(?, target.moq),
                    pack_type_code       = COALESCE(?, target.pack_type_code),
                    sku_status           = COALESCE(?, target.sku_status),
                    units_per_pallet     = COALESCE(?, target.units_per_pallet),
                    plant_code           = COALESCE(?, target.plant_code),
                    primary_line_code    = COALESCE(?, target.primary_line_code),
                    secondary_line_code  = COALESCE(?, target.secondary_line_code),
                    tertiary_line_code   = COALESCE(?, target.tertiary_line_code),
                    quaternary_line_code = COALESCE(?, target.quaternary_line_code),
                    unit_cost            = COALESCE(?, target.unit_cost)

            WHEN NOT MATCHED THEN
                INSERT (
                    item_code, item_description, abc_indicator, mrp_type,
                    pack_size_l, moq, pack_type_code, sku_status, units_per_pallet,
                    plant_code, primary_line_code, secondary_line_code,
                    tertiary_line_code, quaternary_line_code, unit_cost
                )
                VALUES (
                    ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?
                );
            """,
            # MERGE key
            item_code,
            # UPDATE SET values (COALESCE pairs)
            item_description, abc_indicator, mrp_type,
            pack_size_l, moq, pack_type_code, sku_status, units_per_pallet,
            plant_code, primary_line_code, secondary_line_code,
            tertiary_line_code, quaternary_line_code, unit_cost,
            # INSERT values
            item_code, item_description, abc_indicator, mrp_type,
            pack_size_l, moq, pack_type_code, sku_status, units_per_pallet,
            plant_code, primary_line_code, secondary_line_code,
            tertiary_line_code, quaternary_line_code, unit_cost,
        )
        count += 1

    return count


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
    from app.services.excel_utils import to_bit
    if col not in header_set:
        return default
    return to_bit(row.get(col), default)
