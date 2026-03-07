import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from app.database import get_connection
from app.services.auth_service import get_current_user
from app.services import batch_service, validation_service, publish_service

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


@router.post("/{batch_id}/publish")
def publish_batch(batch_id: int, current_user: dict = Depends(get_current_user)):
    """Publish a batch: gate check, import planning data, set status to PUBLISHED."""
    conn = get_connection()
    try:
        result = publish_service.publish_batch(conn, batch_id, current_user["username"])
        result["files"] = batch_service.get_batch_file_status(conn, batch_id)
        result["validation_stages"] = batch_service.get_validation_stage_summary(conn, batch_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/{batch_id}/files/{file_type}/download")
def download_batch_file(
    batch_id: int,
    file_type: str,
    current_user: dict = Depends(get_current_user),
):
    """Download the currently uploaded file for a given file type (from DB; filesystem fallback for pre-migration rows)."""
    conn = get_connection()
    try:
        info = batch_service.get_current_file_for_download(conn, batch_id, file_type)
        if not info:
            raise HTTPException(status_code=404, detail="No uploaded file found for this type")
        filename = info["original_filename"] or f"{file_type}.xlsx"
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if info.get("file_content"):
            return StreamingResponse(
                io.BytesIO(info["file_content"]),
                media_type=media_type,
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )
        # Fall back to filesystem for rows uploaded before migration 17
        if info.get("stored_file_path"):
            return FileResponse(
                path=info["stored_file_path"],
                filename=filename,
                media_type=media_type,
            )
        raise HTTPException(status_code=404, detail="File content not available")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/{batch_id}/coverage-report")
def get_coverage_report(batch_id: int, current_user: dict = Depends(get_current_user)):
    """
    Return stage 8 cross-file check findings for a batch, grouped by category.
    Results are WARNING-only and do not affect publish eligibility.
    """
    conn = get_connection()
    try:
        batch = batch_service.get_batch(conn, batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        return batch_service.get_coverage_report(conn, batch_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/{batch_id}/files")
def reset_batch_files(
    batch_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Delete all uploaded files for a batch and reset its status to DRAFT."""
    conn = get_connection()
    try:
        batch = batch_service.get_batch(conn, batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        if batch["status"] == "PUBLISHED":
            raise HTTPException(status_code=422, detail="Cannot reset a published batch")
        count = batch_service.reset_batch_files(conn, batch_id)
        return {"deleted": count}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
