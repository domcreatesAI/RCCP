from fastapi import APIRouter, Depends, HTTPException

from app.database import get_connection
from app.services.auth_service import get_current_user
from app.services.rccp_engine import compute_dashboard

router = APIRouter(prefix="/rccp", tags=["rccp"])


@router.get("/{batch_id}/dashboard")
def get_rccp_dashboard(
    batch_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Compute and return the RCCP dashboard for a published batch."""
    conn = get_connection()
    try:
        return compute_dashboard(conn, batch_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
