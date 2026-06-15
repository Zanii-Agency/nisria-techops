"""Grant search and detail routes."""

from __future__ import annotations

import csv
import io
import logging

from fastapi import APIRouter, Form, Request, Query
from fastapi.responses import JSONResponse, StreamingResponse

from src.common.db import get_db
from src.letter.application_helper import (
    ConfigError,
    draft_application_answer,
)
from src.web.templates import render

logger = logging.getLogger(__name__)

router = APIRouter()

PAGE_SIZE = 25

# Bounds for the Application Helper form. The model handles longer questions
# fine, but keeping these tight protects against accidental dumps of an entire
# RFP into the form (which would blow our caching split and cost more than it
# helps).
MAX_QUESTION_CHARS = 1500
MIN_MAX_WORDS = 50
MAX_MAX_WORDS = 600
DEFAULT_MAX_WORDS_FORM = 220


@router.get("/")
async def grant_search(
    request: Request,
    q: str = "",
    source: str = "",
    tier: str = "",
    status: str = "",
    page: int = 1,
):
    conn = get_db()
    try:
        offset = (page - 1) * PAGE_SIZE
        params = []
        where_clauses = []

        if q:
            where_clauses.append("grants.id IN (SELECT rowid FROM grants_fts WHERE grants_fts MATCH ?)")
            params.append(q)
        if source:
            where_clauses.append("grants.source = ?")
            params.append(source)
        if tier:
            where_clauses.append("grants.relevance_tier = ?")
            params.append(tier)
        if status:
            where_clauses.append("grants.status = ?")
            params.append(status)

        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

        count = conn.execute(
            f"SELECT COUNT(*) FROM grants WHERE {where_sql}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"""SELECT * FROM grants WHERE {where_sql}
                ORDER BY relevance_score DESC, close_date ASC
                LIMIT ? OFFSET ?""",
            params + [PAGE_SIZE, offset],
        ).fetchall()

        total_pages = (count + PAGE_SIZE - 1) // PAGE_SIZE

        all_sources = conn.execute(
            "SELECT DISTINCT source FROM grants ORDER BY source"
        ).fetchall()

        return render("grants.html", {
            "request": request,
            "grants": [dict(r) for r in rows],
            "q": q,
            "source": source,
            "tier": tier,
            "status": status,
            "page": page,
            "total_pages": total_pages,
            "total_count": count,
            "all_sources": [r["source"] for r in all_sources],
        })
    finally:
        conn.close()


@router.get("/export")
async def export_csv(
    q: str = "",
    source: str = "",
    tier: str = "",
    status: str = "",
):
    """Export filtered grants as CSV."""
    conn = get_db()
    try:
        params = []
        where_clauses = []

        if q:
            where_clauses.append("grants.id IN (SELECT rowid FROM grants_fts WHERE grants_fts MATCH ?)")
            params.append(q)
        if source:
            where_clauses.append("grants.source = ?")
            params.append(source)
        if tier:
            where_clauses.append("grants.relevance_tier = ?")
            params.append(tier)
        if status:
            where_clauses.append("grants.status = ?")
            params.append(status)

        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

        rows = conn.execute(
            f"SELECT * FROM grants WHERE {where_sql} ORDER BY relevance_score DESC",
            params,
        ).fetchall()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Title", "Agency", "Source", "Amount Floor", "Amount Ceiling",
            "Status", "Open Date", "Close Date", "Relevance Score", "Tier", "URL",
        ])
        for row in rows:
            r = dict(row)
            writer.writerow([
                r["title"], r["agency"], r["source"],
                r["amount_floor"], r["amount_ceiling"],
                r["status"], r["open_date"], r["close_date"],
                r["relevance_score"], r["relevance_tier"], r["url"],
            ])

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=grants_export.csv"},
        )
    finally:
        conn.close()


@router.get("/{grant_id}")
async def grant_detail(request: Request, grant_id: int):
    conn = get_db()
    try:
        grant = conn.execute("SELECT * FROM grants WHERE id = ?", (grant_id,)).fetchone()

        application = None
        if grant:
            application = conn.execute(
                "SELECT * FROM applications WHERE grant_id = ?", (grant_id,)
            ).fetchone()

        return render("grant_detail.html", {
            "request": request,
            "grant": dict(grant) if grant else None,
            "application": dict(application) if application else None,
        })
    finally:
        conn.close()


@router.post("/{grant_id}/ask")
async def grant_ask(
    grant_id: int,
    question: str = Form(...),
    tone: str = Form("warm"),
    max_words: int = Form(DEFAULT_MAX_WORDS_FORM),
):
    """Draft a Claude answer to a single application question.

    Body is JSON shaped:
      success: {"ok": true, "answer": "...", "attach": [...], "tokens_used": N,
                "model": "..."}
      failure: {"ok": false, "error": "..."}  with HTTP 400 or 500.

    The route is permissive on tone (defaults to warm) and clamps max_words
    into [MIN_MAX_WORDS, MAX_MAX_WORDS] so a manually crafted form post can't
    blow the token budget. Empty questions are rejected before touching the
    model.
    """
    # Validate question.
    q = (question or "").strip()
    if not q:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "Question is required"},
        )
    if len(q) > MAX_QUESTION_CHARS:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": f"Question is too long (max {MAX_QUESTION_CHARS} characters)",
            },
        )

    # Clamp max_words.
    try:
        max_words_int = int(max_words)
    except (TypeError, ValueError):
        max_words_int = DEFAULT_MAX_WORDS_FORM
    if max_words_int < MIN_MAX_WORDS:
        max_words_int = MIN_MAX_WORDS
    if max_words_int > MAX_MAX_WORDS:
        max_words_int = MAX_MAX_WORDS

    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM grants WHERE id = ?", (grant_id,)).fetchone()
        if not row:
            return JSONResponse(
                status_code=404,
                content={"ok": False, "error": "Grant not found"},
            )
        grant_row = dict(row)

        try:
            result = draft_application_answer(
                conn,
                grant_row,
                question=q,
                tone=tone,
                max_words=max_words_int,
            )
        except ConfigError as exc:
            logger.warning("Application Helper config error: %s", exc)
            return JSONResponse(
                status_code=500,
                content={"ok": False, "error": str(exc)},
            )
        except ValueError as exc:
            return JSONResponse(
                status_code=400,
                content={"ok": False, "error": str(exc)},
            )
        except Exception as exc:
            logger.exception(
                "Application Helper failed for grant_id=%s: %s", grant_id, exc
            )
            return JSONResponse(
                status_code=500,
                content={
                    "ok": False,
                    "error": f"Claude call failed: {exc}",
                },
            )

        return JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "answer": result["answer"],
                "attach": result["attach_filenames"],
                "tokens_used": result["tokens_used"],
                "model": result["model"],
            },
        )
    finally:
        conn.close()
