from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import io

from app.database import get_connection
from app.services.template_service import generate_template, TEMPLATES

router = APIRouter(prefix="/templates", tags=["templates"])

TEMPLATE_FILE_TYPES = set(TEMPLATES.keys())


@router.get("/{file_type}")
def download_template(file_type: str):
    """Download a pre-filled Excel template for the given file type."""
    if file_type not in TEMPLATE_FILE_TYPES:
        raise HTTPException(
            status_code=404,
            detail=f"No template available for '{file_type}'. "
                   f"SAP export files (master_stock, demand_plan) do not have templates.",
        )
    # Pass a DB connection so dynamic templates (line_capacity_calendar full calendar,
    # resource-requirement skeletons) can be pre-populated from live masterdata.
    conn = get_connection()
    try:
        xlsx_bytes = generate_template(file_type, conn=conn)
    finally:
        conn.close()
    filename = f"rccp_template_{file_type}.xlsx"
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
