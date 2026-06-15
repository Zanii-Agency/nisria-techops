"""Settings routes: org profile editor, source toggles, document vault."""

from __future__ import annotations

import json
import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Request, Form, UploadFile, File
from fastapi.responses import RedirectResponse, FileResponse

from src.common.db import get_db
from src.common import documents as documents_mod
from src.web.templates import render

logger = logging.getLogger(__name__)

router = APIRouter()


def _parse_list_field(raw: str) -> list[str]:
    return [s.strip() for s in raw.split(",") if s.strip()]


@router.get("/")
async def settings_view(request: Request):
    conn = get_db()
    try:
        org = conn.execute("SELECT * FROM org_profile WHERE id = 1").fetchone()
        sources = conn.execute("SELECT * FROM source_status ORDER BY source").fetchall()
        docs = documents_mod.list_documents(conn)

        # Group documents by category for display.
        docs_by_category: dict[str, list[dict]] = {
            cat: [] for cat in documents_mod.DOCUMENT_CATEGORIES
        }
        for doc in docs:
            cat = doc.get("category") or "other"
            docs_by_category.setdefault(cat, []).append(doc)

        return render("settings.html", {
            "request": request,
            "org": dict(org) if org else {},
            "sources": [dict(s) for s in sources],
            "documents": docs,
            "documents_by_category": docs_by_category,
            "document_categories": documents_mod.DOCUMENT_CATEGORIES,
            "max_file_bytes": documents_mod.MAX_FILE_BYTES,
            "allowed_ext": sorted(documents_mod.ALLOWED_EXT),
        })
    finally:
        conn.close()


@router.post("/profile")
async def update_profile(
    name: str = Form(""),
    mission: str = Form(""),
    ein: str = Form(""),
    sectors: str = Form(""),
    countries: str = Form(""),
    regions: str = Form(""),
    grant_range_min: float = Form(5000),
    grant_range_max: float = Form(250000),
    org_type: str = Form("Nonprofit"),
    annual_budget: float = Form(0),
    nur_founder_profile: str = Form(""),
    taxonomy_json: str = Form("{}"),
    category_weights_json: str = Form("{}"),
):
    """Update all org_profile fields, including taxonomy + weights + founder bio."""
    # Validate the two JSON textareas. Bad JSON bounces back with ?error=invalid_json.
    try:
        json.loads(taxonomy_json or "{}")
        json.loads(category_weights_json or "{}")
    except json.JSONDecodeError as exc:
        logger.warning("Settings profile rejected: invalid JSON (%s)", exc)
        params = urlencode({"error": "invalid_json"})
        return RedirectResponse(url=f"/settings?{params}", status_code=303)

    sectors_list = _parse_list_field(sectors)
    countries_list = [c.strip().upper() for c in countries.split(",") if c.strip()]
    regions_list = _parse_list_field(regions)

    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO org_profile (
                   id, name, mission, ein,
                   sectors_json, countries_json, regions_json,
                   annual_budget, grant_range_min, grant_range_max, org_type,
                   taxonomy_json, category_weights_json, nur_founder_profile
               )
               VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                   name=excluded.name,
                   mission=excluded.mission,
                   ein=excluded.ein,
                   sectors_json=excluded.sectors_json,
                   countries_json=excluded.countries_json,
                   regions_json=excluded.regions_json,
                   annual_budget=excluded.annual_budget,
                   grant_range_min=excluded.grant_range_min,
                   grant_range_max=excluded.grant_range_max,
                   org_type=excluded.org_type,
                   taxonomy_json=excluded.taxonomy_json,
                   category_weights_json=excluded.category_weights_json,
                   nur_founder_profile=excluded.nur_founder_profile""",
            (
                name, mission, ein,
                json.dumps(sectors_list),
                json.dumps(countries_list),
                json.dumps(regions_list),
                annual_budget, grant_range_min, grant_range_max, org_type,
                taxonomy_json or "{}",
                category_weights_json or "{}",
                nur_founder_profile or "",
            ),
        )
        conn.commit()
        return RedirectResponse(url="/settings?saved=profile", status_code=303)
    finally:
        conn.close()


@router.post("/org")
async def update_org_legacy(
    name: str = Form(""),
    mission: str = Form(""),
    ein: str = Form(""),
    sectors: str = Form(""),
    countries: str = Form(""),
    annual_budget: float = Form(0),
    grant_range_min: float = Form(5000),
    grant_range_max: float = Form(250000),
    org_type: str = Form("Nonprofit"),
):
    """Legacy endpoint kept for callers/tests that still POST /settings/org.

    Forwards the basic identity fields without touching taxonomy/weights/founder.
    """
    sectors_list = _parse_list_field(sectors)
    countries_list = [c.strip().upper() for c in countries.split(",") if c.strip()]

    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO org_profile (
                   id, name, mission, ein, sectors_json, countries_json,
                   annual_budget, grant_range_min, grant_range_max, org_type
               )
               VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                   name=excluded.name, mission=excluded.mission, ein=excluded.ein,
                   sectors_json=excluded.sectors_json, countries_json=excluded.countries_json,
                   annual_budget=excluded.annual_budget,
                   grant_range_min=excluded.grant_range_min,
                   grant_range_max=excluded.grant_range_max,
                   org_type=excluded.org_type""",
            (name, mission, ein, json.dumps(sectors_list), json.dumps(countries_list),
             annual_budget, grant_range_min, grant_range_max, org_type),
        )
        conn.commit()
        return RedirectResponse(url="/settings", status_code=303)
    finally:
        conn.close()


@router.post("/sources/{source_name}/toggle")
async def toggle_source(source_name: str):
    conn = get_db()
    try:
        conn.execute(
            "UPDATE source_status SET is_enabled = CASE WHEN is_enabled = 1 THEN 0 ELSE 1 END WHERE source = ?",
            (source_name,),
        )
        conn.commit()
        return RedirectResponse(url="/settings", status_code=303)
    finally:
        conn.close()


# Document Vault routes


@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    category: str = Form("other"),
    description: str = Form(""),
):
    conn = get_db()
    try:
        try:
            documents_mod.save_document(file, category, description, conn)
        except documents_mod.DocumentError as exc:
            logger.warning("Document upload rejected: %s", exc)
            params = urlencode({"error": "upload_rejected", "reason": str(exc)})
            return RedirectResponse(url=f"/settings?{params}#documents", status_code=303)
        return RedirectResponse(url="/settings?saved=doc#documents", status_code=303)
    finally:
        conn.close()


@router.post("/documents/{doc_id}/delete")
async def delete_document_route(doc_id: int):
    conn = get_db()
    try:
        documents_mod.delete_document(conn, doc_id)
        return RedirectResponse(url="/settings?saved=delete#documents", status_code=303)
    finally:
        conn.close()


@router.get("/documents/{doc_id}/download")
async def download_document(doc_id: int):
    conn = get_db()
    try:
        row = documents_mod.get_document(conn, doc_id)
        if not row:
            return RedirectResponse(url="/settings?error=not_found#documents", status_code=303)
        path = documents_mod.document_path(row)
        if not path.exists():
            return RedirectResponse(url="/settings?error=missing_file#documents", status_code=303)
        return FileResponse(
            path=str(path),
            filename=row["original_filename"],
            media_type=row.get("mime_type") or "application/octet-stream",
        )
    finally:
        conn.close()
