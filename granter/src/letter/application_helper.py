"""Application Helper. Drafts answers to grant application questions using
grant context, Nisria org_profile, Nur founder profile, and the document vault
index.

This is Stage 5 of the Nisria Grant Finder pipeline. Nur pastes a question from
a real grant application form on the grant detail page or pipeline card and
gets back a Claude-drafted, fit-aware answer in her voice. The answer is
prose she copies into the funder's portal. If the question is the kind where
a supporting document strengthens the answer, the model ends with a single
"Attach: filename.pdf, ..." line listing items from the documents_index. The
caller pulls that line out so the UI can show a tidy chip list.

This module is defensive about a missing ANTHROPIC_API_KEY (raises ConfigError
so the route can return a friendly 500 instead of crashing the request). It
reuses the same prompt-caching split as src/scoring/llm_rerank.py: the long
identity + documents block is marked cacheable, the per-question body is not.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class ConfigError(RuntimeError):
    """Raised when a required configuration value is missing.

    The web layer maps this to a 500 with a human-readable message so Nur
    sees a clear "ANTHROPIC_API_KEY is not set" message rather than a stack
    trace. Subclassing RuntimeError keeps it distinct from value errors raised
    by parse failures downstream.
    """


# ---------------------------------------------------------------------------
# Prompt template
#
# Tokens are __TOKEN_NAME__ style (same as llm_rerank) so we can str.replace
# without worrying about literal braces in the prose. The prompt is tight on
# purpose: this is a single-question drafter, not a scorer.
# ---------------------------------------------------------------------------

APPLICATION_HELPER_PROMPT = """ROLE
You are Nisria's grant writer. You draft answers to specific application
questions on behalf of Nisria, in Nur's voice. You are warm, specific, and
honest. You never invent numbers, awards, or partners. When a Nisria
document would strengthen the answer (audited financials, 501c3 letter,
Kenya CBO certificate, board roster, brand sheet, photo consents), you
recommend attaching it from the documents index.

ABOUT NISRIA (the organization Nisria applies as)

__ORG_IDENTITY_BLOCK__

ABOUT NUR (the founder whose voice you write in)

__NUR_FOUNDER_PROFILE__

AVAILABLE NISRIA DOCUMENTS (you may recommend attaching any of these)

__DOCUMENTS_INDEX__

THE GRANT THIS QUESTION IS FOR

__GRANT_BLOCK__

VOICE AND LENGTH

  Tone: __TONE__
    formal  measured, third-person-friendly, suitable for foundation portals.
    warm    first-person, relational, suitable for family foundations and
            community funders.
    direct  punchy, first-person, suitable for tight word limits and
            rolling-application portals.

  Maximum length: __MAX_WORDS__ words. Stay inside this cap. Tight is
  better than padded.

THE QUESTION TO ANSWER

__QUESTION__

OUTPUT

  Output the answer as plain prose. No JSON. No code fences. No prefixes
  like "Answer:". Write the answer body, then if a Nisria document should
  be attached to strengthen the answer (audited financials, 501c3 letter,
  Kenya CBO certificate, etc.), end with a single line that begins
  "Attach: " listing the filenames exactly as they appear in the
  documents index, comma-separated. Otherwise omit the Attach line.
"""


# Defaults. Routes can override via kwargs.
DEFAULT_MODEL = "claude-sonnet-4-5"
DEFAULT_MAX_TOKENS = 600
DEFAULT_TEMPERATURE = 0.4
DEFAULT_MAX_WORDS = 220
ALLOWED_TONES = {"formal", "warm", "direct"}

# Matches "Attach: a.pdf, b.pdf" possibly preceded by markdown bold markers.
# Case-insensitive on the label. Filenames are split on commas and stripped.
_ATTACH_LINE_RE = re.compile(
    r"(?im)^\s*\**\s*attach\s*:\s*(.+?)\s*\**\s*$"
)


# ---------------------------------------------------------------------------
# Anthropic client bootstrap
# ---------------------------------------------------------------------------

def get_anthropic_client() -> Any:
    """Return an anthropic.Anthropic client or raise ConfigError.

    The route layer catches ConfigError and renders a friendly 500. We do not
    import anthropic at module top so the rest of this module (and its tests)
    work in environments where the SDK is not yet installed.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ConfigError(
            "ANTHROPIC_API_KEY is not set. Add it to your environment to use "
            "the Application Helper."
        )
    try:
        import anthropic  # type: ignore
    except ImportError as exc:
        raise ConfigError(
            "anthropic SDK is not installed. Run `pip install anthropic>=0.34`."
        ) from exc
    return anthropic.Anthropic(api_key=api_key)


