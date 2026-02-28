from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import get_connection
from app.services.auth_service import get_current_user
from app.services import batch_service

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
        return batch
    finally:
        conn.close()
