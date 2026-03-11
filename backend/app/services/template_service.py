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
            ("maintenance_hours",       "Maintenance Hours",       "Scheduled maintenance time (hours). Required. Must be ≥ 0 — enter 0 if none.", "0.5"),
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
            ("available_hours",   "Available Hours",    "Total labour hours available (headcount × shift hours). Required. Must be ≥ 0.", "28.0"),
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
            "Upload an empty file (header row only) when there are no portfolio changes this cycle. "
            "initial_demand is required for NEW_LAUNCH rows (must be > 0) — leave blank for all other change types."
        ),
        "columns": [
            ("change_type",    "Change Type",    "Type of change. Must be one of: NEW_LAUNCH, DISCONTINUE, REFORMULATION, LINE_CHANGE, OTHER.",                      "NEW_LAUNCH"),
            ("effective_date", "Effective Date", "Date the change takes effect (DD/MM/YYYY).",                                                                       "01/04/2026"),
            ("item_code",      "Item Code",      "SKU / item code affected. Optional — leave blank for plant-wide or range changes.",                                 "101221"),
            ("description",    "Description",    "Brief description of the change. Optional.",                                                                       "New 1L SKU launch"),
            ("impact_notes",   "Impact Notes",   "Notes on capacity or planning impact. Optional.",                                                                   "Requires A101 line qualification"),
            ("initial_demand", "Initial Demand", "Expected initial demand quantity in eaches. Required for NEW_LAUNCH rows (must be > 0). Leave blank for all other change types.", "5000"),
        ],
        "sample_rows": [
            ["NEW_LAUNCH",  "01/04/2026", "101221", "New 1L SKU launch",      "Requires A101 line qualification", 5000],
            ["DISCONTINUE", "01/06/2026", "101233", "4L SKU discontinuation", "Run out existing stock first",     ""],
        ],
    },
    "master_stock": {
        "title": "Master Stock",
        "description": (
            "Period-opening stock levels by item and warehouse (SAP stock report). "
            "One row per item per warehouse. "
            "material must already exist in the SKU Masterdata — upload sku_masterdata first. "
            "SKU attributes (pack size, MRP type, line assignments etc.) are NOT read from "
            "this file — they come from the sku_masterdata upload."
        ),
        "columns": [
            ("material",             "Material",             "SAP material number. Must already exist in the SKU Masterdata (dbo.items). Required.",                      "100000"),
            ("plant",                "Plant",                "Warehouse code (e.g. UKP1, UKP3). Must match a warehouse in the masterdata. Required.",                    "UKP1"),
            ("unrestrictedstock",    "UnrestrictedStock",    "Total unrestricted stock in eaches. Required. Must be ≥ 0.",                                                "1200"),
            ("unrestricted_-_sales", "Unrestricted - Sales", "Stock available for sales (unrestricted minus allocated). Required. May be negative (back-orders).",        "800"),
            ("safety_stock",         "Safety Stock",         "Minimum target stock level in eaches. Required. Must be ≥ 0.",                                              "200"),
        ],
        "sample_rows": [
            ["100000", "UKP1", 1200, 800, 200],
            ["100000", "UKP3",  600, 600,   0],
            ["100001", "UKP1",    0,   0,  50],
        ],
    },
    "production_orders": {
        "title": "Production Orders (SAP COOIS Export)",
        "description": (
            "SAP COOIS production order export — planned orders (LA) and released/firmed orders (YPAC). "
            "Row 1 = field descriptions (amber, ignored by validator). Row 2 = column headers. Row 3+ = data. "
            "Export directly from SAP COOIS transaction and upload without modification. "
            "net_quantity is computed at import as MAX(0, order_quantity - delivered_quantity). "
            "production_line is expected for planned orders (LA); may be blank for released orders (YPAC) — "
            "blank lines generate a WARNING, not a BLOCKED."
        ),
        "columns": [
            ("order",                      "Order",                      "Unique SAP order number. Required.",                                                                  "5104801"),
            ("material",                   "Material",                   "SAP material number. Must match an item in the items masterdata. Required.",                         "100556"),
            ("material_description",       "Material description",       "SKU description from SAP. Optional — stored for reference only.",                                   "MOBIL BRAKE FLUID DOT4 AP C2/3 12x0.5L"),
            ("order_type",                 "Order Type",                 "LA = MRP planned order. YPAC = firmed or released order. Required.",                                 "LA"),
            ("mrp_controller",             "MRP controller",             "SAP MRP controller code (e.g. 005 = lubes, 006 = chemicals). Optional.",                            "006"),
            ("plant",                      "Plant",                      "SAP plant code. Must match a warehouse in the masterdata (e.g. UKP1). Required.",                   "UKP1"),
            ("order_quantity_(gmein)",     "Order quantity (GMEIN)",     "Total order quantity in eaches. Must be > 0. Required.",                                             "36480"),
            ("delivered_quantity_(gmein)", "Delivered quantity (GMEIN)", "Quantity already produced/delivered. Must be ≥ 0. net_quantity = MAX(0, order_qty - delivered_qty). Required.", "0"),
            ("unit_of_measure_(=gmein)",   "Unit of measure (=GMEIN)",   "Unit of measure (typically EA). Optional.",                                                          "EA"),
            ("basic_start_date",           "Basic start date",           "Date the order is scheduled to start production (DD/MM/YYYY or YYYY-MM-DD). Required.",              "27/03/2026"),
            ("basic_finish_date",          "Basic finish date",          "Expected completion date. Optional — not stored.",                                                   "30/03/2026"),
            ("system_status",              "System Status",              "REL = released, CRTD = firmed, blank = MRP proposal. Optional.",                                    ""),
            ("production_version",         "Production Version",         "SAP production version. Optional — not stored.",                                                    "0001"),
            ("entered_by",                 "Entered By",                 "SAP user who created the order. Optional — not stored.",                                            ""),
            ("production_line",            "Production line",            "Production line code (e.g. A304). Populated for LA orders by MRP; may be blank for YPAC. Optional.", "A304"),
        ],
        "sample_rows": [
            ["5104801", "100556", "MOBIL BRAKE FLUID DOT4 AP C2/3 12x0.5L", "LA",   "006", "UKP1", 36480, 0,     "EA", "27/03/2026", "30/03/2026", "",    "0001", "", "A304"],
            ["5104802", "100557", "MOBIL BRAKE FLUID DOT4 AP C2/3 12x1L",   "LA",   "006", "UKP1", 24000, 0,     "EA", "15/04/2026", "16/04/2026", "",    "0001", "", "A305"],
            ["5104750", "100558", "MOBIL HYDRAULIC OIL 68 12x0.5L",         "YPAC", "005", "UKP1", 12000, 8000,  "EA", "03/03/2026", "03/03/2026", "REL", "0001", "", ""],
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
    "sku_masterdata": {
        "title": "SKU Masterdata",
        "description": (
            "SKU (product) master attributes. Upload this BEFORE uploading any batch files. "
            "MERGE by item_code: new rows are inserted, existing rows are updated. "
            "Blank cells keep the existing value in the database — partial uploads are valid. "
            "Items are never deleted by this upload — contact an admin to deactivate a SKU. "
            "rounding_value maps to units_per_pallet (EA per pallet for warehouse capacity checks). "
            "primary_line_code is the preferred filling line; secondary through quaternary are "
            "capable alternatives (leave blank if not applicable)."
        ),
        "columns": [
            ("item_code",            "Item Code",             "SAP material number — unique key. Required.",                                                               "100000"),
            ("item_description",     "Item Description",      "Full SAP material description. Optional.",                                                                  "MOBIL BRAKE FLUID DOT4 12x0.5L"),
            ("abc_indicator",        "ABC Indicator",         "SAP ABC classification (A, B, C, or '#' if not set). Optional.",                                            "A"),
            ("mrp_type",             "MRP Type",              "SAP MRP planning type (e.g. ZN, PD, ND). Optional.",                                                        "ZN"),
            ("pack_size_l",          "Pack Size (L)",         "Pack volume in litres (e.g. 0.5, 1, 5, 60). Must be > 0 if provided. Optional.",                            "0.5"),
            ("moq",                  "MOQ",                   "Minimum order quantity in eaches. 0 = no minimum. Must be ≥ 0 if provided. Optional.",                      "240"),
            ("pack_type_code",       "Pack Type Code",        "Warehouse capacity category. Must match pack_types masterdata (SMALL_PACK, 60L, BARREL_200L, IBC). Optional.", "SMALL_PACK"),
            ("sku_status",           "SKU Status",            "SAP lifecycle status. 1 = In Design | 2 = Phasing Out | 3 = Obsolete. Optional.",                           "1"),
            ("rounding_value",       "Rounding Value",        "Units per pallet (EA per pallet). Used for warehouse capacity calculations. Must be > 0 if provided. Optional.", "120"),
            ("plant_code",           "Plant Code",            "Primary manufacturing plant code (e.g. P1). Must match plants masterdata. Optional.",                        "P1"),
            ("primary_line_code",    "Primary Line Code",     "Preferred filling line code (e.g. A101). Must match lines masterdata. Optional.",                            "A101"),
            ("secondary_line_code",  "Secondary Line Code",   "First alternative filling line. Must match lines masterdata. Optional.",                                     "A102"),
            ("tertiary_line_code",   "Tertiary Line Code",    "Second alternative filling line. Optional — leave blank if not applicable.",                                 ""),
            ("quaternary_line_code", "Quaternary Line Code",  "Third alternative filling line. Optional — leave blank if not applicable.",                                  ""),
            ("unit_cost",            "Unit Cost (£)",         "Standard cost per EA in GBP. Must be ≥ 0 if provided. Optional — leave blank until cost data is available.", "0.85"),
        ],
        "sample_rows": [
            ["100000", "MOBIL BRAKE FLUID DOT4 12x0.5L", "A", "ZN", 0.5, 240, "SMALL_PACK", 1, 120, "P1", "A101", "A102", "", "", 0.85],
            ["100001", "MOBIL BRAKE FLUID DOT4 12x1L",   "B", "ZN", 1.0, 120, "SMALL_PACK", 1,  96, "P1", "A101", "",     "", "",  0.90],
            ["100002", "MOBIL HYDRAULIC OIL 68 60L",     "C", "PD", 60,    1, "60L",        2,  20, "P1", "A202", "A203", "", "", 12.50],
        ],
    },
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
            ("bottles_per_minute", "Bottles per Minute",  "Fill rate for this line/pack combination. Required. Must be > 0.",                                     "80"),
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
            ("headcount_required", "Headcount Required",  "Number of people required for this role on this line. Must be ≥ 0 (TEAM_LEADER may be 0).", "3"),
        ],
        "sample_rows": [
            ["A101", "LINE_OPERATOR",  3],
            ["A101", "TEAM_LEADER",    1],
            ["A202", "LINE_OPERATOR",  4],
            ["A202", "TEAM_LEADER",    0],
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
            ("plant_code",         "Plant Code",          "Manufacturing plant code (e.g. P1, P2). Must exist in the masterdata.",           "P1"),
            ("resource_type_code", "Resource Type Code",  "Role code for a plant-level role (e.g. FORKLIFT_DRIVER, ROBOT_OPERATOR). Must exist in resource_types.", "FORKLIFT_DRIVER"),
            ("headcount_required", "Headcount Required",  "Number of people required for this role across the whole plant. Must be ≥ 0.",   "2"),
        ],
        "sample_rows": [
            ["P1", "FORKLIFT_DRIVER",   2],
            ["P1", "ROBOT_OPERATOR",    1],
            ["P1", "MATERIAL_HANDLER",  1],
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
        "material": 14, "plant": 10,
        "unrestrictedstock": 20, "unrestricted_-_sales": 22, "safety_stock": 14,
        # sku_masterdata columns
        "item_code": 14, "item_description": 38,
        "abc_indicator": 14, "mrp_type": 12, "pack_size_l": 14,
        "moq": 10, "pack_type_code": 18, "sku_status": 12,
        "rounding_value": 16, "plant_code": 14,
        "primary_line_code": 20, "secondary_line_code": 22,
        "tertiary_line_code": 20, "quaternary_line_code": 22,
        "unit_cost": 14,
        # portfolio_changes
        "initial_demand": 16,
        # demand_plan columns
        "material_id": 14, "mrp_area": 12, "version": 10, "req_type": 10,
        "version_active": 16, "req_plan": 10, "req_seg": 10, "uom": 8,
        "m03.2026": 12, "m04.2026": 12, "m05.2026": 12,
        # production_orders columns
        "order": 12, "material": 14, "material_description": 40,
        "order_type": 12, "mrp_controller": 16,
        "order_quantity_(gmein)": 24, "delivered_quantity_(gmein)": 26,
        "unit_of_measure_(=gmein)": 24, "basic_start_date": 18, "basic_finish_date": 18,
        "system_status": 14, "production_version": 18, "entered_by": 14, "production_line": 16,
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
