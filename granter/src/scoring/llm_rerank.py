"""Stage 2 LLM re-rank for Nisria Grant Finder.

This module is the hybrid matcher's second pass. Stage 1 (the lensed 9-category
keyword scorer in src/scoring/relevance.py) gives every grant a cheap relevance
score and tier. Stage 2 takes only the top-N candidates from that ranking and
asks Claude to score each on a richer rubric: organisation vs founder lane,
program lane, commercial criteria, alignment reasons, risks, and an apply
recommendation. The model returns a single JSON object per grant.

To avoid re-paying for the same grant on every refresh, every result is cached
in the grant_llm_scores table (one row per grant) and a grant is skipped if its
row is fresher than the configured cache window (default 14 days).

This module never crashes the pipeline. If the ANTHROPIC_API_KEY env var is
missing, rerank_top_n logs a warning and returns 0 without scoring anything.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


# We keep the JSON template at the bottom of the prompt with LITERAL { and }
# braces and use str.replace() (not str.format) to inject runtime fields. That
# avoids the brace-escaping mess that str.format() forces on a prompt full of
# real JSON. Tokens are unambiguous: every interpolated field is a single token
# of the form __TOKEN_NAME__, never naked braces.
GRANT_FIT_MASTER_PROMPT = """ROLE
You are the Nisria Grant Fit Evaluator. Your job is to read one grant
opportunity and decide whether Nisria should apply, returning a single
JSON object with a 0 to 10 fit score, a tier, the specific Nisria
program it best fits, the tags it matches, the top alignment reasons,
the top risks, the missing information needed to apply, and an apply
recommendation. You are calibrated, skeptical, and specific. You do
not pad scores. You do not invent facts about the grant.

ABOUT NISRIA (the organization Nisria applies as)

Legal identity:
  By Nisria Inc, a US 501c3 registered in Florida, EIN 88-3508268.
  Sister entity: Nisria Community Development Foundation, a Kenya CBO
  registered in Kenya, operating in Gilgil and Kibera. International
  grants can land on either side; the US 501c3 is the default landing
  for foundations that require US tax exempt status.

Founder:
__NUR_FOUNDER_PROFILE__

Programs (the lanes a grant can fund):
  rescue       child rescue and family reunification from street and
               trafficking situations in Gilgil and Kibera. Safe haven,
               trauma-informed, psychosocial support, reintegration.
  education    school fees, vocational training, and Play programs
               for vulnerable children and survivors.
  feeding      nutrition and food security for families in our care.
  wellness     holistic care, mental health, HIV care, trauma-informed
               support for survivors and caregivers.
  maisha       Maisha and AHADI sister brands. Sustainable fashion,
               upcycled fashion, circular economy, textile waste reuse,
               ethical fashion, artisan livelihoods, fair trade, women
               artisans, social enterprise, income generation, women's
               economic empowerment.
  nur_fellowship  personal awards to Nur as founder, evaluated on
               founder profile rather than program activity. Use this
               lane for changemaker, emerging leader, mid career,
               visionary, pioneer, humanitarian, social innovator,
               cross cultural, and women of color tracks.

Geography:
  primary    Kenya, with deep on the ground presence in Gilgil and
             Kibera.
  secondary  East Africa, Sub-Saharan Africa, Africa, Global South.
  diaspora   Nur is a diaspora leader, so grants for diaspora founders
             or diaspora led organizations are in scope.

Budget reality:
  Annual operating budget is modest. Typical grant we can absorb is
  USD 5,000 to USD 250,000. Multi year grants are welcome. Match
  requirements above 25 percent are difficult unless the match can
  be made up of in kind volunteer time or Maisha social enterprise
  revenue.

Model signals (the words funders use that we can credibly claim):
  Holistic, Family-Centered, Community-First, Anti-Poverty,
  Locally-Led, Grassroots, Reintegration, Trauma-Informed,
  Survivor-Centered, Place-Based.

THE TAXONOMY (the lenses you score across, with weights)

__TAXONOMY_BLOCK__