# ---------------------------------------------------------------------------
# Block builders
# ---------------------------------------------------------------------------

def build_documents_index(conn: sqlite3.Connection) -> str:
    """Render the documents table as a bulleted list for the model.

    Each row becomes a line: "  - <original_filename> (<category>): <description>"
    If no rows exist, we return a sentinel string so the prompt still parses
    cleanly. The model is told elsewhere to recommend attaching from this list,
    so the sentinel doubles as a hint that no documents are available yet.
    """
    rows = conn.execute(
        """SELECT original_filename, category, description
           FROM documents
           ORDER BY category, uploaded_at DESC, id DESC"""
    ).fetchall()
    if not rows:
        return "(no Nisria documents uploaded yet)"

    lines: list[str] = []
    for row in rows:
        fname = (row["original_filename"] if isinstance(row, sqlite3.Row) else row[0]) or ""
        cat = (row["category"] if isinstance(row, sqlite3.Row) else row[1]) or "other"
        desc_raw = (row["description"] if isinstance(row, sqlite3.Row) else row[2]) or ""
        desc = desc_raw.strip() or "(no description)"
        lines.append(f"  - {fname} ({cat}): {desc}")
    return "\n".join(lines)


def build_org_identity_block(org_profile_row: dict | None) -> str:
    """Render Nisria's org identity for the prompt.

    Pulls name, EIN, sectors, countries, regions, budget envelope, and the
    program lane definitions from the org_profile row plus the taxonomy_json
    blob. Falls back to readable defaults when fields are missing so a
    half-seeded dev DB still produces a usable prompt.
    """
    row = dict(org_profile_row or {})

    name = row.get("name") or "Nisria Foundation"
    ein = row.get("ein") or "(not on file)"
    org_type = row.get("org_type") or "Nonprofit"
    mission = (row.get("mission") or "").strip() or "(mission not configured)"

    try:
        sectors = json.loads(row.get("sectors_json") or "[]")
    except (TypeError, ValueError):
        sectors = []
    try:
        countries = json.loads(row.get("countries_json") or "[]")
    except (TypeError, ValueError):
        countries = []
    try:
        regions = json.loads(row.get("regions_json") or "[]")
    except (TypeError, ValueError):
        regions = []

    budget = row.get("annual_budget") or 0
    g_min = row.get("grant_range_min") or 5000
    g_max = row.get("grant_range_max") or 250000

    sectors_str = ", ".join(sectors) if sectors else "community development"
    countries_str = ", ".join(countries) if countries else "Kenya"
    regions_str = ", ".join(regions) if regions else "East Africa, Sub-Saharan Africa"

    lines = [
        f"Legal identity: {name} ({org_type}), EIN {ein}.",
        "Sister entity: Nisria Community Development Foundation, a Kenya CBO",
        "  registered in Kenya, operating in Gilgil and Kibera.",
        f"Mission: {mission}",
        f"Sectors: {sectors_str}",
        f"Geography: countries {countries_str}; regions {regions_str}.",
        f"Annual operating budget: USD {int(budget):,}." if budget else "Annual operating budget: modest.",
        f"Typical grant we can absorb: USD {int(g_min):,} to USD {int(g_max):,}.",
        "",
        "Programs (lanes a grant can fund):",
        "  rescue       child rescue and family reunification from street and",
        "               trafficking situations in Gilgil and Kibera.",
        "  education    school fees, vocational training, and Play programs.",
        "  feeding      nutrition and food security for families in our care.",
        "  wellness     holistic care, mental health, HIV care, trauma-informed",
        "               support for survivors and caregivers.",
        "  maisha       Sustainable fashion, upcycled fashion, circular economy,",
        "               artisan livelihoods, women's economic empowerment.",
        "  nur_fellowship  founder awards evaluated on Nur's profile.",
        "",
        "Model signals we can credibly claim: Holistic, Family-Centered,",
        "  Community-First, Anti-Poverty, Locally-Led, Grassroots,",
        "  Reintegration, Trauma-Informed, Survivor-Centered, Place-Based.",
    ]
    return "\n".join(lines)


