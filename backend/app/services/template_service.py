"""
Generates downloadable Excel templates for the 4 template-based planning files.

SAP files (master_stock, demand_plan) are not templated here — they come from SAP exports.
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
    "oee_daily": {
        "title": "OEE Daily",
        "description": (
            "Daily OEE actuals per production line. This file is OPTIONAL — "
            "if not uploaded, a WARNING is raised but the batch can still be published. "
            "All percentage values must be between 0 and 1 (e.g. 0.85 = 85%). "
            "availability_pct, performance_pct and quality_pct are optional components."
        ),
        "columns": [
            ("line_code",        "Line Code",        "Production line code. Must match a line in the masterdata.",                              "A101"),
            ("record_date",      "Record Date",      "Date of the OEE record (DD/MM/YYYY).",                                                   "28/02/2026"),
            ("oee_pct",          "OEE %",            "Composite OEE as a decimal between 0 and 1 (e.g. 0.72 = 72%). Required.",               "0.72"),
            ("availability_pct", "Availability %",   "Availability component (0–1). Optional.",                                                "0.90"),
            ("performance_pct",  "Performance %",    "Performance component (0–1). Optional.",                                                 "0.85"),
            ("quality_pct",      "Quality %",        "Quality component (0–1). Optional. Note: OEE ≈ A × P × Q.",                             "0.94"),
        ],
        "sample_rows": [
            ["A101", "28/02/2026", 0.72, 0.90, 0.85, 0.94],
            ["A202", "28/02/2026", 0.68, 0.88, 0.80, 0.97],
            ["A101", "27/02/2026", 0.75, 0.92, 0.87, 0.94],
        ],
    },

    # ------------------------------------------------------------------
    # SAP export reference templates — placeholders until SAP column
    # names are confirmed. Served via GET /api/templates/{file_type}.
    # ------------------------------------------------------------------
    "master_stock": {
        "title": "Master Stock (SAP Export)",
        "description": (
            "PLACEHOLDER TEMPLATE — column names must be confirmed against the actual SAP stock report. "
            "One row per item per warehouse location. "
            "Export from SAP transaction MB52 or equivalent stock overview report. "
            "Upload at the start of each planning cycle before running validation."
        ),
        "columns": [
            ("item_code",        "Item Code",         "SAP material number (e.g. 101221). Must match an item in the masterdata.",                      "101221"),
            ("warehouse_code",   "Warehouse Code",    "Storage location / warehouse (e.g. UKP1, UKP3). Must match a warehouse in the masterdata.",     "UKP1"),
            ("quantity_on_hand", "Quantity On Hand",  "Total stock on hand in eaches (EA) including allocated stock. Must be ≥ 0.",                    "1200"),
            ("free_stock_ea",    "Free Stock (EA)",   "Unallocated / unrestricted stock in eaches. Must be ≥ 0.",                                       "800"),
            ("total_stock_ea",   "Total Stock (EA)",  "Total stock including restricted/allocated. Must be ≥ 0. Can equal quantity_on_hand.",           "1200"),
            ("safety_stock_ea",  "Safety Stock (EA)", "Minimum stock target in eaches. Optional — leave blank if not used.",                            "200"),
        ],
        "sample_rows": [
            ["101221", "UKP1", 1200, 800, 1200, 200],
            ["101322", "UKP1",  600, 600,  600,  50],
            ["101233", "UKP3",  300, 300,  300,   0],
        ],
    },
    "demand_plan": {
        "title": "Demand Plan (SAP Export)",
        "description": (
            "PLACEHOLDER TEMPLATE — column names must be confirmed against the actual SAP demand planning report. "
            "One row per item per warehouse per month. "
            "Export from SAP transaction MD73 or equivalent demand planning report. "
            "Covers the full planning horizon (typically 12–18 months forward)."
        ),
        "columns": [
            ("item_code",       "Item Code",       "SAP material number (e.g. 101221). Must match an item in the masterdata.",                  "101221"),
            ("warehouse_code",  "Warehouse Code",  "Storage location / warehouse (e.g. UKP1, UKP3). Must match a warehouse in the masterdata.", "UKP1"),
            ("plan_month",      "Plan Month",      "First day of the planning month in DD/MM/YYYY format (e.g. 01/03/2026).",                   "01/03/2026"),
            ("demand_quantity", "Demand Quantity", "Forecast demand for this item/warehouse/month in eaches (EA). Must be ≥ 0.",                "500"),
        ],
        "sample_rows": [
            ["101221", "UKP1", "01/03/2026", 500],
            ["101221", "UKP1", "01/04/2026", 480],
            ["101322", "UKP3", "01/03/2026", 200],
        ],
    },

    # ------------------------------------------------------------------
    # Item master — SAP export reference template (placeholder)
    # Served via GET /api/masterdata/item_master/template
    # ------------------------------------------------------------------
    "item_master": {
        "title": "Item Master (SAP Export)",
        "description": (
            "PLACEHOLDER TEMPLATE — column names must be confirmed against the actual SAP item master report. "
            "One row per item. Used to update MOQ, units per pallet, and MRP type on existing items. "
            "Items not present in the file are left unchanged. "
            "Export from SAP transaction MM60 or equivalent material master report."
        ),
        "columns": [
            ("item_code",       "Item Code",        "SAP material number (e.g. 101221). Must already exist in the RCCP item masterdata.",                       "101221"),
            ("moq",             "MOQ",              "Minimum order quantity in eaches. Optional — leave blank to leave unchanged. Must be > 0 if provided.",    "240"),
            ("units_per_pallet","Units Per Pallet", "Pack units per full pallet. Optional — leave blank to leave unchanged. Must be > 0 if provided.",          "120"),
            ("mrp_type",        "MRP Type",         "SAP MRP planning type (e.g. PD, VB, ND). Optional — leave blank to leave unchanged.",                     "PD"),
        ],
        "sample_rows": [
            ["101221", 240,  None, "PD"],
            ["101322", 120, 120,  "PD"],
            ["101233", 240,  None, "VB"],
        ],
    },

    # ------------------------------------------------------------------
    # Masterdata templates (served via GET /api/masterdata/{type}/template)
    # ------------------------------------------------------------------
    "line_pack_capabilities": {
        "title": "Line Pack Capabilities",
        "description": (
            "Fill speeds and pack size capabilities per production line. "
            "Each row = one line + pack size combination. "
            "bottles_per_minute and is_active are optional — leave blank to use system defaults. "
            "Upload replaces ALL existing line pack capability data."
        ),
        "columns": [
            ("line_code",          "Line Code",          "Production line code (e.g. A101). Must exist in the masterdata.", "A101"),
            ("pack_size_l",        "Pack Size (L)",       "Pack size in litres (e.g. 1, 5, 60, 200). Must be > 0.",         "1"),
            ("bottles_per_minute", "Bottles per Minute",  "Fill rate for this line/pack combination. Optional.",            "80"),
            ("is_active",          "Is Active",           "1 = this capability is active, 0 = disabled. Optional — defaults to 1.", "1"),
        ],
        "sample_rows": [
            ["A101", 1,   80,  1],
            ["A101", 5,   45,  1],
            ["A202", 1,   95,  1],
            ["A202", 60,  12,  1],
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
            ("line_code",          "Line Code",           "Production line code (e.g. A101). Must exist in the masterdata.",        "A101"),
            ("resource_type_code", "Resource Type Code",  "Role code (e.g. LINE_OP, TEAM_LEAD). Must exist in resource_types.",     "LINE_OP"),
            ("headcount_required", "Headcount Required",  "Number of people required for this role on this line. Must be > 0.",     "2"),
        ],
        "sample_rows": [
            ["A101", "LINE_OP",    2],
            ["A101", "TEAM_LEAD",  1],
            ["A202", "LINE_OP",    3],
            ["A202", "TEAM_LEAD",  1],
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
            ("plant_code",         "Plant Code",          "Manufacturing plant code (e.g. A1, A2). Must exist in the masterdata.",  "A1"),
            ("resource_type_code", "Resource Type Code",  "Role code for a plant-level role. Must exist in resource_types.",        "FORKLIFT"),
            ("headcount_required", "Headcount Required",  "Number of people required for this role across the whole plant. Must be > 0.", "2"),
        ],
        "sample_rows": [
            ["A1", "FORKLIFT",   2],
            ["A1", "ROBOT_OP",   1],
            ["A2", "FORKLIFT",   1],
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
    "item_status": {
        "title": "Item Status",
        "description": (
            "Material lifecycle status for each SKU. "
            "SAP item master exports do not include material status, so this is uploaded separately. "
            "Only upload items whose status has changed — or upload a full list to reset all statuses. "
            "Valid values: 1 = In Design, 2 = Phase Out, 3 = Obsolete. "
            "Upload updates sku_status on matching items (items not in the file are unchanged)."
        ),
        "columns": [
            ("item_code",  "Item Code",  "SAP material number / item code. Must exist in the items masterdata.", "101221"),
            ("sku_status", "SKU Status", "1 = In Design  |  2 = Phase Out  |  3 = Obsolete",                    "2"),
        ],
        "sample_rows": [
            ["101221", 1],
            ["101233", 2],
            ["101240", 3],
        ],
    },
}

# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------

_HEADER_FILL  = PatternFill("solid", fgColor="1E3A5F")   # Dark navy
_HEADER_FONT  = Font(color="FFFFFF", bold=True, size=10)
_DESC_FILL    = PatternFill("solid", fgColor="EBF0F7")   # Light blue-grey
_DESC_FONT    = Font(color="555555", italic=True, size=9)
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
    n_cols = len(cols)

    # Row 1: column keys (machine-readable header — this is what the validator reads)
    for col_idx, (key, label, desc, sample) in enumerate(cols, start=1):
        cell = ws.cell(row=1, column=col_idx, value=key)
        cell.font = _HEADER_FONT
        cell.fill = _HEADER_FILL
        cell.alignment = _CENTER
        cell.border = _THIN_BORDER

    # Row 2: descriptions (light grey guidance row)
    for col_idx, (key, label, desc, sample) in enumerate(cols, start=1):
        cell = ws.cell(row=2, column=col_idx, value=desc)
        cell.font = _DESC_FONT
        cell.fill = _DESC_FILL
        cell.alignment = _LEFT
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
        "record_date": 16, "effective_date": 16,
        "is_working_day": 16, "planned_hours": 16,
        "planned_headcount": 18, "shift_code": 12,
        "available_hours": 16, "oee_pct": 10,
        "availability_pct": 16, "performance_pct": 16, "quality_pct": 14,
        "change_type": 18, "item_code": 14,
        "maintenance_hours": 20, "public_holiday_hours": 22,
        "planned_downtime_hours": 24, "other_loss_hours": 18,
        "description": 32, "impact_notes": 36, "notes": 28,
    }
    for col_idx, (key, *_) in enumerate(cols, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = col_widths.get(key, 18)

    ws.row_dimensions[2].height = 48  # Description row taller for readability

    # Freeze panes below header + description rows
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
        ("2. Do NOT modify the column headers in row 1 — the system reads them exactly.", Font(size=10)),
        ("3. Row 2 (grey) contains column descriptions — you may delete it before uploading, but it's not required.", Font(size=10)),
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