COMMERCIAL GRANT CRITERIA (read these on the grant before you score)

These are the things real grant search platforms (Candid, Instrumentl,
GrantHub, Foundation Directory) look at. Pull them from the grant text
if present, and call them out as missing_info_needed if absent.

  funder_type        foundation, family office, government bilateral,
                     multilateral, corporate, individual donor, donor
                     advised fund, community foundation, religious,
                     fiscal sponsor.
  award_format       LOI then full proposal, open RFP, invite only,
                     rolling application, annual cycle, quarterly
                     cycle.
  award_range        floor and ceiling in USD.
  average_award      typical award size.
  match_required     percent of project budget the grantee must match.
  restricted         is the grant restricted to a specific project or
                     unrestricted general operating support.
  multi_year         is multi year funding offered.
  reporting_burden   light, medium, heavy. Heavy is a deal breaker
                     under USD 50,000.
  past_awardees      have they funded grassroots African women led
                     orgs before. If yes, score higher.
  application_cost   estimated hours of work to apply. If over 40
                     hours for an award under USD 25,000, flag as
                     poor ROI in top_2_risks.
  trust_based        does the funder follow trust based philanthropy
                     practices (no logic models, no detailed budgets,
                     unrestricted). Trust based funders score higher
                     for grassroots orgs like us.
  eligibility_us_501c3       can we apply as By Nisria Inc.
  eligibility_kenya_cbo      can we apply as the Kenya CBO.
  eligibility_fiscal_sponsor accepts a fiscal sponsor for orgs not yet
                             registered. We do not need this.
  dei_lens           does the funder explicitly prioritize women of
                     color led, African led, diaspora led, or
                     grassroots organizations.

SCORING RUBRIC

  10  ideal fit. Hits geography, people, leadership, AND at least one
      Nisria program directly. Funder has past awardees that look like
      us. Award range fits our 5K to 250K budget. Trust based or DEI
      lens.
  8 to 9   strong fit. Three or more lenses hit, geography in scope,
      eligible. Worth a yes.
  6 to 7   solid fit. Two lenses hit, eligible, deadline workable.
      Worth a maybe if Nur has capacity.
  4 to 5   weak fit. One lens hits, possibly tangentially. Apply only
      if pipeline is empty.
  2 to 3   poor fit. Geography or program mismatch but not a hard
      reject.
  0 to 1   wrong. Hard filter should have caught this.

  Tiers:
    HIGH    score 7 or higher
    MEDIUM  score 4 to 6
    LOW     score 2 to 3
    SKIP    score 0 to 1

HARD FILTERS (do not score, return SKIP with reason)

  filter_deadline_passed       deadline is in the past from today.
  filter_geography_excludes_us geography is restricted to US only with
                               no Kenya, East Africa, Africa, or Global
                               South carve out.
  filter_ineligible_org_type   excludes 501c3, excludes international,
                               or excludes nonprofits.
  filter_misaligned_mandate    funder is explicitly anti faith, anti
                               children, or otherwise misaligned with
                               Nisria's mission.

DIFFERENTIATORS (lean into these. They are why Nisria wins.)

  Women-led African grassroots social enterprise plus nonprofit
  hybrid. Place-based in Gilgil and Kibera, not generic Kenya. Nur
  is a diaspora leader and woman of color. Family reunification is
  rare and credible. Maisha gives us a Sustainable Fashion + Circular
  Economy story almost no peer org has.

DUAL LANE EVALUATION

Some grants fund organizations, others fund founders. Decide first
which lane this grant lives in:

  org_lane    grant funds the organization for a program. Score on
              program fit, geography, financial fit, organizational
              eligibility. Set lead_program to one of: rescue,
              education, feeding, wellness, maisha, combined.
  founder_lane grant funds Nur as an individual founder or leader.
              Score on Nur's profile: career stage, identity, sector
              of leadership. Set lead_program to nur_fellowship.

If unclear, default to org_lane and note this in top_2_risks.

THE GRANT TO EVALUATE

