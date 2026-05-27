import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.database import get_connection
from app.services.auth_service import get_current_user
from app.services.rccp_engine import compute_dashboard
from app.services.sop_export_service import workbook_bytes

router = APIRouter(prefix="/rccp", tags=["rccp"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


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


@router.get("/{batch_id}/verification.xlsx")
def download_verification_excel(
    batch_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Download the S&OP verification workbook for a published or archived batch."""
    conn = get_connection()
    try:
        dash = compute_dashboard(conn, batch_id, allowed_statuses=("PUBLISHED", "ARCHIVED"))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

    xlsx = workbook_bytes(dash, horizon_months=12)
    cycle = dash["plan_cycle_date"][:7]
    filename = f"sop_verification_batch{batch_id}_{cycle}.xlsx"
    return StreamingResponse(
        io.BytesIO(xlsx),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
