"""Document Vault helpers.

Files live on disk under granter/documents/. The documents table indexes them.
Stage 3 feature: operator uploads 501c3 letter, Kenya CBO certificate, audited
financials, board roster, brand sheets, photo consents. The AI helper can then
cite them in grant applications.
"""

from __future__ import annotations

import logging
import os
import sqlite3
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Resolve relative to repo root (granter/documents/). This file lives at
# src/common/documents.py, so three parents up lands at the repo root.
_REPO_ROOT = Path(__file__).resolve().parents[2]
DOCUMENTS_DIR = _REPO_ROOT / "documents"

DOCUMENT_CATEGORIES = [
    "registration",
    "financials",
    "brand",
    "impact",
    "consent",
    "policies",
    "other",
]

ALLOWED_EXT = {".pdf", ".docx", ".doc", ".jpg", ".jpeg", ".png", ".xlsx", ".csv"}

MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB


class DocumentError(ValueError):
    """Raised when a document upload fails validation."""


def _ensure_dir() -> Path:
    DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
    return DOCUMENTS_DIR


def _ext(filename: str) -> str:
    return Path(filename).suffix.lower()


def save_document(
    upload_file: Any,
    category: str,
    description: str,
    conn: sqlite3.Connection,
) -> dict:
    """Validate, persist to disk, insert a row, return the row dict.

    upload_file is duck-typed: must expose .filename, .file (file-like), and
    optionally .content_type. Works with FastAPI's UploadFile and with a simple
    test stub.
    """
    original_filename = getattr(upload_file, "filename", "") or ""
    if not original_filename:
        raise DocumentError("Missing filename")

    ext = _ext(original_filename)
    if ext not in ALLOWED_EXT:
        raise DocumentError(f"Extension {ext!r} not allowed")

    if category not in DOCUMENT_CATEGORIES:
        category = "other"

    # Read payload. UploadFile.file is a SpooledTemporaryFile; .read() works.
    file_obj = getattr(upload_file, "file", None) or upload_file
    payload = file_obj.read()
    if not isinstance(payload, (bytes, bytearray)):
        raise DocumentError("Upload payload was not bytes")

    size_bytes = len(payload)
    if size_bytes == 0:
        raise DocumentError("Empty file")
    if size_bytes > MAX_FILE_BYTES:
        raise DocumentError(
            f"File too large: {size_bytes} bytes (max {MAX_FILE_BYTES})"
        )

    # Sanitized on-disk name: uuid + ext. Original name only used for download.
    disk_name = f"{uuid.uuid4().hex}{ext}"
    target_dir = _ensure_dir()
    disk_path = target_dir / disk_name
    with open(disk_path, "wb") as fh:
        fh.write(payload)

    mime_type = getattr(upload_file, "content_type", None) or ""

    cur = conn.execute(
        """INSERT INTO documents (
            filename, original_filename, category, mime_type, size_bytes, description
        ) VALUES (?, ?, ?, ?, ?, ?)""",
        (disk_name, original_filename, category, mime_type, size_bytes, description or ""),
    )
    conn.commit()
    doc_id = cur.lastrowid

    row = conn.execute(
        "SELECT * FROM documents WHERE id = ?", (doc_id,)
    ).fetchone()
    logger.info(
        "Saved document id=%s category=%s name=%s size=%s",
        doc_id, category, original_filename, size_bytes,
    )
    return dict(row)


def list_documents(
    conn: sqlite3.Connection,
    category: str | None = None,
) -> list[dict]:
    """Return rows newest-first, optionally filtered by category."""
    if category:
        rows = conn.execute(
            "SELECT * FROM documents WHERE category = ? ORDER BY uploaded_at DESC, id DESC",
            (category,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM documents ORDER BY uploaded_at DESC, id DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def get_document(conn: sqlite3.Connection, doc_id: int) -> dict | None:
    row = conn.execute(
        "SELECT * FROM documents WHERE id = ?", (doc_id,)
    ).fetchone()
    return dict(row) if row else None


def delete_document(conn: sqlite3.Connection, doc_id: int) -> bool:
    """Delete file from disk then row. Idempotent. True if found, False if not."""
    row = conn.execute(
        "SELECT * FROM documents WHERE id = ?", (doc_id,)
    ).fetchone()
    if not row:
        return False
    disk_path = DOCUMENTS_DIR / row["filename"]
    try:
        if disk_path.exists():
            disk_path.unlink()
    except OSError as exc:
        logger.warning("Could not unlink %s: %s", disk_path, exc)
    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    logger.info("Deleted document id=%s", doc_id)
    return True


def document_path(row: dict) -> Path:
    """Return the on-disk Path for a document row."""
    return DOCUMENTS_DIR / row["filename"]
