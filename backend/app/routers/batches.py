from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import get_connection
from app.services.auth_service import get_current_user
from app.services import batch_service, validation_service

router = APIRouter(prefix="/batches", tags=["batches"])


class CreateBatchRequest(BaseModel):
    batch_name: str
    plan_cycle_date: date


@router.post("")
def create_batch(
    request: CreateBatchRequest,
    current_user: dict = Depends(get_current_user),
):
    if request.plan_cycle_date.day != 1:
        raise HTTPException(
            status_code=422,
            detail="plan_cycle_date must be the 1st of the month",
        )
    conn = get_connection()
    try:
        return batch_service.create_batch(
            conn,
            request.batch_name,
            request.plan_cycle_date,
            current_user["username"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("")
def list_batches(current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    try:
        return batch_service.list_batches(conn)
    finally:
        conn.close()


@router.get("/{batch_id}")
def get_batch(batch_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    try:
        batch = batch_service.get_batch(conn, batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        batch["files"] = batch_service.get_batch_file_status(conn, batch_id)
        batch["validation_stages"] = batch_service.get_validation_stage_summary(conn, batch_id)
        return batch
    finally:
        conn.close()


@router.post("/{batch_id}/validate")
def validate_batch(batch_id: int, current_user: dict = Depends(get_current_user)):
    """Re-run validation on all current-version files in the batch."""
    conn = get_connection()
    try:
        batch = batch_service.get_batch(conn, batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")

        files = batch_service.get_current_files_for_validation(conn, batch_id)
        for f in files:
            validation_service.run_validation(
                conn,
                batch_id,
                f["batch_file_id"],
                f["file_type"],
                f["stored_file_path"],
            )

        batch["files"] = batch_service.get_batch_file_status(conn, batch_id)
        batch["validation_stages"] = batch_service.get_validation_stage_summary(conn, batch_id)
        return batch
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
