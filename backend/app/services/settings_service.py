"""
App settings — typed access to the dbo.app_settings key/value store.

Backend code reads stable configuration (OEE default, cost rates, …) from here
instead of hard-coding it. Code-level defaults mean the app works even before a
row exists in the table; the Settings UI upserts rows on save.
"""

from __future__ import annotations

# Settings surfaced & editable in the Settings UI. `default` is the code-level
# fallback used when the row is absent from dbo.app_settings.
ABC_INDICATORS: list[dict] = [
    {"code": "A", "label": "A — Top 70%",              "default_included": True},
    {"code": "B", "label": "B — Top 20%",              "default_included": True},
    {"code": "C", "label": "C — Bottom 10%",           "default_included": True},
    {"code": "F", "label": "F — Finance block",        "default_included": False},
    {"code": "G", "label": "G — Never out of stock",   "default_included": True},
    {"code": "L", "label": "L — Launch (first 3 mo.)", "default_included": True},
    {"code": "T", "label": "T — Temporarily unavail.", "default_included": False},
    {"code": "X", "label": "X — Discontinued",        "default_included": False},
]
_DEFAULT_ABC = ",".join(i["code"] for i in ABC_INDICATORS if i["default_included"])

MANAGED_SETTINGS: list[dict] = [
    {
        "key": "cogs_opex_per_litre",
        "label": "COGS — OPEX per litre",
        "group": "Cost",
        "type": "currency",
        "default": "0.12",
        "min": 0.0, "max": 1000.0,
        "description": "Operating cost per litre produced. Used to value the production plan and the cost of extra capacity.",
    },
    {
        "key": "included_abc_indicators",
        "label": "ABC indicators included in planning",
        "group": "Planning filter",
        "type": "abc_multiselect",
        "default": _DEFAULT_ABC,
        "description": (
            "Only SKUs with these ABC indicators contribute to capacity calculations. "
            "SKUs with no ABC indicator are always included (with a dashboard warning). "
            "Change takes effect on the next batch publish."
        ),
    },
]
# OEE is maintained per line (dbo.lines.oee_target) — see list_line_oee / update_line_oee.

_REGISTRY = {s["key"]: s for s in MANAGED_SETTINGS}
_DEFAULTS = {s["key"]: s["default"] for s in MANAGED_SETTINGS}


def get_all(conn) -> dict[str, str]:
    cur = conn.cursor()
    cur.execute("SELECT setting_key, setting_value FROM dbo.app_settings")
    return {r.setting_key: r.setting_value for r in cur.fetchall()}


def get_value(conn, key: str, default: str | None = None) -> str | None:
    cur = conn.cursor()
    cur.execute("SELECT setting_value FROM dbo.app_settings WHERE setting_key = ?", key)
    row = cur.fetchone()
    if row is not None:
        return row.setting_value
    return default if default is not None else _DEFAULTS.get(key)


def get_float(conn, key: str, default: float) -> float:
    raw = get_value(conn, key, None)
    if raw is None:
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def get_list(conn, key: str, default: list[str]) -> list[str]:
    """Return a comma-separated setting as a list of stripped strings."""
    raw = get_value(conn, key, None)
    if raw is None:
        return default
    return [v.strip() for v in raw.split(",") if v.strip()]


def update_value(conn, key: str, value: str, updated_by: str | None = None) -> None:
    """Upsert a setting value (insert if missing, update otherwise)."""
    cur = conn.cursor()
    cur.execute(
        """
        MERGE dbo.app_settings AS t
        USING (SELECT ? AS k, ? AS v, ? AS u) AS s
        ON t.setting_key = s.k
        WHEN MATCHED THEN
            UPDATE SET setting_value = s.v, updated_at = GETUTCDATE(), updated_by = s.u
        WHEN NOT MATCHED THEN
            INSERT (setting_key, setting_value, updated_by) VALUES (s.k, s.v, s.u);
        """,
        key, value, updated_by,
    )
    conn.commit()


def registry_for(key: str) -> dict | None:
    return _REGISTRY.get(key)


def list_managed(conn) -> list[dict]:
    """Managed settings merged with their current stored values (for the UI)."""
    current = get_all(conn)
    return [{**s, "value": current.get(s["key"], s["default"])} for s in MANAGED_SETTINGS]


# ─── Per-line OEE (lives in dbo.lines, maintained from Settings) ─────────────────
def list_line_oee(conn) -> list[dict]:
    cur = conn.cursor()
    cur.execute("SELECT line_code, plant_code, oee_target FROM dbo.lines ORDER BY line_code")
    return [
        {
            "line_code": r.line_code,
            "plant_code": r.plant_code,
            "oee_target": float(r.oee_target) if r.oee_target is not None else None,
        }
        for r in cur.fetchall()
    ]


def update_line_oee(conn, line_code: str, value: float) -> None:
    cur = conn.cursor()
    cur.execute("UPDATE dbo.lines SET oee_target = ? WHERE line_code = ?", value, line_code)
    if cur.rowcount == 0:
        raise ValueError(f"Line '{line_code}' not found")
    conn.commit()
