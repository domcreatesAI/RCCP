from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import get_connection
from app.services.auth_service import get_current_user, require_admin
from app.services import settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingUpdate(BaseModel):
    value: str


@router.get("")
def list_settings(current_user: dict = Depends(get_current_user)):
    """List the managed settings with their current values."""
    conn = get_connection()
    try:
        return {
            "settings": settings_service.list_managed(conn),
            "can_edit": current_user.get("role") == "admin",
        }
    finally:
        conn.close()


@router.get("/line-oee")
def list_line_oee(current_user: dict = Depends(get_current_user)):
    """List every line's OEE target (maintained here, used by the engine)."""
    conn = get_connection()
    try:
        return {
            "lines": settings_service.list_line_oee(conn),
            "can_edit": current_user.get("role") == "admin",
        }
    finally:
        conn.close()


@router.put("/line-oee/{line_code}")
def update_line_oee(line_code: str, body: SettingUpdate, current_user: dict = Depends(require_admin)):
    """Set a single line's OEE (admin only). Value is a fraction 0.05–1.0."""
    try:
        num = float((body.value or "").strip())
    except ValueError:
        raise HTTPException(status_code=422, detail="Value must be a number")
    if not (0.05 <= num <= 1.0):
        raise HTTPException(status_code=422, detail="OEE must be between 0.05 and 1.0")

    conn = get_connection()
    try:
        settings_service.update_line_oee(conn, line_code, num)
        return {"line_code": line_code, "oee_target": num}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        conn.close()


@router.put("/{key}")
def update_setting(key: str, body: SettingUpdate, current_user: dict = Depends(require_admin)):
    """Update a managed setting (admin only). Validates type & range."""
    reg = settings_service.registry_for(key)
    if reg is None:
        raise HTTPException(status_code=404, detail=f"Unknown setting '{key}'")

    raw = (body.value or "").strip()
    try:
        num = float(raw)
    except ValueError:
        raise HTTPException(status_code=422, detail="Value must be a number")

    lo, hi = reg.get("min"), reg.get("max")
    if (lo is not None and num < lo) or (hi is not None and num > hi):
        raise HTTPException(status_code=422, detail=f"Value must be between {lo} and {hi}")

    conn = get_connection()
    try:
        settings_service.update_value(conn, key, raw, updated_by=current_user.get("username"))
        return {"key": key, "value": raw}
    finally:
        conn.close()
