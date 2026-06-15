"""Cold outreach letter generator for funder profiles.

Generates templated letters in 3 tones: formal, warm, direct.
Uses funder data from ProPublica and org profile from settings.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime

TEMPLATES = {
    "formal": """Dear {contact_name},

I am writing on behalf of {org_name} to introduce our organization and explore potential partnership opportunities.

{org_name} is a {org_type} dedicated to {mission}. We operate primarily in {countries}, focusing on {sectors}.

We have identified {funder_name} as an organization whose philanthropic priorities align closely with our mission. {funder_context}

Our current annual budget is ${annual_budget:,.0f}, and we are seeking grant support in the range of ${grant_min:,.0f} to ${grant_max:,.0f} to expand our programs in the following areas:

{program_areas}

We would welcome the opportunity to discuss how our work aligns with your funding priorities. Please find our organizational profile attached for your review.

Thank you for your time and consideration.

Sincerely,
{org_name}""",

    "warm": """Dear {contact_name},

I hope this message finds you well. I'm reaching out from {org_name}, a {org_type} working in {countries} on issues we believe resonate with {funder_name}'s mission.

{org_name} focuses on {sectors}, and we've been particularly inspired by {funder_name}'s commitment to similar causes. {funder_context}

We're currently seeking funding partners who share our passion for {mission}. With a grant in the range of ${grant_min:,.0f} to ${grant_max:,.0f}, we could meaningfully expand our impact in:

{program_areas}

I'd love to schedule a brief call to share more about our work and learn about your current funding priorities. Would you have 15 minutes in the coming weeks?

Warm regards,
{org_name}""",

    "direct": """Dear {contact_name},

{org_name} is a {org_type} in {countries} seeking ${grant_min:,.0f}-${grant_max:,.0f} in grant funding for our {sectors} programs.

{funder_context}

Our key programs:

{program_areas}

Annual budget: ${annual_budget:,.0f}
Primary focus: {mission}

We'd appreciate the opportunity to submit a proposal. Could you share your current application guidelines?

Best regards,
{org_name}""",
}


def generate_letter(
    conn: sqlite3.Connection,
    funder: "int | dict",
    tone: str = "formal",
) -> str:
    """Generate a cold outreach letter for a funder.

    `funder` can be either:
      - an int funder_id (legacy): we look the row up by id, OR
      - a dict with at least {"name": str}: a synthetic funder context passed
        in from the route when Nur is writing to a funder not in the database.
    """
    # Get org profile
    org = conn.execute("SELECT * FROM org_profile WHERE id = 1").fetchone()
    if not org:
        return "Error: No organization profile configured. Please set up your profile in Settings."

    org = dict(org)

    # Resolve funder: either look up by id or trust the dict the route built.
    if isinstance(funder, dict):
        if not funder.get("name"):
            return "Error: Funder name is required."
        # Synthetic dicts may not carry annual_giving/assets, so we leave the
        # downstream lookups defensive (.get() with defaults).
        funder = dict(funder)
    else:
        funder_row = conn.execute(
            "SELECT * FROM funders WHERE id = ?", (funder,)
        ).fetchone()
        if not funder_row:
            return "Error: Funder not found."
        funder = dict(funder_row)

    # Build context
    sectors = json.loads(org.get("sectors_json", "[]") or "[]")
    countries = json.loads(org.get("countries_json", "[]") or "[]")

    funder_context = ""
    if funder.get("annual_giving"):
        funder_context = f"With ${funder['annual_giving']:,.0f} in annual giving, your organization has demonstrated significant commitment to community impact."
    elif funder.get("assets"):
        funder_context = f"With ${funder['assets']:,.0f} in assets, {funder['name']} is well-positioned to make a meaningful difference."
    else:
        # Synthetic funder (no financial profile). Weave sector / geography
        # focus into the context if Nur provided them.
        bits = []
        if funder.get("sector_focus"):
            bits.append(f"focus on {funder['sector_focus']}")
        if funder.get("geographic_focus"):
            bits.append(f"work in {funder['geographic_focus']}")
        if bits:
            funder_context = (
                f"Your {' and '.join(bits)} aligns closely with the communities we serve."
            )

    program_areas = "\n".join(f"  - {s.title()}" for s in sectors[:5]) if sectors else "  - Community development programs"

    template = TEMPLATES.get(tone, TEMPLATES["formal"])

    return template.format(
        contact_name=funder.get("contact_name") or "Grant Review Committee",
        org_name=org.get("name", "Our Organization"),
        org_type=org.get("org_type", "nonprofit"),
        mission=org.get("mission", "community development"),
        countries=", ".join(countries) if countries else "our community",
        sectors=", ".join(sectors[:4]) if sectors else "community development",
        funder_name=funder.get("name", "your organization"),
        funder_context=funder_context,
        annual_budget=org.get("annual_budget", 0),
        grant_min=org.get("grant_range_min", 5000),
        grant_max=org.get("grant_range_max", 250000),
        program_areas=program_areas,
    )
