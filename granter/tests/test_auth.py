"""Tests for src/common/auth.py — hashing, user CRUD, env-var bootstrap."""

from __future__ import annotations

import sqlite3

import pytest

from src.common import auth as auth_lib
from src.common.db import ensure_tables


@pytest.fixture
def conn():
    """Fresh in-memory SQLite with the auth schema applied."""
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    ensure_tables(c)
    yield c
    c.close()


# ---------- hashing round-trip ---------------------------------------------


def test_hash_password_returns_non_empty_string_different_from_input():
    plain = "correct horse battery staple"
    hashed = auth_lib.hash_password(plain)
    assert isinstance(hashed, str)
    assert hashed
    assert hashed != plain
    # bcrypt hashes start with $2a$, $2b$, or $2y$
    assert hashed.startswith("$2")


def test_verify_password_round_trips():
    plain = "s3cret!"
    hashed = auth_lib.hash_password(plain)
    assert auth_lib.verify_password(plain, hashed) is True
    assert auth_lib.verify_password("wrong", hashed) is False


def test_verify_password_handles_empty_inputs():
    assert auth_lib.verify_password("", "anything") is False
    assert auth_lib.verify_password("anything", "") is False


def test_verify_password_handles_garbage_hash():
    # Should not raise, just return False.
    assert auth_lib.verify_password("hello", "not-a-real-hash") is False


# ---------- create_user + get_user_by_email --------------------------------


def test_create_user_inserts_row_and_lookup_returns_it(conn):
    user = auth_lib.create_user(conn, "nur@nisria.org", "hunter2", display_name="Nur")
    assert user["id"] > 0
    assert user["email"] == "nur@nisria.org"

    fetched = auth_lib.get_user_by_email(conn, "nur@nisria.org")
    assert fetched is not None
    assert fetched["email"] == "nur@nisria.org"
    assert fetched["display_name"] == "Nur"
    assert auth_lib.verify_password("hunter2", fetched["password_hash"]) is True


def test_get_user_by_email_is_case_insensitive(conn):
    auth_lib.create_user(conn, "nur@nisria.org", "x")
    fetched = auth_lib.get_user_by_email(conn, "NUR@NISRIA.ORG")
    assert fetched is not None
    assert fetched["email"] == "nur@nisria.org"


def test_get_user_by_email_returns_none_when_missing(conn):
    assert auth_lib.get_user_by_email(conn, "ghost@nisria.org") is None
    assert auth_lib.get_user_by_email(conn, "") is None


def test_duplicate_email_raises(conn):
    auth_lib.create_user(conn, "nur@nisria.org", "x")
    with pytest.raises(sqlite3.IntegrityError):
        auth_lib.create_user(conn, "nur@nisria.org", "y")


def test_create_user_requires_email_and_password(conn):
    with pytest.raises(ValueError):
        auth_lib.create_user(conn, "", "pw")
    with pytest.raises(ValueError):
        auth_lib.create_user(conn, "x@y.org", "")


def test_update_last_login_stamps_timestamp(conn):
    user = auth_lib.create_user(conn, "nur@nisria.org", "x")
    before = auth_lib.get_user_by_email(conn, "nur@nisria.org")
    assert before["last_login_at"] is None

    auth_lib.update_last_login(conn, user["id"])
    after = auth_lib.get_user_by_email(conn, "nur@nisria.org")
    assert after["last_login_at"] is not None


# ---------- bootstrap_admin -------------------------------------------------


def test_bootstrap_admin_no_op_when_env_unset(conn, monkeypatch):
    monkeypatch.delenv("NUR_EMAIL", raising=False)
    monkeypatch.delenv("NUR_PASSWORD", raising=False)

    auth_lib.bootstrap_admin(conn)
    rows = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()
    assert rows["n"] == 0


def test_bootstrap_admin_creates_user_when_env_set_and_empty_table(conn, monkeypatch):
    monkeypatch.setenv("NUR_EMAIL", "nur@nisria.org")
    monkeypatch.setenv("NUR_PASSWORD", "from-env")

    auth_lib.bootstrap_admin(conn)

    user = auth_lib.get_user_by_email(conn, "nur@nisria.org")
    assert user is not None
    assert auth_lib.verify_password("from-env", user["password_hash"]) is True


def test_bootstrap_admin_second_call_is_noop(conn, monkeypatch):
    monkeypatch.setenv("NUR_EMAIL", "nur@nisria.org")
    monkeypatch.setenv("NUR_PASSWORD", "from-env")

    auth_lib.bootstrap_admin(conn)
    first = auth_lib.get_user_by_email(conn, "nur@nisria.org")
    first_hash = first["password_hash"]

    # Change the env password. The second call must NOT overwrite the stored
    # hash, because the DB is now authoritative.
    monkeypatch.setenv("NUR_PASSWORD", "different")
    auth_lib.bootstrap_admin(conn)

    after = auth_lib.get_user_by_email(conn, "nur@nisria.org")
    assert after["password_hash"] == first_hash
    # And there is still exactly one user.
    rows = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()
    assert rows["n"] == 1


def test_bootstrap_admin_partial_env_logs_no_user(conn, monkeypatch):
    monkeypatch.setenv("NUR_EMAIL", "nur@nisria.org")
    monkeypatch.delenv("NUR_PASSWORD", raising=False)

    auth_lib.bootstrap_admin(conn)
    rows = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()
    assert rows["n"] == 0