Title: __GRANT_TITLE__
Funder: __GRANT_FUNDER__
Funder type: __GRANT_FUNDER_TYPE__
Source: __GRANT_SOURCE__
Amount range: __GRANT_AMOUNT_RANGE__
Deadline: __GRANT_CLOSE_DATE__
Geography (declared): __GRANT_GEOGRAPHY__
Eligibility (declared): __GRANT_ELIGIBILITY__
Description:
__GRANT_DESCRIPTION__

TODAY'S DATE: __TODAY_ISO__

OUTPUT (strict JSON, no prose outside the object)

{
  "fit_score": <integer 0 to 10>,
  "tier": "<HIGH | MEDIUM | LOW | SKIP>",
  "lane": "<org_lane | founder_lane>",
  "lead_program": "<rescue | education | feeding | wellness | maisha | nur_fellowship | combined>",
  "tags_matched": {
    "geography": [],
    "people": [],
    "leadership": [],
    "programs": [],
    "economic_empowerment": [],
    "fashion_sustainability": [],
    "health": [],
    "model": [],
    "awards_fellowships": []
  },
  "commercial_criteria": {
    "funder_type": "",
    "award_format": "",
    "average_award_usd": null,
    "match_required_pct": null,
    "restricted": null,
    "multi_year": null,
    "trust_based": null,
    "dei_lens": null,
    "eligibility_us_501c3": null,
    "eligibility_kenya_cbo": null
  },
  "hard_filter_triggered": null,
  "top_3_alignment_reasons": [],
  "top_2_risks": [],
  "missing_info_needed": [],
  "apply_recommendation": "<apply | maybe | skip>",
  "one_line_pitch": ""
}

Return JSON only. No surrounding prose. No code fences.
"""


# Default model. Refresh code can override via config.scoring.llm_rerank.model.
DEFAULT_MODEL = "claude-sonnet-4-5"
DEFAULT_MAX_TOKENS = 1500
DEFAULT_TEMPERATURE = 0.2
DEFAULT_CACHE_DAYS = 14


# ---------------------------------------------------------------------------
# Prompt assembly
# ---------------------------------------------------------------------------

def _build_taxonomy_block(taxonomy: dict, weights: dict) -> str:
    """Render the 9-category taxonomy as a human-readable block for the prompt.

    Each line has the category name, its weight (formatted as `weight 0.20`),
    and a comma-joined list of keywords. The exact `weight 0.20` formatting is
    load-bearing for the test suite which greps for that string. Categories
    with zero or missing weight are skipped so the block reflects what the
    scorer will actually use downstream.

    Args:
        taxonomy: Map of category name -> list of keyword strings.
        weights: Map of category name -> float weight.

    Returns:
        Multi-line string. Empty string if both inputs are empty.
    """
    if not taxonomy:
        return ""
    lines: list[str] = []
    for category, keywords in taxonomy.items():
        weight = float(weights.get(category, 0.0)) if weights else 0.0
        if weight <= 0:
            continue
        kw_list = ", ".join(str(k) for k in (keywords or []) if k)
        lines.append(f"  {category} (weight {weight:.2f}): {kw_list}")
    return "\n".join(lines)


def _format_grant_amount(grant_row: dict) -> str:
    """Render the grant's USD amount range as a single token for the prompt."""
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


