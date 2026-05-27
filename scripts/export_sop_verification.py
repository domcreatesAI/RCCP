"""
Export an S&OP verification workbook from the RCCP engine to disk.

The workbook itself is built by app.services.sop_export_service (shared with the
/api/rccp/{batch_id}/verification.xlsx endpoint), so the CLI output and the
Exec Summary download are identical.

Usage (from backend/ so the venv + app package resolve):
    .\\venv\\Scripts\\python.exe ..\\scripts\\export_sop_verification.py [batch_id] [horizon_months]

If batch_id is omitted, the single PUBLISHED batch is used.
horizon_months defaults to 12 (the forward window the plant charts render).
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

# Ensure the backend package is importable regardless of launch directory.
_BACKEND = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.database import get_connection
from app.services.rccp_engine import compute_dashboard
from app.services.sop_export_service import build_verification_workbook


def _resolve_batch_id(conn, arg: str | None) -> int:
    if arg:
        return int(arg)
    cur = conn.cursor()
    cur.execute("SELECT batch_id, batch_name FROM dbo.import_batches WHERE status = 'PUBLISHED'")
    rows = cur.fetchall()
    if not rows:
        raise SystemExit("No PUBLISHED batch found. Pass a batch_id explicitly.")
    if len(rows) > 1:
        names = ", ".join(f"{r.batch_id} ({r.batch_name})" for r in rows)
        raise SystemExit(f"Multiple PUBLISHED batches: {names}. Pass a batch_id explicitly.")
    return int(rows[0].batch_id)


def main() -> None:
    batch_arg = sys.argv[1] if len(sys.argv) > 1 else None
    horizon_months = int(sys.argv[2]) if len(sys.argv) > 2 else 12

    conn = get_connection()
    batch_id = _resolve_batch_id(conn, batch_arg)
    print(f"Running RCCP engine for batch {batch_id} ...")
    dash = compute_dashboard(conn, batch_id)
    conn.close()

    wb = build_verification_workbook(dash, horizon_months)

    out_dir = Path(__file__).resolve().parent.parent / "uploads"
    out_dir.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M")
    out_path = out_dir / f"sop_verification_batch{batch_id}_{stamp}.xlsx"
    wb.save(out_path)
    print(f"Wrote {out_path}")
    print(f"  Cycle {dash['plan_cycle_date'][:7]}  ·  forward horizon {horizon_months} months")


if __name__ == "__main__":
    main()
