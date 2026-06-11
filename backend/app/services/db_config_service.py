"""Manage the live DB_SERVER value used by app.database.

The SQL Server host/IP is bootstrap configuration — it can't live in the
database itself (chicken-and-egg). It lives in backend/.env, which is loaded
into app.config at process startup.

This service lets an admin update DB_SERVER at runtime without restarting:
- `test_connection` opens a short-timeout pyodbc connection to a candidate
  host using the rest of the current config; that's the safety gate before
  any save.
- `update_server` rewrites the DB_SERVER line in .env atomically and updates
  app.config.DB_SERVER in-process, so subsequent get_connection() calls use
  the new host.
"""

from __future__ import annotations

import os
from pathlib import Path

import pyodbc

from app import config


# .env sits next to the backend/ folder root (same as load_dotenv path in config.py)
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"


def get_current_server() -> str:
    return config.DB_SERVER


def test_connection(server: str, timeout_seconds: int = 5) -> None:
    """Open a one-shot connection against `server` using the current name/user/password.

    Raises pyodbc.Error (or similar) on failure. Returns nothing on success.
    """
    conn_str = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={server};"
        f"DATABASE={config.DB_NAME};"
        f"UID={config.DB_USER};"
        f"PWD={config.DB_PASSWORD};"
        f"Connection Timeout={timeout_seconds};"
    )
    conn = pyodbc.connect(conn_str, timeout=timeout_seconds)
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
    finally:
        conn.close()


def _rewrite_env_db_server(new_value: str) -> None:
    """Atomically replace the DB_SERVER=… line in .env, or append it if absent."""
    if not ENV_PATH.exists():
        raise FileNotFoundError(f".env file not found at {ENV_PATH}")

    text = ENV_PATH.read_text(encoding="utf-8")
    lines = text.splitlines()
    found = False
    out: list[str] = []
    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith("DB_SERVER=") or stripped.startswith("DB_SERVER ="):
            out.append(f"DB_SERVER={new_value}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"DB_SERVER={new_value}")

    new_text = "\n".join(out)
    # Preserve trailing newline if the original had one
    if text.endswith("\n"):
        new_text += "\n"

    tmp_path = ENV_PATH.with_suffix(".env.tmp")
    tmp_path.write_text(new_text, encoding="utf-8")
    os.replace(tmp_path, ENV_PATH)


def update_server(new_value: str) -> None:
    """Persist the new DB_SERVER to .env and update the in-process config.

    Caller must have already verified the value with `test_connection` — this
    function does NOT re-test.
    """
    cleaned = (new_value or "").strip()
    if not cleaned:
        raise ValueError("DB_SERVER cannot be empty")

    _rewrite_env_db_server(cleaned)
    # Reflect immediately so the next get_connection() picks it up
    config.DB_SERVER = cleaned
