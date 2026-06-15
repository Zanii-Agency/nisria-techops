"""Single-user auth helpers — bcrypt password hashing + first-run bootstrap.

The Nisria Grant Finder has exactly one operator (Nur). This module owns:
  - password hashing (passlib bcrypt)
  - user lookup, creation, last_login bookkeeping
  - bootstrap_admin: on first run, if NUR_EMAIL + NUR_PASSWORD are set and the
    users table is empty, seed the single user from env. After that, the hash
    in the table is the source of truth and the env var is no longer consulted.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from typing import Optional

from passlib.context import CryptContext

logger = logging.getLogger(__name__)

# bcrypt is the only scheme. `deprecated="auto"` lets us add new schemes later
# without breaking existing hashes.
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Return a bcrypt hash for the given plaintext password."""
    if not isinstance(plain, str) or plain == "":
        raise ValueError("password must be a non-empty string")
    return _pwd_context.hash(plain)


def verify_password(plain: str, hash: str) -> bool:
    """Return True if the plaintext matches the stored bcrypt hash."""
    if not plain or not hash:
        return False
    try:
        return _pwd_context.verify(plain, hash)
    except Exception:
        # Malformed hash, unsupported scheme, etc. Treat as a failed login.
        return False


def get_user_by_email(conn: sqlite3.Connection, email: str) -> Optional[dict]:
    """Return the user row as a dict, or None if not found.

    Email lookup is case-insensitive. We store whatever case was provided at
    creation time, but compare with LOWER() so "Nur@x.com" matches "nur@x.com".
    """
    if not email:
        return None
    row = conn.execute(
        "SELECT id, email, password_hash, display_name, created_at, last_login_at "
        "FROM users WHERE LOWER(email) = LOWER(?)",
        (email,),
    ).fetchone()
    if row is None:
        return None
    # sqlite3.Row supports mapping access; convert to a plain dict for callers.
    return dict(row)


def create_user(
    conn: sqlite3.Connection,
    email: str,
    password: str,
    display_name: str = "Nur",
) -> dict:
    """Insert a new user. Raises sqlite3.IntegrityError on duplicate email."""
    if not email or not password:
        raise ValueError("email and password are required")
    pw_hash = hash_password(password)
    cur = conn.execute(
        "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)",
        (email, pw_hash, display_name),
    )
    conn.commit()
    new_id = cur.lastrowid
    return {
        "id": new_id,
        "email": email,
        "password_hash": pw_hash,
        "display_name": display_name,
    }


def update_last_login(conn: sqlite3.Connection, user_id: int) -> None:
    """Stamp the user's last_login_at to now."""
    conn.execute(
        "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
        (user_id,),
    )
    conn.commit()


def bootstrap_admin(conn: sqlite3.Connection) -> None:
    """First-run seeding of the single user from env vars.

    Reads NUR_EMAIL and NUR_PASSWORD.
      * Both set + users table empty: create the user.
      * Both set + at least one user already exists: no-op (do NOT touch the
        existing password; the hash on disk is the source of truth).
      * Either missing + users table empty: log a clear warning so the
        operator knows how to seed.
      * Either missing + a user already exists: silent no-op.
    """
    email = os.getenv("NUR_EMAIL", "").strip()
    password = os.getenv("NUR_PASSWORD", "")

    row = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()
    user_count = row["n"] if row is not None else 0

    if user_count > 0:
        # User already exists. Env vars are now informational only.
        if email and password:
            logger.info("Auth: user already exists, skipping env-var bootstrap")
        return

    if not email or not password:
        logger.warning(
            "Auth: no users in DB and NUR_EMAIL or NUR_PASSWORD is missing. "
            "Set NUR_EMAIL + NUR_PASSWORD env vars to bootstrap the first user."
        )
        return

    create_user(conn, email=email, password=password, display_name="Nur")
    logger.info("Auth: bootstrapped first user from env (email=%s)", email)
