import shutil
from pathlib import Path

import pyodbc
from fastapi import UploadFile

from app.config import UPLOAD_DIR

VALID_FILE_TYPES = {
    "master_stock",
    "demand_plan",
    "line_capacity_calendar",
    "headcount_plan",
    "portfolio_changes",
    "production_orders",
}


def save_upload(
    conn: pyodbc.Connection,
    batch_id: int,
    file_type: str,
    file: UploadFile,
    uploaded_by: str | None,
) -> dict:
    cursor = conn.cursor()

    # Determine next version number
    cursor.execute(
        "SELECT COUNT(*) FROM dbo.import_batch_files WHERE batch_id = ? AND file_type = ?",
        batch_id,
        file_type,
    )
    version = cursor.fetchone()[0] + 1

    # Build destination path
    dest_dir = Path(UPLOAD_DIR) / str(batch_id) / file_type
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = f"v{version}_{file.filename}"
    dest_path = dest_dir / filename

    # Write file to disk (filesystem copy is needed by validation + publish pipeline)
    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    file_size = dest_path.stat().st_size
    file_content = dest_path.read_bytes()  # read back for reliable DB-backed download

    # Mark previous versions of this file_type as not current
    cursor.execute(
        """
        UPDATE dbo.import_batch_files
        SET is_current_version = 0
        WHERE batch_id = ? AND file_type = ?
        """,
        batch_id,
        file_type,
    )

    # Insert the new file record (file_content stored but not output — VARBINARY(MAX))
    cursor.execute(
        """
        INSERT INTO dbo.import_batch_files
            (batch_id, file_type, original_filename, stored_file_path,
             file_size_bytes, upload_version, uploaded_by, file_content)
        OUTPUT
            INSERTED.batch_file_id,
            INSERTED.batch_id,
            INSERTED.file_type,
            INSERTED.original_filename,
            INSERTED.stored_file_path,
            INSERTED.file_size_bytes,
            INSERTED.upload_version,
            INSERTED.is_current_version,
            INSERTED.validation_status,
            INSERTED.uploaded_by,
            INSERTED.uploaded_at
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        batch_id,
        file_type,
        file.filename,
        str(dest_path),
        file_size,
        version,
        uploaded_by,
        file_content,
    )
    row = cursor.fetchone()
    conn.commit()

    return {
        "batch_file_id": row[0],
        "batch_id": row[1],
        "file_type": row[2],
        "original_filename": row[3],
        "stored_file_path": row[4],
        "file_size_bytes": row[5],
        "upload_version": row[6],
        "is_current_version": bool(row[7]),
        "validation_status": row[8],
        "uploaded_by": row[9],
        "uploaded_at": str(row[10]),
    }


def get_file_record(conn: pyodbc.Connection, batch_file_id: int) -> dict | None:
    """Fetch a single file record by ID (used after validation to return updated status)."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT batch_file_id, batch_id, file_type, original_filename, stored_file_path,
               file_size_bytes, upload_version, is_current_version,
               validation_status, uploaded_by, uploaded_at
        FROM dbo.import_batch_files
        WHERE batch_file_id = ?
        """,
        batch_file_id,
    )
    r = cursor.fetchone()
    if not r:
        return None
    return {
        "batch_file_id": r[0],
        "batch_id": r[1],
        "file_type": r[2],
        "original_filename": r[3],
        "stored_file_path": r[4],
        "file_size_bytes": r[5],
        "upload_version": r[6],
        "is_current_version": bool(r[7]),
        "validation_status": r[8],
        "uploaded_by": r[9],
        "uploaded_at": str(r[10]) if r[10] else None,
    }


def list_batch_files(conn: pyodbc.Connection, batch_id: int) -> list:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            batch_file_id,
            batch_id,
            file_type,
            original_filename,
            stored_file_path,
            file_size_bytes,
            upload_version,
            is_current_version,
            validation_status,
            uploaded_by,
            uploaded_at
        FROM dbo.import_batch_files
        WHERE batch_id = ? AND is_current_version = 1
        ORDER BY file_type
        """,
        batch_id,
    )
    return [
        {
            "batch_file_id": r[0],
            "batch_id": r[1],
            "file_type": r[2],
            "original_filename": r[3],
            "stored_file_path": r[4],
            "file_size_bytes": r[5],
            "upload_version": r[6],
            "is_current_version": bool(r[7]),
            "validation_status": r[8],
            "uploaded_by": r[9],
            "uploaded_at": str(r[10]) if r[10] else None,
        }
        for r in cursor.fetchall()
    ]
