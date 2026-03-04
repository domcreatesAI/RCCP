from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import get_connection
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/baselines", tags=["baselines"])

_SELECT = """
    SELECT version_id, batch_id, version_name, version_type,
           is_active_baseline, created_by, created_at, locked_at
    FROM dbo.plan_versions
"""


def _row_to_dict(row) -> dict:
    return {
        "version_id": row[0],
        "batch_id": row[1],
        "version_name": row[2],
        "version_type": row[3],
        "is_active_baseline": bool(row[4]),
        "created_by": row[5],
        "created_at": str(row[6]),
        "locked_at": str(row[7]),
    }


class CreateBaselineRequest(BaseModel):
    batch_id: int
    version_name: str


@router.get("")
def list_baselines(current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(_SELECT + " ORDER BY created_at DESC")
        return [_row_to_dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()


@router.post("")
def create_baseline(
    request: CreateBaselineRequest,
    current_user: dict = Depends(get_current_user),
):
    if not request.version_name.strip():
        raise HTTPException(status_code=422, detail="version_name cannot be empty")

    conn = get_connection()
    try:
        cursor = conn.cursor()

        # Gate: batch must be PUBLISHED
        cursor.execute(
            "SELECT status FROM dbo.import_batches WHERE batch_id = ?",
            request.batch_id,
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Batch not found")
        if row[0] != "PUBLISHED":
            raise HTTPException(
                status_code=422,
                detail="Can only create a baseline from a PUBLISHED batch",
            )

        # Check no existing baseline for this batch (UNIQUE constraint on batch_id)
        cursor.execute(
            "SELECT version_id FROM dbo.plan_versions WHERE batch_id = ?",
            request.batch_id,
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=422,
                detail="A baseline already exists for this batch",
            )

        # Deactivate any existing active baseline
        cursor.execute(
            "UPDATE dbo.plan_versions SET is_active_baseline = 0 WHERE is_active_baseline = 1"
        )

        # Insert new baseline
        cursor.execute(
            """
            INSERT INTO dbo.plan_versions
                (batch_id, version_name, version_type, is_active_baseline, created_by)
            VALUES (?, ?, 'BASELINE', 1, ?)
            """,
            request.batch_id,
            request.version_name.strip(),
            current_user["username"],
        )

        conn.commit()

        cursor.execute(_SELECT + " WHERE batch_id = ?", request.batch_id)
        return _row_to_dict(cursor.fetchone())

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
