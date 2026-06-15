"""Tests for the Stage 5 Application Helper module.

Pure-Python pieces only. We do not hit the Anthropic API. Tests cover:
  - build_documents_index empty + populated cases
  - draft_application_answer raises ConfigError when ANTHROPIC_API_KEY missing
  - parse_attach_line correctly splits the trailing "Attach: ..." line
"""

from __future__ import annotations

import sqlite3

import pytest

from src.common.db import ensure_tables
from src.letter.application_helper import (
    ConfigError,
    build_documents_index,
    draft_application_answer,
    parse_attach_line,
)


@pytest.fixture
def conn():
    """In-memory SQLite with all tables created."""
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    ensure_tables(c)
    yield c
    c.close()


# ---------------------------------------------------------------------------
# build_documents_index
# ---------------------------------------------------------------------------

class TestBuildDocumentsIndex:
    def test_empty_table_returns_sentinel(self, conn):
        """No rows in the documents table should produce the no-docs sentinel.

        The sentinel doubles as a hint to the model that no documents are
        available to recommend attaching.
        """
        result = build_documents_index(conn)
        assert result == "(no Nisria documents uploaded yet)"

    def test_renders_rows_with_filenames(self, conn):
        """When rows are present, the bulleted list mentions every filename."""
        conn.execute(
            """INSERT INTO documents (
                filename, original_filename, category, mime_type, size_bytes, description
            ) VALUES (?, ?, ?, ?, ?, ?)""",
            ("a1.pdf", "501c3-letter.pdf", "registration", "application/pdf", 1234, "IRS determination letter"),
        )
        conn.execute(
            """INSERT INTO documents (
                filename, original_filename, category, mime_type, size_bytes, description
            ) VALUES (?, ?, ?, ?, ?, ?)""",
            ("b2.pdf", "audited-financials-2025.pdf", "financials", "application/pdf", 5678, "FY2025 audited statements"),
        )
        conn.commit()

        result = build_documents_index(conn)

        assert "501c3-letter.pdf" in result
        assert "audited-financials-2025.pdf" in result
        # Category labels surface so the model can pick a matching one.
        assert "registration" in result
        assert "financials" in result
        # Descriptions are included so the model picks the right doc.
        assert "IRS determination letter" in result
        assert "FY2025 audited statements" in result
        # Bulleted list format: each row begins with "  - ".
        assert result.count("  - ") == 2


# ---------------------------------------------------------------------------
# draft_application_answer config guard
# ---------------------------------------------------------------------------

class TestDraftRequiresApiKey:
    def test_missing_api_key_raises_config_error(self, conn, monkeypatch):
        """No ANTHROPIC_API_KEY in env should produce a ConfigError, not a
        cryptic AttributeError or a real network call."""
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

        # Minimal grant_row that exercises the prompt builder without depending
        # on conftest fixtures.
        grant_row = {
            "id": 1,
            "title": "Test Grant",
            "agency": "Test Funder",
            "source": "grants_gov",
            "amount_floor": 50000,
            "amount_ceiling": 200000,
            "close_date": "2026-12-31",
            "description": "A test grant for children's programs in Kenya.",
            "countries_json": '["KE"]',
            "regions_json": '["East Africa"]',
            "eligibility_json": '["Nonprofit"]',
        }

        with pytest.raises(ConfigError) as exc_info:
            draft_application_answer(
                conn,
                grant_row,
                question="What is your organization's mission?",
                tone="warm",
                max_words=220,
            )
        assert "ANTHROPIC_API_KEY" in str(exc_info.value)


# ---------------------------------------------------------------------------
# parse_attach_line
# ---------------------------------------------------------------------------

class TestParseAttachLine:
    def test_parses_two_filenames(self):
        """The canonical 'Attach: a.pdf, b.pdf' shape must produce a clean
        body + a 2-element filenames list."""
        raw = (
            "Answer body here.\n"
            "\n"
            "Attach: 501c3-letter.pdf, audited-financials.pdf"
        )
        body, attach = parse_attach_line(raw)
        assert body == "Answer body here."
        assert attach == ["501c3-letter.pdf", "audited-financials.pdf"]

    def test_no_attach_line_returns_empty_list(self):
        """When the model omits the Attach line we get the full body back and
        an empty filenames list, never None or a crash."""
        raw = "Just a plain answer body with no Attach line."
        body, attach = parse_attach_line(raw)
        assert body == "Just a plain answer body with no Attach line."
        assert attach == []

    def test_single_filename(self):
        """One filename, no trailing comma, still parses cleanly."""
        raw = "Short answer.\n\nAttach: kenya-cbo-certificate.pdf"
        body, attach = parse_attach_line(raw)
        assert body == "Short answer."
        assert attach == ["kenya-cbo-certificate.pdf"]

    def test_case_insensitive_label(self):
        """ATTACH or attach should both work (model may capitalize)."""
        raw = "Body.\n\nATTACH: 990.pdf"
        body, attach = parse_attach_line(raw)
        assert body == "Body."
        assert attach == ["990.pdf"]
