import pyodbc

from app import config


def get_connection() -> pyodbc.Connection:
    # Read config attributes each call so a runtime change (e.g. via the
    # Settings page editing DB_SERVER) takes effect for new connections
    # without an app restart.
    conn_str = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={config.DB_SERVER};"
        f"DATABASE={config.DB_NAME};"
        f"UID={config.DB_USER};"
        f"PWD={config.DB_PASSWORD};"
    )
    return pyodbc.connect(conn_str)
