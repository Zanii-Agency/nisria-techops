"""Document Vault helpers: save, list, delete."""

from __future__ import annotations

import io
import sqlite3
from pathlib import Path

import pytest

from src.common import documents as documents_mod
from src.common.db import ensure_tables


class _FakeUpload:
    """Duck-typed stand-in for FastAPI's UploadFile."""

    def __init__(self, filename: str, payload: bytes, content_type: str = "application/octet-stream"):
        self.filename = filename
        self.file = io.BytesIO(payload)
        self.content_type = content_type


@pytest.fixture
def docs_dir(tmp_path, monkeypatch):
    """Point DOCUMENTS_DIR at a fresh temp directory."""
    target = tmp_path / "documents"
    monkeypatch.setattr(documents_mod, "DOCUMENTS_DIR", target)
    return target


@pytest.fixture
def conn():
    """In-memory SQLite with documents table."""
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    ensure_tables(c)
    yield c
    c.close()


def test_save_document_writes_file_and_row(docs_dir, conn):
    payload = b"%PDF-1.4\nfake pdf body\n"
    upload = _FakeUpload("501c3-letter.pdf", payload, "application/pdf")

    row = documents_mod.save_document(upload, "registration", "IRS determination letter", conn)

    assert row["id"] > 0
    assert row["original_filename"] == "501c3-letter.pdf"
    assert row["category"] == "registration"
    assert row["size_bytes"] == len(payload)
    assert row["description"] == "IRS determination letter"

    disk_path = docs_dir / row["filename"]
    assert disk_path.exists()
    assert disk_path.read_bytes() == payload
    assert disk_path.suffix == ".pdf"


def test_save_document_rejects_exe(docs_dir, conn):
    upload = _FakeUpload("payload.exe", b"MZ\x90\x00", "application/octet-stream")
    with pytest.raises(documents_mod.DocumentError):
        documents_mod.save_document(upload, "other", "bad", conn)

    # Nothing should have been written or inserted.
    rows = conn.execute("SELECT COUNT(*) AS n FROM documents").fetchone()
    assert rows["n"] == 0
    # docs_dir may not even exist; if it does, must be empty.
    if docs_dir.exists():
        assert list(docs_dir.iterdir()) == []


def test_list_documents_newest_first(docs_dir, conn):
    a = _FakeUpload("a.pdf", b"AAA", "application/pdf")
    b = _FakeUpload("b.pdf", b"BBB", "application/pdf")
    c = _FakeUpload("c.pdf", b"CCC", "application/pdf")

    row_a = documents_mod.save_document(a, "registration", "", conn)
    row_b = documents_mod.save_document(b, "financials", "", conn)
    row_c = documents_mod.save_document(c, "brand", "", conn)

    rows = documents_mod.list_documents(conn)
    assert len(rows) == 3
    # uploaded_at ties resolve via id DESC, so newest insert is first.
    assert rows[0]["id"] == row_c["id"]
    assert rows[1]["id"] == row_b["id"]
    assert rows[2]["id"] == row_a["id"]

    # Category filter narrows correctly.
    only_brand = documents_mod.list_documents(conn, category="brand")
    assert len(only_brand) == 1
    assert only_brand[0]["original_filename"] == "c.pdf"


def test_delete_document_removes_file_and_row_and_is_idempotent(docs_dir, conn):
    upload = _FakeUpload("ein-letter.pdf", b"hello world", "application/pdf")
    row = documents_mod.save_document(upload, "registration", "EIN letter", conn)
    disk_path = docs_dir / row["filename"]
    assert disk_path.exists()

    ok = documents_mod.delete_document(conn, row["id"])
    assert ok is True
    assert not disk_path.exists()
    n = conn.execute("SELECT COUNT(*) AS n FROM documents").fetchone()["n"]
    assert n == 0

    # Second call on the same id returns False without raising.
    ok_again = documents_mod.delete_document(conn, row["id"])
    assert ok_again is False
