import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, bills, calendar, comments, legislators, notifications, places, users

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI(title="PolitiKNOW API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (
    auth.router, users.router, bills.router, legislators.router, places.router, comments.router,
    notifications.router, calendar.router,
):
    app.include_router(r)


@app.get("/health", tags=["meta"])
async def health():
    return {"ok": True}
