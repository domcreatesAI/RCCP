"""DB connection settings — admin-only.

Bootstrap config (the SQL Server host/IP) can't live in app_settings table
because it's the address of that table. Lives in .env. This router lets an
admin view and change DB_SERVER from the UI with a mandatory connection test.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import pyodbc

from app.services.auth_service import get_current_user, require_admin
from app.services import db_config_service

router = APIRouter(prefix="/db-config", tags=["db-config"])


class ServerBody(BaseModel):
    server: str


@router.get("")
def get_db_config(current_user: dict = Depends(get_current_user)):
    """Return the current SQL Server host. Visible to any signed-in user;
    only admins can edit (enforced on the PUT endpoint)."""
    return {
        "server": db_config_service.get_current_server(),
        "can_edit": current_user.get("role") == "admin",
    }


@router.post("/test")
def test_db_config(body: ServerBody, _user: dict = Depends(require_admin)):
    """Try a short-timeout connection against the proposed server. The current
    DB name/user/password are reused. Returns 200 on success; 400 with detail
    on failure. Required before PUT."""
    candidate = (body.server or "").strip()
    if not candidate:
        raise HTTPException(status_code=422, detail="Server cannot be empty")
    try:
        db_config_service.test_connection(candidate)
    except pyodbc.Error as e:
        raise HTTPException(status_code=400, detail=f"Connection test failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection test failed: {e}")
    return {"ok": True, "server": candidate}


@router.put("")
def update_db_config(body: ServerBody, _user: dict = Depends(require_admin)):
    """Persist the new DB_SERVER. Re-tests the connection before writing — if
    the test fails, .env is left untouched."""
    candidate = (body.server or "").strip()
    if not candidate:
        raise HTTPException(status_code=422, detail="Server cannot be empty")
    try:
        db_config_service.test_connection(candidate)
    except pyodbc.Error as e:
        raise HTTPException(status_code=400, detail=f"Connection test failed — not saved: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection test failed — not saved: {e}")

    try:
        db_config_service.update_server(candidate)
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Could not write .env: {e}")

    return {"server": candidate}