def _format_grant_amount(grant_row: dict) -> str:
    """Single-line amount range for the grant block."""
    floor = grant_row.get("amount_floor")
    ceiling = grant_row.get("amount_ceiling")
    if floor is None and ceiling is None:
        return "unknown"
    if floor is not None and ceiling is not None:
        return f"USD {int(floor):,} to USD {int(ceiling):,}"
    if floor is not None:
        return f"USD {int(floor):,}+"
    return f"up to USD {int(ceiling):,}"


def _format_json_list(raw: Any) -> str:
    """Decode a *_json column into a comma-joined list for the prompt."""
    if not raw:
        return "(none)"
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return str(raw)
    if isinstance(parsed, list):
        return ", ".join(str(x) for x in parsed if x) or "(none)"
    if isinstance(parsed, dict):
        return ", ".join(f"{k}={v}" for k, v in parsed.items()) or "(none)"
    return str(parsed)


def build_grant_block(grant_row: dict) -> str:
    """Render the grant context block. Single block, easy for the model to scan."""
    g = dict(grant_row or {})
    countries_join = _format_json_list(g.get("countries_json"))
    regions_join = _format_json_list(g.get("regions_json"))
    if countries_join == "(none)" and regions_join == "(none)":
        geography = "(not declared)"
    elif regions_join == "(none)":
        geography = countries_join
    elif countries_join == "(none)":
        geography = regions_join
    else:
        geography = f"countries: {countries_join}; regions: {regions_join}"

    description = (g.get("description") or "(no description)").strip()
    lines = [
        f"Title: {g.get('title') or '(untitled)'}",
        f"Funder: {g.get('agency') or '(unknown)'}",
        f"Source: {g.get('source') or '(unknown)'}",
        f"Amount range: {_format_grant_amount(g)}",
        f"Deadline: {g.get('close_date') or '(not declared)'}",
        f"Geography: {geography}",
        f"Eligibility: {_format_json_list(g.get('eligibility_json'))}",
        "Description:",
        description,
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------

def parse_attach_line(text: str) -> tuple[str, list[str]]:
    """Split the model output into (answer_body, attach_filenames).

    The model is instructed to end with a single "Attach: a.pdf, b.pdf" line
    when documents would help. We strip that line off the body so the UI
    renders pure prose, and we return the comma-split filenames separately.
    Returns ([], []) for the attach list when the line is missing or empty.
    """
    if not text:
        return "", []

    # Search from the bottom of the text so a stray "attach:" earlier in the
    # body cannot fool the parser. We only treat the LAST matching line as the
    # contract attachment line.
    lines = text.splitlines()
    attach_idx = None
    for i in range(len(lines) - 1, -1, -1):
        if _ATTACH_LINE_RE.match(lines[i]):
            attach_idx = i
            break

    if attach_idx is None:
        return text.strip(), []

    match = _ATTACH_LINE_RE.match(lines[attach_idx])
    raw = match.group(1) if match else ""
    # Strip markdown bold around the filenames too.
    raw = raw.strip().strip("*").strip()
    filenames = [f.strip().strip("*").strip() for f in raw.split(",")]
    filenames = [f for f in filenames if f]

    body_lines = lines[:attach_idx]
    # Trim trailing blank lines from the body so the copy-button payload is tight.
    while body_lines and not body_lines[-1].strip():
        body_lines.pop()
    body = "\n".join(body_lines).strip()
    return body, filenames


# ---------------------------------------------------------------------------
# Prompt rendering
# ---------------------------------------------------------------------------

def _render_prompt(
    grant_row: dict,
    org_profile_row: dict,
    documents_index: str,
    question: str,
    tone: str,
    max_words: int,
) -> str:
    """Substitute runtime fields into APPLICATION_HELPER_PROMPT."""
    nur_profile = (org_profile_row.get("nur_founder_profile") or "").strip()
    if not nur_profile:
        nur_profile = "(founder profile not configured)"

    org_identity_block = build_org_identity_block(org_profile_row)
    grant_block = build_grant_block(grant_row)

    replacements = {
        "__ORG_IDENTITY_BLOCK__": org_identity_block,
        "__NUR_FOUNDER_PROFILE__": nur_profile,
        "__DOCUMENTS_INDEX__": documents_index,
        "__GRANT_BLOCK__": grant_block,
        "__TONE__": tone,
        "__MAX_WORDS__": str(max_words),
        "__QUESTION__": question.strip() or "(no question provided)",
    }

    prompt = APPLICATION_HELPER_PROMPT
    for token, value in replacements.items():
        prompt = prompt.replace(token, value)
    return prompt


# ---------------------------------------------------------------------------
# Anthropic call
# ---------------------------------------------------------------------------

def _extract_text(response: Any) -> str:
    """Pull the first text block out of an Anthropic response object."""
    text = ""
    try:
        for block in response.content:
            block_type = getattr(block, "type", None) or (
                block.get("type") if isinstance(block, dict) else None
            )
            if block_type == "text":
                text = getattr(block, "text", None) or (
                    block.get("text") if isinstance(block, dict) else ""
                )
                if text:
                    break
    except (AttributeError, TypeError):
        text = ""
    return text or ""


def _extract_tokens_used(response: Any) -> int:
    """Best-effort tokens_used = input + output. Returns 0 if unavailable."""
    try:
        usage = getattr(response, "usage", None)
        if usage is None:
            return 0
        in_tokens = getattr(usage, "input_tokens", 0) or 0
        out_tokens = getattr(usage, "output_tokens", 0) or 0
        # Cache-aware tallies: Anthropic returns cache_creation_input_tokens and
        # cache_read_input_tokens too. We add them so the operator sees a real
        # total in the UI, not an artificially low number.
        cache_create = getattr(usage, "cache_creation_input_tokens", 0) or 0
        cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
        return int(in_tokens) + int(out_tokens) + int(cache_create) + int(cache_read)
    except (AttributeError, TypeError):
        return 0


def draft_application_answer(
    conn: sqlite3.Connection,
    grant_row: dict,
    question: str,
    tone: str = "warm",
    max_words: int = DEFAULT_MAX_WORDS,
    *,
    client: Any = None,
    model: str = DEFAULT_MODEL,
) -> dict:
    """Draft a Claude answer to one application question.

    Args:
        conn: SQLite connection. We read org_profile row 1 and the documents
              table to build the prompt.
        grant_row: dict-like grants row carrying title, agency, description,
                   amounts, deadline, geography, eligibility.
        question: The raw question pasted from the funder's application form.
        tone: formal | warm | direct. Falls back to warm if anything else.
        max_words: cap on answer length. Bound by the caller (route layer).
        client: optional pre-built anthropic client (for tests + reuse).
        model: override the default model name.

    Returns:
        {
          "answer": str,             # the prose body, attach line stripped
          "attach_filenames": list,  # filenames the model recommended
          "model": str,              # model id we actually called
          "tokens_used": int,        # input + output + cache, best effort
        }

    Raises:
        ConfigError: when ANTHROPIC_API_KEY is missing or anthropic SDK is not
                     installed.
        ValueError:  when the question is empty.
    """
    if not question or not question.strip():
        raise ValueError("Question is required")

    if tone not in ALLOWED_TONES:
        tone = "warm"

    # Load Nisria's identity row.
    org_row = conn.execute("SELECT * FROM org_profile WHERE id = 1").fetchone()
    org_profile = dict(org_row) if org_row else {}

    documents_index = build_documents_index(conn)

    full_prompt = _render_prompt(
        grant_row=dict(grant_row or {}),
        org_profile_row=org_profile,
        documents_index=documents_index,
        question=question,
        tone=tone,
        max_words=max_words,
    )

    # Same caching split as llm_rerank.py: everything before "THE QUESTION TO
    # ANSWER" is identity + grant context that we want to keep warm in the
    # cache. The question itself is the only per-call body.
    split_token = "\nTHE QUESTION TO ANSWER\n"
    if split_token in full_prompt:
        fixed_part, question_part = full_prompt.split(split_token, 1)
        question_part = split_token + question_part
    else:
        fixed_part = full_prompt
        question_part = ""

    system_blocks = [
        {
            "type": "text",
            "text": fixed_part,
            "cache_control": {"type": "ephemeral"},
        }
    ]
    user_blocks = [
        {"type": "text", "text": question_part or "(no question body)"},
    ]

    if client is None:
        client = get_anthropic_client()

    response = client.messages.create(
        model=model,
        max_tokens=DEFAULT_MAX_TOKENS,
        temperature=DEFAULT_TEMPERATURE,
        system=system_blocks,
        messages=[{"role": "user", "content": user_blocks}],
    )

    raw_text = _extract_text(response)
    body, attach = parse_attach_line(raw_text)

    return {
        "answer": body,
        "attach_filenames": attach,
        "model": model,
        "tokens_used": _extract_tokens_used(response),
    }
