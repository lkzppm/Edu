import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from edu.db import init_db
from edu.jobs.scheduler import boot_catchup, start_scheduler
from edu.routes import college, connectors, courses, grades, tasks

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler = start_scheduler()
    # Sync anything stale right away — heals restarts and slept-through slots.
    threading.Thread(target=boot_catchup, daemon=True).start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="Edu API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://edu.localhost"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(connectors.router, prefix="/connectors", tags=["connectors"])
app.include_router(courses.router, prefix="/courses", tags=["courses"])
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
app.include_router(grades.router, prefix="/grades", tags=["grades"])
app.include_router(college.router, prefix="/college", tags=["college"])


@app.get("/health")
def health():
    return {"status": "ok"}
