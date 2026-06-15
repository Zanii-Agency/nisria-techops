"""FastAPI application factory."""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from src.web.routes import (
    api,
    auth,
    dashboard,
    funders,
    grants,
    letter,
    settings,
    tracker,
)


# Paths that never require a session. The /me route returns its own 401 JSON,
# so we let it through here too. Anything else needs a logged-in user.
_PUBLIC_PREFIXES = ("/login", "/logout", "/static", "/healthz", "/me")


def _is_public_path(path: str) -> bool:
    for prefix in _PUBLIC_PREFIXES:
        if path == prefix or path.startswith(prefix + "/") or path == prefix:
            return True
    return False


class AuthRequiredMiddleware(BaseHTTPMiddleware):
    """Gate every non-public path behind a session.

    GET on a gated path -> 303 redirect to /login?next=<path>.
    Any other method on a gated path -> 401 JSON. Browser forms are GET first
    (the dashboards), and our mutating endpoints are AJAX/forms that will
    see a JSON 401 and can react accordingly.
    """

    async def dispatch(self, request, call_next):
        path = request.url.path
        if _is_public_path(path):
            return await call_next(request)

        user_id = request.session.get("user_id") if hasattr(request, "session") else None
        if user_id:
            return await call_next(request)

        if request.method == "GET":
            # Preserve query string in the next param so e.g. /grants?tier=HIGH
            # comes back after login.
            next_path = path
            if request.url.query:
                next_path = f"{path}?{request.url.query}"
            return RedirectResponse(url=f"/login?next={next_path}", status_code=303)

        return JSONResponse(
            {"error": "not_authenticated", "detail": "Sign in required."},
            status_code=401,
        )


def create_app() -> FastAPI:
    app = FastAPI(title="Nisria Grant Finder", version="1.0.0")

    # Middleware ordering matters. Starlette's `add_middleware` pushes the new
    # middleware to the OUTSIDE of the stack, so the LAST one added runs FIRST
    # on the way in. We want SessionMiddleware to run first so request.session
    # is populated by the time AuthRequiredMiddleware checks it. So: add the
    # auth gate first, then the session middleware on top of it.
    app.add_middleware(AuthRequiredMiddleware)
    app.add_middleware(
        SessionMiddleware,
        secret_key=os.getenv("SESSION_SECRET", "dev-secret-change-me"),
        max_age=60 * 60 * 24 * 14,
        https_only=False,
        same_site="lax",
    )

    # Static files
    static_dir = os.path.join(os.path.dirname(__file__), "..", "..", "static")
    app.mount("/static", StaticFiles(directory=os.path.realpath(static_dir)), name="static")

    # Auth routes are unprefixed so /login + /logout sit at the top level.
    app.include_router(auth.router)

    # Register route modules
    app.include_router(dashboard.router)
    app.include_router(grants.router, prefix="/grants", tags=["grants"])
    app.include_router(funders.router, prefix="/funders", tags=["funders"])
    app.include_router(tracker.router, prefix="/tracker", tags=["tracker"])
    app.include_router(settings.router, prefix="/settings", tags=["settings"])
    app.include_router(api.router, prefix="/api/v1", tags=["api"])
    app.include_router(letter.router, tags=["letter"])

    return app
