import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse

from app.database import get_connection
from app.services.auth_service import get_current_user
from app.services import masterdata_service
from app.services.template_service import generate_template

router = APIRouter(prefix="/masterdata", tags=["masterdata"])

# Types that have a downloadable Excel template
MASTERDATA_TEMPLATE_TYPES = frozenset([
    "sku_masterdata",
    "line_pack_capabilities",
    "line_resource_requirements",
    "plant_resource_requirements",
    "warehouse_capacity",
])


@router.get("/status")
def get_masterdata_status(current_user: dict = Depends(get_current_user)):
    """Return last-upload info for all masterdata types."""
    conn = get_connection()
    try:
        return masterdata_service.get_status(conn)
    finally:
        conn.close()


@router.get("/{masterdata_type}/template")
def download_masterdata_template(masterdata_type: str):
    """Download an Excel template for the given masterdata type. No auth required — templates contain no sensitive data."""
    if masterdata_type not in MASTERDATA_TEMPLATE_TYPES:
        raise HTTPException(
            status_code=404,
            detail=f"No template available for masterdata type '{masterdata_type}'.",
        )
    xlsx_bytes = generate_template(masterdata_type)
    filename = f"rccp_template_{masterdata_type}.xlsx"
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{masterdata_type}/download")
def download_masterdata_file(
    masterdata_type: str,
    current_user: dict = Depends(get_current_user),
):
    """Download the most recently uploaded file for a given masterdata type (from DB)."""
    if masterdata_type not in masterdata_service.VALID_MASTERDATA_TYPES:
        raise HTTPException(status_code=404, detail=f"Unknown masterdata type '{masterdata_type}'")
    conn = get_connection()
    try:
        content = masterdata_service.get_latest_upload_content(conn, masterdata_type)
    finally:
        conn.close()
    if not content:
        raise HTTPException(status_code=404, detail="No uploaded file found for this type")
    filename = content["original_filename"] or f"{masterdata_type}.xlsx"
    return StreamingResponse(
        io.BytesIO(content["file_content"]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{masterdata_type}")
async def upload_masterdata(
    masterdata_type: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload and validate a masterdata file. BLOCKED issues reject the upload. File stored in DB — no filesystem write."""
    if masterdata_type not in masterdata_service.VALID_MASTERDATA_TYPES:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown masterdata type '{masterdata_type}'. "
                   f"Valid types: {sorted(masterdata_service.VALID_MASTERDATA_TYPES)}",
        )

    file_content = await file.read()

    conn = get_connection()
    try:
        result = masterdata_service.validate_and_import(
            conn,
            masterdata_type,
            file_content,
            file.filename or f"{masterdata_type}.xlsx",
            current_user["username"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

    if not result["success"]:
        raise HTTPException(status_code=422, detail=result)

    return result