def _render_prompt(grant_row: dict, org_profile_row: dict, today_iso: str) -> str:
    """Substitute runtime fields into GRANT_FIT_MASTER_PROMPT.

    Uses str.replace() because the prompt body carries a literal JSON template
    in its OUTPUT section. str.format() would force us to double every brace.
    """
    try:
        taxonomy = json.loads(org_profile_row.get("taxonomy_json", "{}") or "{}")
    except (ValueError, TypeError):
        taxonomy = {}
    try:
        weights = json.loads(org_profile_row.get("category_weights_json", "{}") or "{}")
    except (ValueError, TypeError):
        weights = {}

    nur_profile = (org_profile_row.get("nur_founder_profile") or "").strip()
    if not nur_profile:
        nur_profile = "(founder profile not configured)"

    countries_join = _format_json_list(grant_row.get("countries_json"))
    regions_join = _format_json_list(grant_row.get("regions_json"))
    if countries_join == "(none)" and regions_join == "(none)":
        geography = "(not declared)"
    elif regions_join == "(none)":
        geography = countries_join
    elif countries_join == "(none)":
        geography = regions_join
    else:
        geography = f"countries: {countries_join}; regions: {regions_join}"

    replacements = {
        "__NUR_FOUNDER_PROFILE__": nur_profile,
        "__TAXONOMY_BLOCK__": _build_taxonomy_block(taxonomy, weights),
        "__GRANT_TITLE__": str(grant_row.get("title") or "(untitled)"),
        "__GRANT_FUNDER__": str(grant_row.get("agency") or "(unknown)"),
        "__GRANT_FUNDER_TYPE__": str(grant_row.get("funder_type") or "(unknown)"),
        "__GRANT_SOURCE__": str(grant_row.get("source") or "(unknown)"),
        "__GRANT_AMOUNT_RANGE__": _format_grant_amount(grant_row),
        "__GRANT_CLOSE_DATE__": str(grant_row.get("close_date") or "(not declared)"),
        "__GRANT_GEOGRAPHY__": geography,
        "__GRANT_ELIGIBILITY__": _format_json_list(grant_row.get("eligibility_json")),
        "__GRANT_DESCRIPTION__": str(grant_row.get("description") or "(no description)"),
        "__TODAY_ISO__": today_iso,
    }

    prompt = GRANT_FIT_MASTER_PROMPT
    for token, value in replacements.items():
        prompt = prompt.replace(token, value)
    return prompt


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------

REQUIRED_KEYS = {
    "fit_score",
    "tier",
    "lane",
    "lead_program",
    "tags_matched",
    "commercial_criteria",
    "hard_filter_triggered",
    "top_3_alignment_reasons",
    "top_2_risks",
    "missing_info_needed",
    "apply_recommendation",
    "one_line_pitch",
}

_CODE_FENCE_RE = re.compile(
    r"^\s*```(?:json|JSON)?\s*\n?(.*?)\n?\s*```\s*$",
    re.DOTALL,
)


def parse_llm_response(text: str) -> dict:
    """Parse the model's JSON output, stripping code fences if present.

    The prompt explicitly asks for JSON-only output, but defensive code is
    cheap and stops one bad turn from breaking the whole batch. Raises
    ValueError if the body is not valid JSON or is missing required keys.
    """
    if not text or not text.strip():
        raise ValueError("empty LLM response")

    body = text.strip()
    fence_match = _CODE_FENCE_RE.match(body)
    if fence_match:
        body = fence_match.group(1).strip()

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM response is not valid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise ValueError(f"LLM response is not a JSON object, got {type(parsed).__name__}")

    missing = REQUIRED_KEYS - set(parsed.keys())
    if missing:
        raise ValueError(f"LLM response missing required keys: {sorted(missing)}")

    return parsed


# ---------------------------------------------------------------------------
# Anthropic call
# ---------------------------------------------------------------------------

