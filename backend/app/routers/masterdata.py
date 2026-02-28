import io
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse

from app.database import get_connection
from app.services.auth_service import get_current_user
from app.services import masterdata_service
from app.services.template_service import generate_template

router = APIRouter(prefix="/masterdata", tags=["masterdata"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "masterdata")

# Types that have a downloadable Excel template (item_master comes from SAP — no template)
MASTERDATA_TEMPLATE_TYPES = frozenset([
    "line_pack_capabilities",
    "line_resource_requirements",
    "plant_resource_requirements",
    "warehouse_capacity",
    "item_status",
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
def download_masterdata_template(
    masterdata_type: str,
    current_user: dict = Depends(get_current_user),
):
    """Download an Excel template for the given masterdata type."""
    if masterdata_type not in MASTERDATA_TEMPLATE_TYPES:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No template available for '{masterdata_type}'. "
                "item_master is a SAP export — download it from SAP directly."
                if masterdata_type == "item_master"
                else f"Unknown masterdata type '{masterdata_type}'."
            ),
        )
    xlsx_bytes = generate_template(masterdata_type)
    filename = f"rccp_template_{masterdata_type}.xlsx"
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{masterdata_type}")
async def upload_masterdata(
    masterdata_type: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload and validate a masterdata file. BLOCKED issues reject the upload."""
    if masterdata_type not in masterdata_service.VALID_MASTERDATA_TYPES:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown masterdata type '{masterdata_type}'. "
                   f"Valid types: {sorted(masterdata_service.VALID_MASTERDATA_TYPES)}",
        )

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "upload.xlsx")[1] or ".xlsx"
    stored_name = f"{masterdata_type}_{uuid.uuid4().hex}{ext}"
    stored_path = os.path.join(UPLOAD_DIR, stored_name)

    contents = await file.read()
    with open(stored_path, "wb") as f:
        f.write(contents)

    conn = get_connection()
    try:
        result = masterdata_service.validate_and_import(
            conn,
            masterdata_type,
            stored_path,
            file.filename or stored_name,
            current_user["username"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

    if not result["success"]:
        # Clean up the rejected file
        try:
            os.remove(stored_path)
        except OSError:
            pass
        raise HTTPException(status_code=422, detail=result)

    return result
