from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, batches, uploads, templates, masterdata, baselines, rccp

app = FastAPI(title="RCCP One API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # Create React App dev server
        "http://localhost:5173",   # Vite dev server
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(batches.router, prefix="/api")
app.include_router(uploads.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(masterdata.router, prefix="/api")
app.include_router(baselines.router, prefix="/api")
app.include_router(rccp.router, prefix="/api")


@app.get("/api/health", tags=["health"])
def health_check():
    from app.database import get_connection
    try:
        conn = get_connection()
        conn.close()
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "error", "db": str(e)}
