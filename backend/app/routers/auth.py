from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import get_connection
from app.services.auth_service import verify_password, create_access_token

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/auth/login")
def login(request: LoginRequest):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT username, password_hash, role, is_active
            FROM dbo.users
            WHERE username = ?
            """,
            request.username,
        )
        row = cursor.fetchone()

        # Use the same error message for not-found and wrong-password
        # to avoid leaking which users exist
        if not row or not row[3]:  # row[3] = is_active
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if not verify_password(request.password, row[1]):  # row[1] = password_hash
            raise HTTPException(status_code=401, detail="Invalid credentials")

        # Record login time
        cursor.execute(
            "UPDATE dbo.users SET last_login_at = GETUTCDATE() WHERE username = ?",
            request.username,
        )
        conn.commit()

        token = create_access_token(row[0], row[2])  # username, role
        return {"access_token": token, "token_type": "bearer", "role": row[2]}
    finally:
        conn.close()
