"""Letter generator route."""

from __future__ import annotations

from fastapi import APIRouter, Request
from src.common.db import get_db
from src.web.templates import render
from src.letter.generator import generate_letter

router = APIRouter()


@router.get("/letter")
async def letter_page(
    request: Request,
    funder_id: int = 0,
    tone: str = "formal",
    custom_funder_name: str = "",
    custom_funder_sector: str = "",
    custom_funder_geography: str = "",
):
    conn = get_db()
    try:
        funders = conn.execute("SELECT id, name FROM funders ORDER BY name").fetchall()
        letter = ""

        custom_name_clean = (custom_funder_name or "").strip()

        if custom_name_clean:
            # Custom funder overrides the dropdown entirely.
            synthetic_funder = {
                "id": None,
                "name": custom_name_clean,
                "sector_focus": (custom_funder_sector or "").strip(),
                "geographic_focus": (custom_funder_geography or "").strip(),
                "description": "",
            }
            letter = generate_letter(conn, synthetic_funder, tone)
        elif funder_id:
            letter = generate_letter(conn, funder_id, tone)

        return render("letter.html", {
            "request": request,
            "funders": [dict(f) for f in funders],
            "selected_funder_id": funder_id,
            "tone": tone,
            "letter": letter,
            "custom_funder_name": custom_funder_name,
            "custom_funder_sector": custom_funder_sector,
            "custom_funder_geography": custom_funder_geography,
        })
    finally:
        conn.close()
