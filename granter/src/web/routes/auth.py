"""Auth routes — login form, login POST, logout, /me JSON.

Session is provided by Starlette's SessionMiddleware (signed cookie). On a
successful login we stash user_id + email + display_name + logged_in_at in the
session. The session middleware itself handles cookie sign/verify.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Form, Request
from fastapi.responses import JSONResponse, RedirectResponse

from src.common import auth as auth_lib
from src.common.db import get_db
from src.web.templates import render

logger = logging.getLogger(__name__)

router = APIRouter()


def _safe_next(next_path: str | None) -> str:
    """Reject open redirects. Only allow same-origin paths starting with '/'."""
    if not next_path:
        return "/"
    if not next_path.startswith("/") or next_path.startswith("//"):
        return "/"
    # Never bounce a logged-in user back to /login.
    if next_path.startswith("/login") or next_path.startswith("/logout"):
        return "/"
    return next_path


@router.get("/login")
async def login_form(request: Request):
    """Render the login page. Accepts ?next=... and ?error=...."""
    return render(
        "login.html",
        {
            "request": request,
            "next": request.query_params.get("next", ""),
            "error": request.query_params.get("error", ""),
        },
    )


@router.post("/login")
async def login_submit(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    next: str = Form(""),
):
    """Verify credentials, populate session, redirect."""
    target = _safe_next(next)
    conn = get_db()
    try:
        user = auth_lib.get_user_by_email(conn, email)
        if user is None or not auth_lib.verify_password(password, user["password_hash"]):
            # Same response for "no such user" and "wrong password" so we do
            # not leak which one failed.
            logger.info("Auth: failed login for email=%s", email)
            redirect_to = f"/login?error=invalid&next={target}"
            return RedirectResponse(url=redirect_to, status_code=303)

        # Success. Stamp session + last_login.
        request.session["user_id"] = user["id"]
        request.session["email"] = user["email"]
        request.session["display_name"] = user.get("display_name") or "Nur"
        request.session["logged_in_at"] = datetime.now(timezone.utc).isoformat()
        auth_lib.update_last_login(conn, user["id"])
        logger.info("Auth: login success for user_id=%s", user["id"])
        return RedirectResponse(url=target, status_code=303)
    finally:
        conn.close()


@router.post("/logout")
async def logout(request: Request):
    """Clear the session and bounce to login."""
    request.session.clear()
    return RedirectResponse(url="/login", status_code=303)


@router.get("/me")
async def me(request: Request):
    """JSON snapshot of the current user. 401 when no session."""
    user_id = request.session.get("user_id")
    if not user_id:
        return JSONResponse({"error": "not_authenticated"}, status_code=401)
    return JSONResponse(
        {
            "email": request.session.get("email"),
            "display_name": request.session.get("display_name"),
        }
    )
