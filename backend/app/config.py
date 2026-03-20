import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DB_SERVER = os.getenv("DB_SERVER", r"localhost\SQLEXPRESS")
DB_NAME = os.getenv("DB_NAME", "RCCP_One")
DB_USER = os.getenv("DB_USER", "rccp_app")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")

JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))
