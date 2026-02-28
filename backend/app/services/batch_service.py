from datetime import date
import pyodbc


def create_batch(
    conn: pyodbc.Connection,
    batch_name: str,
    plan_cycle_date: date,
    created_by: str | None,
) -> dict:
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO dbo.import_batches (batch_name, plan_cycle_date, created_by)
        OUTPUT
            INSERTED.batch_id,
            INSERTED.batch_name,
            INSERTED.plan_cycle_date,
            INSERTED.status,
            INSERTED.created_by,
            INSERTED.created_at
        VALUES (?, ?, ?)
        """,
        batch_name,
        plan_cycle_date,
        created_by,
    )
    row = cursor.fetchone()
    conn.commit()
    return {
        "batch_id": row[0],
        "batch_name": row[1],
        "plan_cycle_date": str(row[2]),
        "status": row[3],
        "created_by": row[4],
        "created_at": str(row[5]),
    }


def list_batches(conn: pyodbc.Connection) -> list:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT batch_id, batch_name, plan_cycle_date, status, created_by, created_at
        FROM dbo.import_batches
        ORDER BY created_at DESC
        """
    )
    return [
        {
            "batch_id": r[0],
            "batch_name": r[1],
            "plan_cycle_date": str(r[2]),
            "status": r[3],
            "created_by": r[4],
            "created_at": str(r[5]),
        }
        for r in cursor.fetchall()
    ]


def get_batch(conn: pyodbc.Connection, batch_id: int) -> dict | None:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT batch_id, batch_name, plan_cycle_date, status, notes,
               created_by, created_at, published_at, published_by
        FROM dbo.import_batches
        WHERE batch_id = ?
        """,
        batch_id,
    )
    row = cursor.fetchone()
    if not row:
        return None
    return {
        "batch_id": row[0],
        "batch_name": row[1],
        "plan_cycle_date": str(row[2]),
        "status": row[3],
        "notes": row[4],
        "created_by": row[5],
        "created_at": str(row[6]),
        "published_at": str(row[7]) if row[7] else None,
        "published_by": row[8],
    }


def get_batch_file_status(conn: pyodbc.Connection, batch_id: int) -> list:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            batch_file_id,
            file_type,
            original_filename,
            upload_version,
            validation_status,
            blocked_count,
            warning_count,
            info_count,
            uploaded_by,
            uploaded_at
        FROM dbo.vw_batch_file_status
        WHERE batch_id = ?
          AND batch_file_id IS NOT NULL
        ORDER BY file_type
        """,
        batch_id,
    )
    return [
        {
            "batch_file_id": r[0],
            "file_type": r[1],
            "original_filename": r[2],
            "upload_version": r[3],
            "validation_status": r[4],
            "blocked_count": r[5],
            "warning_count": r[6],
            "info_count": r[7],
            "uploaded_by": r[8],
            "uploaded_at": str(r[9]) if r[9] else None,
        }
        for r in cursor.fetchall()
    ]