def rerank_grant(
    client: Any,
    grant_row: dict,
    org_profile_row: dict,
    today_iso: str,
    *,
    model: str = DEFAULT_MODEL,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    temperature: float = DEFAULT_TEMPERATURE,
) -> dict:
    """Score a single grant via Claude and return the parsed JSON plus raw text.

    The system prompt is split into three blocks so we can apply prompt caching
    on the parts that do not change per grant. With Anthropic's prompt caching
    we mark the fixed instructions and the org-profile/taxonomy block as
    cacheable; the per-grant body in the user message is uncached. This gives
    the second-and-later grants in a batch a meaningful input-cost discount.

    Args:
        client: An anthropic.Anthropic-compatible client. Pass any object with
                a `messages.create(...)` method; we use it as-is so tests can
                inject a fake.
        grant_row: A dict-like row from the grants table.
        org_profile_row: A dict-like row from the org_profile table.
        today_iso: Date string like "2026-06-15" to give the model "today".
        model: Anthropic model id.
        max_tokens: Output token budget. 1500 is plenty for the JSON shape.
        temperature: 0.2 keeps scores stable across re-runs of the same grant.

    Returns:
        Dict with parsed JSON keys + an additional "raw_json" string carrying
        the original model output for audit/replay.
    """
    # Build the full prompt, then split it into the three caching tiers.
    full_prompt = _render_prompt(grant_row, org_profile_row, today_iso)

    # Tier 1 (cacheable, never changes per run): the ROLE through DIFFERENTIATORS
    # block. Tier 2 (cacheable, changes only when org_profile or taxonomy
    # changes): the taxonomy block is already in tier 1 in our prompt body, so
    # the split here is purely tier 1 (fixed + org) versus tier 3 (per-grant).
    # We anchor the split at the "THE GRANT TO EVALUATE" header which always
    # appears in our prompt.
    split_token = "\nTHE GRANT TO EVALUATE\n"
    if split_token in full_prompt:
        fixed_part, grant_part = full_prompt.split(split_token, 1)
        grant_part = split_token + grant_part
    else:
        # Defensive fallback. Should never fire, but cheap.
        fixed_part = full_prompt
        grant_part = ""

    system_blocks = [
        {
            "type": "text",
            "text": fixed_part,
            "cache_control": {"type": "ephemeral"},
        }
    ]
    user_blocks = [
        {"type": "text", "text": grant_part or "(no grant body)"},
    ]

    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_blocks,
        messages=[{"role": "user", "content": user_blocks}],
    )

    # The Anthropic SDK returns response.content as a list of content blocks.
    # The first text block carries our JSON.
    text = ""
    try:
        for block in response.content:
            block_type = getattr(block, "type", None) or (block.get("type") if isinstance(block, dict) else None)
            if block_type == "text":
                text = getattr(block, "text", None) or (block.get("text") if isinstance(block, dict) else "")
                if text:
                    break
    except (AttributeError, TypeError):
        text = ""

    parsed = parse_llm_response(text)
    parsed["raw_json"] = text
    return parsed


# ---------------------------------------------------------------------------
# Batch entrypoint
# ---------------------------------------------------------------------------

def _grant_has_fresh_score(conn: sqlite3.Connection, grant_id: int, cache_days: int) -> bool:
    """Return True if grant_llm_scores.scored_at is within `cache_days` of now."""
    row = conn.execute(
        "SELECT scored_at FROM grant_llm_scores WHERE grant_id = ?",
        (grant_id,),
    ).fetchone()
    if not row:
        return False
    scored_at = row["scored_at"] if isinstance(row, sqlite3.Row) else row[0]
    if not scored_at:
        return False
    # SQLite stores CURRENT_TIMESTAMP as "YYYY-MM-DD HH:MM:SS".
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            ts = datetime.strptime(str(scored_at)[:19], fmt)
            break
        except ValueError:
            continue
    else:
        return False
    age_days = (datetime.utcnow() - ts).total_seconds() / 86400.0
    return age_days < cache_days


