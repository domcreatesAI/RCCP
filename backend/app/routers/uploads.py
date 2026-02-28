from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.database import get_connection
from app.services.auth_service import get_current_user
from app.services import batch_service, upload_service

router = APIRouter(prefix="/batches", tags=["uploads"])


@router.post("/{batch_id}/files")
def upload_file(
    batch_id: int,
    file_type: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if file_type not in upload_service.VALID_FILE_TYPES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Invalid file_type '{file_type}'. "
                f"Must be one of: {', '.join(sorted(upload_service.VALID_FILE_TYPES))}"
            ),
        )

    conn = get_connection()
    try:
        batch = batch_service.get_batch(conn, batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")

        return upload_service.save_upload(
            conn,
            batch_id,
            file_type,
            file,
            current_user["username"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/{batch_id}/files")
def list_files(batch_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    try:
        return upload_service.list_batch_files(conn, batch_id)
    finally:
        conn.close()
