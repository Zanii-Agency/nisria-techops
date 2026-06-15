"""Nisria Grant Finder — FastAPI entry point.

Starts the web server and background scheduler for grant data refresh.
Usage: python main.py [--host 0.0.0.0] [--port 8000]
"""

from __future__ import annotations

import argparse
import logging
from contextlib import asynccontextmanager

import uvicorn

from src.common import auth
from src.common.config import load_config
from src.common.db import get_db, ensure_tables, seed_org_profile, seed_source_status
from src.scheduler.refresh import create_scheduler
from src.web.app import create_app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


def init_database(config: dict):
    """Initialize database schema and seed data on first run."""
    conn = get_db()
    ensure_tables(conn)
    seed_org_profile(conn, config)
    seed_source_status(conn, config)
    auth.bootstrap_admin(conn)
    conn.close()
    logger.info("Database initialized")


# Production-friendly bootstrap: if no config.yaml is present (fresh Railway
# deploy, fresh clone), copy config.example.yaml in as the working config so
# the new 9-category taxonomy + Nur founder profile + new scoring weights are
# all there before the org_profile row gets seeded.
from pathlib import Path as _Path
_cfg_path = _Path(__file__).parent / "config" / "config.yaml"
_cfg_example = _Path(__file__).parent / "config" / "config.example.yaml"
if not _cfg_path.exists() and _cfg_example.exists():
    _cfg_path.write_text(_cfg_example.read_text())
    logger.info("Seeded config.yaml from config.example.yaml")

config = load_config()
scheduler = create_scheduler(config)


@asynccontextmanager
async def lifespan(app):
    """Start scheduler on startup, shut down on exit."""
    init_database(config)
    scheduler.start()
    logger.info("Scheduler started")
    yield
    scheduler.shutdown()
    logger.info("Scheduler shut down")


app = create_app()
app.router.lifespan_context = lifespan


def main():
    parser = argparse.ArgumentParser(description="Nisria Grant Finder")
    parser.add_argument("--host", default=config.get("server", {}).get("host", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=config.get("server", {}).get("port", 8000))
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
