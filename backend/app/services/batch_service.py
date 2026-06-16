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


_REQUIRED_FILE_TYPES_SQL = (
    "'master_stock', 'demand_plan', 'line_capacity_calendar', "
    "'headcount_plan', 'portfolio_changes', 'production_orders'"
)


def get_validation_stage_summary(conn: pyodbc.Connection, batch_id: int) -> list:
    """Return worst severity per validation stage across all current-version files.

    Stages 2-6 and 8 are file-specific and read from stored results.
    Stages 1 (Required File Check) and 7 (Batch Readiness) are BATCH-level and
    computed LIVE here — stored per-file rows for them go stale as files are
    uploaded one at a time (each frozen at the file count when that file was
    validated), so reading them back produces misleading "1/6 … 5/6" history.
    """
    cursor = conn.cursor()
    rank_map = {3: "BLOCKED", 2: "WARNING", 1: "INFO", 0: "PASS"}

    # --- Stages 2-6, 8 from stored per-file results (worst severity each) ---
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
          AND ivr.validation_stage NOT IN (1, 7)
        GROUP BY ivr.validation_stage, ivr.stage_name
        ORDER BY ivr.validation_stage
        """,
        batch_id,
    )
    stages = [
        {"stage": r[0], "name": r[1], "severity": rank_map.get(r[2], "PASS")}
        for r in cursor.fetchall()
    ]

    # Messages behind each stored stage's severity (non-PASS only).
    cursor.execute(
        """
        SELECT DISTINCT ivr.validation_stage, ivr.severity, ivr.message
        FROM dbo.import_validation_results ivr
        JOIN dbo.import_batch_files ibf ON ivr.batch_file_id = ibf.batch_file_id
        WHERE ibf.batch_id = ?
          AND ibf.is_current_version = 1
          AND ivr.validation_stage NOT IN (1, 7)
          AND ivr.severity <> 'PASS'
          AND ivr.message IS NOT NULL
        """,
        batch_id,
    )
    msgs_by_key: dict = {}
    for stg, sev, msg in cursor.fetchall():
        msgs_by_key.setdefault((stg, sev), []).append(msg)
    for s in stages:
        s["messages"] = msgs_by_key.get((s["stage"], s["severity"]), [])[:5]

    # --- Stage 1 (Required File Check) — computed live ---
    cursor.execute(
        f"""
        SELECT COUNT(DISTINCT file_type)
        FROM dbo.import_batch_files
        WHERE batch_id = ? AND is_current_version = 1
          AND file_type IN ({_REQUIRED_FILE_TYPES_SQL})
        """,
        batch_id,
    )
    required_count = cursor.fetchone()[0] or 0

    cursor.execute(
        f"""
        SELECT COUNT(DISTINCT file_type)
        FROM dbo.import_batch_files
        WHERE batch_id = ? AND is_current_version = 1
          AND file_type IN ({_REQUIRED_FILE_TYPES_SQL})
          AND validation_status IS NULL
        """,
        batch_id,
    )
    unvalidated_count = cursor.fetchone()[0] or 0

    cursor.execute(
        """
        SELECT
            SUM(CASE WHEN ivr.severity = 'BLOCKED' THEN 1 ELSE 0 END),
            SUM(CASE WHEN ivr.severity = 'WARNING' THEN 1 ELSE 0 END)
        FROM dbo.import_validation_results ivr
        JOIN dbo.import_batch_files ibf ON ivr.batch_file_id = ibf.batch_file_id
        WHERE ibf.batch_id = ? AND ibf.is_current_version = 1
          AND ivr.validation_stage BETWEEN 2 AND 6
        """,
        batch_id,
    )
    row = cursor.fetchone()
    blocked_count = row[0] or 0
    warning_count = row[1] or 0

    if required_count >= 6:
        stage1 = {"stage": 1, "name": "REQUIRED_FILE_CHECK", "severity": "PASS",
                  "messages": ["All 6 required files are present in this batch"]}
    else:
        stage1 = {"stage": 1, "name": "REQUIRED_FILE_CHECK", "severity": "WARNING",
                  "messages": [f"{required_count}/6 required files present — {6 - required_count} still to upload"]}

    # --- Stage 7 (Batch Readiness) — computed live (mirrors _stage7) ---
    if required_count < 6:
        stage7 = {"stage": 7, "name": "BATCH_READINESS", "severity": "WARNING",
                  "messages": [f"Batch not ready to publish: {required_count}/6 required files uploaded"]}
    elif unvalidated_count > 0:
        stage7 = {"stage": 7, "name": "BATCH_READINESS", "severity": "BLOCKED",
                  "messages": [f"{unvalidated_count} file(s) uploaded but not yet validated — click Re-validate"]}
    elif blocked_count > 0:
        stage7 = {"stage": 7, "name": "BATCH_READINESS", "severity": "BLOCKED",
                  "messages": [f"Batch cannot be published: {blocked_count} BLOCKED issue(s) across all files"]}
    elif warning_count > 0:
        stage7 = {"stage": 7, "name": "BATCH_READINESS", "severity": "WARNING",
                  "messages": [f"Batch can be published but has {warning_count} warning(s). Review before publishing."]}
    else:
        stage7 = {"stage": 7, "name": "BATCH_READINESS", "severity": "PASS",
                  "messages": ["All files validated. Batch is ready to publish."]}

    stages.extend([stage1, stage7])
    stages.sort(key=lambda s: s["stage"])
    return stages


def get_current_file_for_download(conn: pyodbc.Connection, batch_id: int, file_type: str) -> dict | None:
    """Return file_content (bytes), original_filename, and stored_file_path for the current-version file."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT file_content, original_filename, stored_file_path
        FROM dbo.import_batch_files
        WHERE batch_id = ? AND file_type = ? AND is_current_version = 1
        """,
        batch_id,
        file_type,
    )
    row = cursor.fetchone()
    if not row:
        return None
    return {
        "file_content": bytes(row[0]) if row[0] else None,
        "original_filename": row[1],
        "stored_file_path": row[2],
    }


def unpublish_batch(conn: pyodbc.Connection, batch_id: int) -> None:
    """Move a PUBLISHED batch back to VALIDATED. Files and planning data are preserved."""
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE dbo.import_batches SET status = 'VALIDATED' WHERE batch_id = ?",
        batch_id,
    )
    conn.commit()


def reset_batch_files(conn: pyodbc.Connection, batch_id: int) -> int:
    """Delete all uploaded files for a batch (all versions). Returns count of records deleted."""
    import os

    cursor = conn.cursor()

    # Collect file paths before deleting
    cursor.execute(
        "SELECT stored_file_path FROM dbo.import_batch_files WHERE batch_id = ?",
        batch_id,
    )
    paths = [r[0] for r in cursor.fetchall()]

    # Delete validation results first (FK constraint)
    cursor.execute(
        """
        DELETE r FROM dbo.import_validation_results r
        INNER JOIN dbo.import_batch_files f ON f.batch_file_id = r.batch_file_id
        WHERE f.batch_id = ?
        """,
        batch_id,
    )

    # Delete file records
    cursor.execute("DELETE FROM dbo.import_batch_files WHERE batch_id = ?", batch_id)

    # Reset batch status to DRAFT
    cursor.execute(
        "UPDATE dbo.import_batches SET status = 'DRAFT' WHERE batch_id = ?",
        batch_id,
    )

    conn.commit()

    # Best-effort physical file cleanup (path may be None or already deleted)
    for path in paths:
        if not path:
            continue
        try:
            os.remove(path)
        except OSError:
            pass

    return len(paths)


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
                SELECT STRING_AGG(sub.msg, N'<|>') WITHIN GROUP (ORDER BY sub.sev, sub.stage)
                FROM (
                    SELECT TOP 3
                        ivr2.stage_name + N' — ' + ivr2.message AS msg,
                        CASE ivr2.severity
                            WHEN 'BLOCKED' THEN 1
                            WHEN 'WARNING' THEN 2
                            WHEN 'INFO'    THEN 3
                            ELSE 4
                        END AS sev,
                        ivr2.validation_stage AS stage
                    FROM dbo.import_validation_results ivr2
                    WHERE ivr2.batch_file_id = v.batch_file_id
                      AND ivr2.severity <> 'PASS'
                      AND ivr2.validation_stage IN (2,3,4,5,6,8)
                    ORDER BY
                        CASE ivr2.severity
                            WHEN 'BLOCKED' THEN 1
                            WHEN 'WARNING' THEN 2
                            WHEN 'INFO'    THEN 3
                            ELSE 4
                        END,
                        ivr2.validation_stage ASC
                ) sub
            ) AS top_issues_raw,
            (
                SELECT COUNT(*)
                FROM dbo.import_validation_results ivr3
                WHERE ivr3.batch_file_id = v.batch_file_id
                  AND ivr3.severity <> 'PASS'
                  AND ivr3.validation_stage IN (2,3,4,5,6,8)
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
            "top_issues": [m for m in (r[10] or "").split("<|>") if m],
            "total_issue_count": r[11] or 0,
        }
        for r in cursor.fetchall()
    ]


def get_coverage_report(conn: pyodbc.Connection, batch_id: int) -> dict:
    """
    Return stage 8 cross-file check results for a batch, grouped by field_name.

    field_name values:
      - "sku_coverage"       → SKUs in master_stock not covered by demand_plan or production_orders
      - "headcount_coverage" → Lines missing headcount rows for dates in line_capacity_calendar
      - "demand_overlap"     → NEW_LAUNCH portfolio items that also appear in demand_plan

    Returns:
      {
        "uncovered_skus":  [...message strings...],
        "headcount_gaps":  [...message strings...],
        "demand_overlaps": [...message strings...],
        "total_findings":  int,
      }
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT ivr.field_name, ivr.message
        FROM dbo.import_validation_results ivr
        JOIN dbo.import_batch_files ibf ON ivr.batch_file_id = ibf.batch_file_id
        WHERE ibf.batch_id = ?
          AND ivr.validation_stage = 8
          AND ivr.severity = 'WARNING'
        ORDER BY ivr.field_name, ivr.result_id
        """,
        batch_id,
    )
    rows = cursor.fetchall()

    uncovered_skus: list[str] = []
    headcount_gaps: list[str] = []
    demand_overlaps: list[str] = []

    for field_name, message in rows:
        if field_name == "sku_coverage":
            uncovered_skus.append(message)
        elif field_name == "headcount_coverage":
            headcount_gaps.append(message)
        elif field_name == "demand_overlap":
            demand_overlaps.append(message)

    return {
        "uncovered_skus": uncovered_skus,
        "headcount_gaps": headcount_gaps,
        "demand_overlaps": demand_overlaps,
        "total_findings": len(uncovered_skus) + len(headcount_gaps) + len(demand_overlaps),
    }
