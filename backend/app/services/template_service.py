"""
Generates downloadable Excel templates for the 4 template-based planning files.

demand_plan comes from the SAP PIR export — the entry here shows the expected format for reference.
"""

import io
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# ---------------------------------------------------------------------------
# Template definitions
# Each entry: (header_label, column_key, description, sample_value)
# ---------------------------------------------------------------------------

TEMPLATES: dict[str, dict] = {
    "line_capacity_calendar": {
        "title": "Line Capacity Calendar",
        "description": (
            "One row per production line per day. "
            "Covers the full planning horizon (typically 12–18 months). "
            "planned_hours = total available hours after losses. "
            "All loss columns are optional — omit or leave blank if not applicable."
        ),
        "columns": [
            ("line_code",               "Line Code",               "Production line code (e.g. A101, A202). Must match a line in the masterdata.",  "A101"),
            ("calendar_date",           "Calendar Date",           "Date in DD/MM/YYYY format (e.g. 01/03/2026).",                                   "01/03/2026"),
            ("is_working_day",          "Is Working Day",          "1 = working day, 0 = non-working day (weekend, bank holiday).",                  "1"),
            ("planned_hours",           "Planned Hours",           "Total planned production hours for this line on this date (0–24). Required.",    "7.0"),
            ("maintenance_hours",       "Maintenance Hours",       "Scheduled maintenance time (hours). Optional — leave blank if none.",             "0.5"),
            ("public_holiday_hours",    "Public Holiday Hours",    "Public holiday loss (hours). Optional.",                                          "0"),
            ("planned_downtime_hours",  "Planned Downtime Hours",  "Other planned downtime (hours). Optional.",                                       "0"),
            ("other_loss_hours",        "Other Loss Hours",        "Any other losses not covered above (hours). Optional.",                           "0"),
            ("notes",                   "Notes",                   "Free text notes for this entry. Optional.",                                       ""),
        ],
        "sample_rows": [
            ["A101", "01/03/2026", 1, 7.0, 0.5, 0, 0, 0, ""],
            ["A101", "02/03/2026", 0, 0.0, 0,   0, 0, 0, "Weekend"],
            ["A202", "01/03/2026", 1, 7.0, 0,   0, 0, 0, ""],
        ],
    },
    "headcount_plan": {
        "title": "Headcount Plan",
        "description": (
            "Planned operator headcount per production line per day. "
            "One row per line per date. shift_code, available_hours and notes are optional."
        ),
        "columns": [
            ("line_code",         "Line Code",          "Production line code (e.g. A101). Must match a line in the masterdata.",         "A101"),
            ("plan_date",         "Plan Date",          "Date in DD/MM/YYYY format (e.g. 01/03/2026).",                                  "01/03/2026"),
            ("planned_headcount", "Planned Headcount",  "Number of operators planned for this line on this date. Required. Must be ≥ 0.", "4"),
            ("shift_code",        "Shift Code",         "Optional shift identifier (e.g. DAY, NIGHT, A, B). Leave blank if not used.",    "DAY"),
            ("available_hours",   "Available Hours",    "Total labour hours available (headcount × shift hours). Optional.",              "28.0"),
            ("notes",             "Notes",              "Free text notes. Optional.",                                                     ""),
        ],
        "sample_rows": [
            ["A101", "01/03/2026", 4, "DAY",   28.0, ""],
            ["A101", "02/03/2026", 0, "",      0,    "Weekend — no staffing"],
            ["A202", "01/03/2026", 3, "DAY",   21.0, ""],
        ],
    },
    "portfolio_changes": {
        "title": "Portfolio Changes",
        "description": (
            "New product launches, discontinuations or other portfolio changes within the planning horizon. "
            "This file is REQUIRED every cycle, but may contain zero data rows if there are no changes. "
            "Upload an empty file (header row only) when there are no portfolio changes this cycle."
        ),
        "columns": [
            ("change_type",   "Change Type",    "Type of change. Must be one of: NEW_LAUNCH, DISCONTINUE, REFORMULATION, LINE_CHANGE, OTHER.",  "NEW_LAUNCH"),
            ("effective_date","Effective Date", "Date the change takes effect (DD/MM/YYYY).",                                                   "01/04/2026"),
            ("item_code",     "Item Code",      "SKU / item code affected. Optional — leave blank for plant-wide or range changes.",             "101221"),
            ("description",   "Description",    "Brief description of the change. Optional.",                                                   "New 1L SKU launch"),
            ("impact_notes",  "Impact Notes",   "Notes on capacity or planning impact. Optional.",                                              "Requires A101 line qualification"),
        ],
        "sample_rows": [
            ["NEW_LAUNCH",    "01/04/2026", "101221", "New 1L SKU launch",          "Requires A101 line qualification"],
            ["DISCONTINUE",   "01/06/2026", "101233", "4L SKU discontinuation",     "Run out existing stock first"],
            ["REFORMULATION", "01/05/2026", "",       "Recipe change — all 60L SKUs", "Minor: no line change required"],
        ],
    },
    "master_stock": {
        "title": "Master Stock",
        "description": (
            "Period-opening stock levels by item and warehouse. "
            "One row per item per warehouse. "
            "MOQ and Item status are optional — leave blank to keep existing values. "
            "On a valid upload, items.mrp_type, items.units_per_pallet, items.pack_size_l, "
            "items.moq and items.sku_status are updated from this file."
        ),
        "columns": [
            ("material",             "Material",             "SAP material number. Must match an item in the items masterdata.",                                          "100000"),
            ("plant",                "Plant",                "Warehouse code (e.g. UKP1, UKP3). Must match a warehouse in the masterdata.",                              "UKP1"),
            ("abc_indicator",        "ABC Indicator",        "SAP ABC classification. Optional — stored for reference.",                                                 "#"),
            ("mrp_type",             "MRP Type",             "SAP MRP planning type (e.g. ZN, PD). Optional. Updates items.mrp_type.",                                  "ZN"),
            ("unrestrictedstock",    "UnrestrictedStock",    "Total unrestricted stock in eaches. Required. Must be ≥ 0.",                                               "1200"),
            ("unrestricted_-_sales", "Unrestricted - Sales", "Stock available after sales allocations. Required. May be negative (back-orders).",                        "800"),
            ("safety_stock",         "Safety Stock",         "Minimum target stock level in eaches. Optional. Must be ≥ 0 if provided.",                                "200"),
            ("rounding_value",       "Rounding value",       "Units per pallet. Optional. Must be ≥ 0 if provided. Updates items.units_per_pallet.",                    "120"),
            ("volume",               "Volume",               "Pack size in litres. Optional. Must be > 0 if provided. Updates items.pack_size_l.",                       "5"),
            ("moq",                  "MOQ",                  "Minimum order quantity in eaches. Optional — blank keeps existing value. 0 = no minimum.",                "240"),
            ("item_status",          "Item status",          "Lifecycle status. Optional — blank keeps existing value. 1 = In Design  |  2 = Phase Out  |  3 = Obsolete.", "1"),
        ],
        "sample_rows": [
            ["100000", "UKP1", "#", "ZN", 1200, 800, 200, 120, 5, 240, 1],
            ["100000", "UKP3", "#", "ZN",  600, 600,   0, 120, 5, 240, 1],
            ["100001", "UKP1", "#", "PD",    0,   0,  50,  96, 1, 120, 1],
        ],
    },
    "demand_plan": {
        "title": "Demand Plan (SAP PIR Export)",
        "description": (
            "SAP Planned Independent Requirements (PIR) export — wide format, one row per material per plant. "
            "Row 1 = field descriptions (amber, ignored by validator). Row 2 = column keys. Row 3+ = data. "
            "Columns material_id and plant are required. Columns mrp_area, version, req_type, version_active, "
            "req_plan, req_seg, uom are present in the export but ignored by the validator. "
            "Month columns follow in M{MM}.{YYYY} format (e.g. M03.2026) — always 12 months, columns J to U. "
            "Filter to UK plants (UKP1, UKP3) before uploading — non-UK plants will be rejected."
        ),
        "columns": [
            ("material_id",    "material_id",    "SAP material number. Must match an item in the items masterdata.",                                  "100000"),
            ("plant",          "plant",          "SAP plant code (UK only: UKP1, UKP3). Must match a warehouse in the masterdata.",                   "UKP1"),
            ("mrp_area",       "mrp_area",       "SAP MRP area — same as Plant in most cases. Present in export, ignored by validator.",              "UKP1"),
            ("version",        "version",        "SAP planning version. Present in export, ignored by validator.",                                    "00"),
            ("req_type",       "req_type",       "SAP requirement type (e.g. VSF = forecast). Present in export, ignored by validator.",              "VSF"),
            ("version_active", "version_active", "Whether this planning version is active. Present in export, ignored by validator.",                  "Yes"),
            ("req_plan",       "req_plan",       "SAP requirements plan. Usually blank. Present in export, ignored by validator.",                    ""),
            ("req_seg",        "req_seg",        "SAP requirements segment. Usually blank. Present in export, ignored by validator.",                  ""),
            ("uom",            "uom",            "Unit of measure (always EA). Present in export, ignored by validator.",                             "EA"),
            ("m03.2026",       "M03.2026",       "Demand quantity in eaches for March 2026. 12 monthly columns follow (M{MM}.{YYYY} format).",        500),
            ("m04.2026",       "M04.2026",       "Demand quantity in eaches for April 2026.",                                                         480),
            ("m05.2026",       "M05.2026",       "Demand quantity in eaches for May 2026 — continue for all 12 rolling months.",                      520),
        ],
        "sample_rows": [
            ["100000", "UKP1", "UKP1", "00", "VSF", "Yes", "", "", "EA", 500, 480, 520],
            ["100000", "UKP3", "UKP3", "00", "VSF", "Yes", "", "", "EA", 200, 190, 210],
            ["100001", "UKP1", "UKP1", "00", "VSF", "Yes", "", "", "EA",  60,  55,  70],
        ],
    },

    # ------------------------------------------------------------------
    # Masterdata templates (served via GET /api/masterdata/{type}/template)
    # ------------------------------------------------------------------
    "line_pack_capabilities": {
        "title": "Line Pack Capabilities",
        "description": (
            "Fill speeds, pack size capabilities, and OEE targets per production line. "
            "Each row = one line + pack size combination. "
            "bottles_per_minute, is_active, and oee_target are optional — leave blank to use system defaults. "
            "oee_target is the OEE assumption for this line/pack combination (e.g. 0.65 = 65%). "
            "If blank, the line-level OEE target is used instead. "
            "Upload replaces ALL existing line pack capability data."
        ),
        "columns": [
            ("line_code",          "Line Code",          "Production line code (e.g. A101). Must exist in the masterdata.",                                          "A101"),
            ("pack_size_l",        "Pack Size (L)",       "Pack size in litres (e.g. 1, 5, 60, 200). Must be > 0.",                                                  "1"),
            ("bottles_per_minute", "Bottles per Minute",  "Fill rate for this line/pack combination. Optional.",                                                     "80"),
            ("is_active",          "Is Active",           "1 = this capability is active, 0 = disabled. Optional — defaults to 1.",                                  "1"),
            ("oee_target",         "OEE Target",          "OEE target for this line/pack combination (0–1, e.g. 0.65 = 65%). Optional — leave blank for line default.", "0.65"),
        ],
        "sample_rows": [
            ["A101", 1,   80,  1, 0.65],
            ["A101", 5,   45,  1, 0.60],
            ["A202", 1,   95,  1, 0.70],
            ["A202", 60,  12,  1, 0.75],
        ],
    },
    "line_resource_requirements": {
        "title": "Line Resource Requirements",
        "description": (
            "Headcount required per resource role to run each production line. "
            "Each row = one line + resource type combination. "
            "resource_type_code must match a code in the resource_types masterdata table. "
            "Upload replaces ALL existing line resource requirement data."
        ),
        "columns": [
            ("line_code",          "Line Code",           "Production line code (e.g. A101). Must exist in the masterdata.",                    "A101"),
            ("resource_type_code", "Resource Type Code",  "Role code (e.g. LINE_OPERATOR, TEAM_LEADER). Must exist in resource_types.",         "LINE_OPERATOR"),
            ("headcount_required", "Headcount Required",  "Number of people required for this role on this line. Must be > 0.",                 "3"),
        ],
        "sample_rows": [
            ["A101", "LINE_OPERATOR",  3],
            ["A101", "TEAM_LEADER",    1],
            ["A202", "LINE_OPERATOR",  4],
            ["A202", "TEAM_LEADER",    1],
        ],
    },
    "plant_resource_requirements": {
        "title": "Plant Resource Requirements",
        "description": (
            "Shared headcount required per resource role per manufacturing plant. "
            "These are plant-level roles (e.g. forklift drivers, robot operators) shared across lines. "
            "resource_type_code must match a code in the resource_types masterdata table. "
            "Upload replaces ALL existing plant resource requirement data."
        ),
        "columns": [
            ("plant_code",         "Plant Code",          "Manufacturing plant code (e.g. A1, A2). Must exist in the masterdata.",           "A1"),
            ("resource_type_code", "Resource Type Code",  "Role code for a plant-level role (e.g. FORKLIFT_DRIVER, ROBOT_OPERATOR). Must exist in resource_types.", "FORKLIFT_DRIVER"),
            ("headcount_required", "Headcount Required",  "Number of people required for this role across the whole plant. Must be > 0.",    "2"),
        ],
        "sample_rows": [
            ["A1", "FORKLIFT_DRIVER",   2],
            ["A1", "ROBOT_OPERATOR",    1],
            ["A1", "MATERIAL_HANDLER",  1],
        ],
    },
    "warehouse_capacity": {
        "title": "Warehouse Capacity",
        "description": (
            "Maximum pallet positions per pack type per warehouse. "
            "Each row = one warehouse + pack type combination. "
            "warehouse_code must match a code in the warehouses masterdata table. "
            "pack_type_code must match a code in the pack_types masterdata table. "
            "Upload replaces ALL existing warehouse capacity data."
        ),
        "columns": [
            ("warehouse_code",     "Warehouse Code",      "Warehouse code (e.g. UKP1, UKP3, UKP4, UKP5). Must exist in the masterdata.",    "UKP1"),
            ("pack_type_code",     "Pack Type Code",      "Pack type (e.g. SMALL_PACK, 60L, BARREL_200L, IBC). Must exist in pack_types.", "SMALL_PACK"),
            ("max_pallet_capacity","Max Pallet Capacity", "Maximum number of pallet positions available for this pack type. Must be > 0.",  "500"),
        ],
        "sample_rows": [
            ["UKP1", "SMALL_PACK",   500],
            ["UKP1", "60L",          200],
            ["UKP1", "BARREL_200L",  150],
            ["UKP3", "SMALL_PACK",   300],
        ],
    },
}

# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------

_HEADER_FILL  = PatternFill("solid", fgColor="1E3A5F")   # Dark navy
_HEADER_FONT  = Font(color="FFFFFF", bold=True, size=10)
_DESC_FILL    = PatternFill("solid", fgColor="FFE066")   # Amber — delete before uploading
_DESC_FONT    = Font(color="7A5700", italic=True, size=9)
_SAMPLE_FONT  = Font(color="444444", size=10)
_THIN_BORDER  = Border(
    bottom=Side(style="thin", color="CCCCCC"),
)
_CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
_LEFT   = Alignment(horizontal="left",   vertical="center", wrap_text=True)


def generate_template(file_type: str) -> bytes:
    """Return an in-memory .xlsx file for the given file_type."""
    if file_type not in TEMPLATES:
        raise ValueError(f"No template defined for file_type '{file_type}'")

    spec = TEMPLATES[file_type]
    wb = Workbook()

    # --- Data sheet ---
    ws = wb.active
    ws.title = "Data"

    cols = spec["columns"]

    # Row 1: field descriptions (amber — validator ignores this row, do not delete)
    for col_idx, (key, label, desc, sample) in enumerate(cols, start=1):
        cell = ws.cell(row=1, column=col_idx, value=desc)
        cell.font = _DESC_FONT
        cell.fill = _DESC_FILL
        cell.alignment = _LEFT

    # Row 2: column keys — machine-readable header the validator reads
    for col_idx, (key, label, desc, sample) in enumerate(cols, start=1):
        cell = ws.cell(row=2, column=col_idx, value=key)
        cell.font = _HEADER_FONT
        cell.fill = _HEADER_FILL
        cell.alignment = _CENTER
        cell.border = _THIN_BORDER

    # Rows 3+: sample data rows
    for row_offset, sample_row in enumerate(spec["sample_rows"], start=3):
        for col_idx, val in enumerate(sample_row, start=1):
            cell = ws.cell(row=row_offset, column=col_idx, value=val)
            cell.font = _SAMPLE_FONT
            cell.alignment = _LEFT

    # Column widths
    col_widths = {
        "line_code": 12, "calendar_date": 16, "plan_date": 16,
        "effective_date": 16,
        "is_working_day": 16, "planned_hours": 16,
        "planned_headcount": 18, "shift_code": 12,
        "available_hours": 16, "oee_target": 14,
        "change_type": 18, "item_code": 14,
        "maintenance_hours": 20, "public_holiday_hours": 22,
        "planned_downtime_hours": 24, "other_loss_hours": 18,
        "description": 32, "impact_notes": 36, "notes": 28,
        # master_stock columns
        "material": 14, "plant": 10, "abc_indicator": 14, "mrp_type": 12,
        "unrestrictedstock": 20, "unrestricted_-_sales": 22, "safety_stock": 14,
        "rounding_value": 16, "volume": 10, "moq": 10, "item_status": 14,
        # demand_plan columns
        "material_id": 14, "mrp_area": 12, "version": 10, "req_type": 10,
        "version_active": 16, "req_plan": 10, "req_seg": 10, "uom": 8,
        "m03.2026": 12, "m04.2026": 12, "m05.2026": 12,
    }
    for col_idx, (key, *_) in enumerate(cols, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = col_widths.get(key, 18)

    # Freeze panes below header and description rows
    ws.freeze_panes = "A3"

    # --- Instructions sheet ---
    wi = wb.create_sheet("Instructions")
    wi.column_dimensions["A"].width = 100

    instructions = [
        (f"RCCP One — {spec['title']} Template", Font(bold=True, size=13)),
        ("", None),
        (spec["description"], Font(size=10)),
        ("", None),
        ("HOW TO USE THIS TEMPLATE", Font(bold=True, size=11)),
        ("1. Fill in your data on the 'Data' sheet starting from row 3.", Font(size=10)),
        ("2. Do NOT modify rows 1 or 2 — row 1 is field descriptions, row 2 is the column header the system reads.", Font(size=10)),
        ("3. Row 1 (amber/yellow) is ignored by the validator — leave it in as a reference or delete it if you prefer.", Font(size=10)),
        ("   WARNING: If you delete row 1, what was row 2 shifts to row 1 and the validator will fail to find column names.", Font(size=10)),
        ("4. Save as .xlsx before uploading.", Font(size=10)),
        ("", None),
        ("COLUMN REFERENCE", Font(bold=True, size=11)),
    ]
    for key, label, desc, sample in cols:
        instructions.append((f"  {key}  |  {label}  —  {desc}  (Example: {sample})", Font(size=10)))

    for row_idx, (text, font) in enumerate(instructions, start=1):
        cell = wi.cell(row=row_idx, column=1, value=text)
        if font:
            cell.font = font
        cell.alignment = _LEFT

    # Save to bytes
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()
