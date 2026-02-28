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


def get_current_files_for_validation(conn: pyodbc.Connection, batch_id: int) -> list:
    """Return batch_file_id, file_type, stored_file_path for all current-version files."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT batch_file_id, file_type, stored_file_path
        FROM dbo.import_batch_files
        WHERE batch_id = ? AND is_current_version = 1
        """,
        batch_id,
    )
    return [
        {"batch_file_id": r[0], "file_type": r[1], "stored_file_path": r[2]}
        for r in cursor.fetchall()
    ]


def get_validation_stage_summary(conn: pyodbc.Connection, batch_id: int) -> list:
    """Return worst severity per validation stage across all current-version files."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            ivr.validation_stage,
            ivr.stage_name,
            MAX(CASE
                WHEN ivr.severity = 'BLOCKED' THEN 3
                WHEN ivr.severity = 'WARNING' THEN 2
                WHEN ivr.severity = 'INFO'    THEN 1
                ELSE 0
            END) AS severity_rank
        FROM dbo.import_validation_results ivr
        JOIN dbo.import_batch_files ibf ON ivr.batch_file_id = ibf.batch_file_id
        WHERE ibf.batch_id = ?
          AND ibf.is_current_version = 1
        GROUP BY ivr.validation_stage, ivr.stage_name
        ORDER BY ivr.validation_stage
        """,
        batch_id,
    )
    rank_map = {3: "BLOCKED", 2: "WARNING", 1: "INFO", 0: "PASS"}
    return [
        {"stage": r[0], "name": r[1], "severity": rank_map.get(r[2], "PASS")}
        for r in cursor.fetchall()
    ]


def get_batch_file_status(conn: pyodbc.Connection, batch_id: int) -> list:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            v.batch_file_id,
            v.file_type,
            v.original_filename,
            v.upload_version,
            v.validation_status,
            v.blocked_count,
            v.warning_count,
            v.info_count,
            v.uploaded_by,
            v.uploaded_at,
            (
                SELECT TOP 1 ivr2.stage_name + N' — ' + ivr2.message
                FROM dbo.import_validation_results ivr2
                WHERE ivr2.batch_file_id = v.batch_file_id
                  AND ivr2.severity <> 'PASS'
                ORDER BY
                    CASE ivr2.severity
                        WHEN 'BLOCKED' THEN 1
                        WHEN 'WARNING' THEN 2
                        WHEN 'INFO'    THEN 3
                        ELSE 4
                    END,
                    ivr2.validation_stage ASC
            ) AS top_issue_message,
            (
                SELECT COUNT(*)
                FROM dbo.import_validation_results ivr3
                WHERE ivr3.batch_file_id = v.batch_file_id
                  AND ivr3.severity <> 'PASS'
            ) AS total_issue_count
        FROM dbo.vw_batch_file_status v
        WHERE v.batch_id = ?
          AND v.batch_file_id IS NOT NULL
        ORDER BY v.file_type
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
            "top_issue_message": r[10],
            "total_issue_count": r[11] or 0,
        }
        for r in cursor.fetchall()
    ]