def _upsert_score(conn: sqlite3.Connection, grant_id: int, parsed: dict) -> None:
    """Write or replace a grant_llm_scores row."""
    conn.execute(
        """INSERT INTO grant_llm_scores (
                grant_id, fit_score, tier, lane, lead_program,
                tags_matched_json, commercial_criteria_json,
                hard_filter_triggered, top_3_alignment_reasons_json,
                top_2_risks_json, missing_info_needed_json,
                apply_recommendation, one_line_pitch, raw_json,
                scored_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(grant_id) DO UPDATE SET
                fit_score = excluded.fit_score,
                tier = excluded.tier,
                lane = excluded.lane,
                lead_program = excluded.lead_program,
                tags_matched_json = excluded.tags_matched_json,
                commercial_criteria_json = excluded.commercial_criteria_json,
                hard_filter_triggered = excluded.hard_filter_triggered,
                top_3_alignment_reasons_json = excluded.top_3_alignment_reasons_json,
                top_2_risks_json = excluded.top_2_risks_json,
                missing_info_needed_json = excluded.missing_info_needed_json,
                apply_recommendation = excluded.apply_recommendation,
                one_line_pitch = excluded.one_line_pitch,
                raw_json = excluded.raw_json,
                scored_at = CURRENT_TIMESTAMP
        """,
        (
            grant_id,
            parsed.get("fit_score"),
            parsed.get("tier"),
            parsed.get("lane"),
            parsed.get("lead_program"),
            json.dumps(parsed.get("tags_matched") or {}),
            json.dumps(parsed.get("commercial_criteria") or {}),
            parsed.get("hard_filter_triggered"),
            json.dumps(parsed.get("top_3_alignment_reasons") or []),
            json.dumps(parsed.get("top_2_risks") or []),
            json.dumps(parsed.get("missing_info_needed") or []),
            parsed.get("apply_recommendation"),
            parsed.get("one_line_pitch"),
            parsed.get("raw_json", ""),
        ),
    )


def rerank_top_n(conn: sqlite3.Connection, config: dict, n: int = 20) -> int:
    """Re-rank the top-N grants by Stage 1 relevance_score via Claude.

    Reads config.scoring.llm_rerank for model + cache_days + top_n overrides.
    Skips any grant whose grant_llm_scores row is fresher than cache_days. If
    ANTHROPIC_API_KEY is missing or the anthropic SDK is not installed, logs a
    warning and returns 0 without touching the table. Returns the count of
    grants newly scored in this call.
    """
    llm_cfg = (config.get("scoring") or {}).get("llm_rerank") or {}
    if not llm_cfg.get("enabled", False):
        logger.info("Stage 2 LLM re-rank is disabled in config, skipping")
        return 0

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning(
            "Stage 2 LLM re-rank: ANTHROPIC_API_KEY not set, skipping. "
            "Stage 1 scores remain authoritative."
        )
        return 0

    try:
        import anthropic  # type: ignore
    except ImportError:
        logger.warning(
            "Stage 2 LLM re-rank: anthropic SDK not installed, skipping. "
            "Run `pip install anthropic>=0.34`."
        )
        return 0

    model = llm_cfg.get("model") or DEFAULT_MODEL
    cache_days = int(llm_cfg.get("cache_days") or DEFAULT_CACHE_DAYS)
    top_n = int(llm_cfg.get("top_n") or n)

    org_row = conn.execute("SELECT * FROM org_profile WHERE id = 1").fetchone()
    if not org_row:
        logger.warning("Stage 2 LLM re-rank: no org_profile row found, skipping")
        return 0
    org_profile = dict(org_row)

    grant_rows = conn.execute(
        """SELECT * FROM grants
           WHERE relevance_score IS NOT NULL
           ORDER BY relevance_score DESC
           LIMIT ?""",
        (top_n,),
    ).fetchall()

    if not grant_rows:
        logger.info("Stage 2 LLM re-rank: no candidate grants in table, skipping")
        return 0

    client = anthropic.Anthropic(api_key=api_key)
    today_iso = datetime.utcnow().strftime("%Y-%m-%d")

    scored_count = 0
    skipped_fresh = 0
    failed = 0

    for row in grant_rows:
        grant = dict(row)
        grant_id = grant["id"]
        if _grant_has_fresh_score(conn, grant_id, cache_days):
            skipped_fresh += 1
            continue
        try:
            parsed = rerank_grant(
                client,
                grant,
                org_profile,
                today_iso,
                model=model,
            )
            _upsert_score(conn, grant_id, parsed)
            conn.commit()
            scored_count += 1
        except Exception as exc:
            failed += 1
            logger.error(
                "Stage 2 LLM re-rank failed for grant_id=%s: %s",
                grant_id, exc,
            )

    logger.info(
        "Stage 2 LLM re-rank: %d newly scored, %d still fresh, %d failed (top_n=%d, cache_days=%d)",
        scored_count, skipped_fresh, failed, top_n, cache_days,
    )
    return scored_count
