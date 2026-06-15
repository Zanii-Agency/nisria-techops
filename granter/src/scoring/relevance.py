"""5-signal grant relevance scoring — Stage 1 lensed keyword scorer.

Signals and weights (must sum to 1.0):
  sector_match       0.40  Lensed 9-category keyword scorer (see _category_score)
  geographic_match   0.15  Country match=1.0, region=0.6, global=0.3, mismatch=0.0
  amount_fit         0.20  Overlap of grant range with org's target range
  deadline_proximity 0.15  7-30d=1.0, 30-90d=0.8, >90d=0.4, <7d=0.5, passed=0.0
  source_reliability 0.10  Static per-source weight

Stage 1 sector_match is now a 9-category weighted keyword scan over the grant
text (title + description + agency + tags). The 9 categories and their weights
live on the org_profile row as taxonomy_json and category_weights_json so an
operator can edit them without a code deploy. Stage 2 LLM re-rank reads the
same shape (nur_founder_profile included) and is implemented in a sibling
module.

Tiers: HIGH (>=0.7), MEDIUM (>=0.4), LOW (>=0.2), IRRELEVANT (<0.2)
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime

logger = logging.getLogger(__name__)

SOURCE_RELIABILITY = {
    "grants_gov": 1.0,
    "sam_gov": 0.95,
    "usaspending": 0.85,
    "worldbank": 0.80,
    "iati": 0.70,
    "propublica": 0.60,
}

TIER_THRESHOLDS = [
    (0.7, "HIGH"),
    (0.4, "MEDIUM"),
    (0.2, "LOW"),
    (0.0, "IRRELEVANT"),
]


def _jaccard(set_a: set, set_b: set) -> float:
    """Jaccard similarity between two sets (kept for legacy callers and tests)."""
    if not set_a or not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union) if union else 0.0


def _sector_score(grant_sectors: list[str], org_sectors: list[str]) -> float:
    """Legacy Jaccard sector helper. Retained for backward compatibility with
    callers and tests written against the v1 scorer. New scoring goes through
    _category_score."""
    a = {s.lower().strip() for s in grant_sectors if s}
    b = {s.lower().strip() for s in org_sectors if s}
    return _jaccard(a, b)


# v2 Stage 1 lensed scorer: 9 weighted keyword categories over grant text.
def _category_score(grant_text: str, taxonomy: dict, category_weights: dict) -> float:
    """Score a grant against the 9-category keyword taxonomy.

    For each category, count how many of its keywords appear (case-insensitive
    substring match) in grant_text. Saturate at hits / max(3, len(keywords))
    capped at 1.0, then weight by category_weights[cat] and sum across all
    categories. The saturation floor of 3 prevents tiny categories from
    saturating on a single accidental match.

    Args:
        grant_text: Pre-lowered concatenation of title + description + agency
                    + any tag fields from the grant row.
        taxonomy: Map of category name -> list of keyword strings.
        category_weights: Map of category name -> float weight. Missing
                          categories are skipped.

    Returns:
        Float in [0.0, 1.0]. If taxonomy or weights are empty, returns 0.0.
    """
    if not taxonomy or not category_weights or not grant_text:
        return 0.0

    text = grant_text.lower()
    total = 0.0
    for category, keywords in taxonomy.items():
        if not keywords:
            continue
        weight = float(category_weights.get(category, 0.0))
        if weight <= 0:
            continue
        hits = 0
        for kw in keywords:
            kw_norm = (kw or "").lower().strip()
            if kw_norm and kw_norm in text:
                hits += 1
        saturation_denom = max(3, len(keywords))
        saturated = min(hits / saturation_denom, 1.0)
        total += weight * saturated
    return min(total, 1.0)


def _build_grant_text(grant: dict) -> str:
    """Concatenate searchable fields from a grant row into one lowercased blob.
    Includes title, description, agency, and any JSON tag-ish fields the row
    carries (sectors_json, categories_json, eligibility_json, countries_json,
    regions_json). Resilient to missing keys."""
    parts: list[str] = []
    for key in ("title", "description", "agency"):
        val = grant.get(key) or ""
        if isinstance(val, str) and val:
            parts.append(val)
    for json_key in ("sectors_json", "categories_json", "eligibility_json",
                     "countries_json", "regions_json"):
        raw = grant.get(json_key)
        if not raw:
            continue
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
        except (ValueError, TypeError):
            parsed = raw
        if isinstance(parsed, list):
            parts.append(" ".join(str(x) for x in parsed if x))
        elif isinstance(parsed, dict):
            parts.append(" ".join(str(v) for v in parsed.values() if v))
        elif parsed:
            parts.append(str(parsed))
    return " ".join(parts).lower()


def _geographic_score(grant_countries: list[str], grant_regions: list[str],
                      org_countries: list[str], org_regions: list[str]) -> float:
    """Score geographic relevance. Unchanged from v1 — still used at 0.15 weight
    on top of the lensed category scorer which also includes a geography lens."""
    gc = {c.upper() for c in grant_countries if c}
    oc = {c.upper() for c in org_countries if c}

    # Direct country match
    if gc & oc:
        return 1.0

    # Region match
    gr = {r.lower() for r in grant_regions if r}
    org_r = {r.lower() for r in org_regions if r}
    if gr & org_r:
        return 0.6

    # No country/region specified on grant = global program
    if not gc and not gr:
        return 0.3

    return 0.0


def _amount_score(grant_floor: float | None, grant_ceiling: float | None,
                  org_min: float, org_max: float) -> float:
    """Score how well the grant amount range fits the org's target range. Unchanged from v1."""
    if grant_floor is None and grant_ceiling is None:
        return 0.5  # Unknown amount, neutral.

    g_low = grant_floor or 0
    g_high = grant_ceiling or g_low or float("inf")

    overlap_low = max(g_low, org_min)
    overlap_high = min(g_high, org_max)

    if overlap_low > overlap_high:
        return 0.0  # No overlap

    overlap_range = overlap_high - overlap_low
    org_range = org_max - org_min
    if org_range <= 0:
        return 0.5

    return min(overlap_range / org_range, 1.0)


def _deadline_score(close_date: str) -> float:
    """Score deadline proximity. Unchanged from v1."""
    if not close_date:
        return 0.4  # Unknown deadline, moderate.

    try:
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S", "%m-%d-%Y"):
            try:
                deadline = datetime.strptime(close_date[:10], fmt)
                break
            except ValueError:
                continue
        else:
            return 0.4

        now = datetime.now()
        days = (deadline - now).days

        if days < 0:
            return 0.0
        elif days < 7:
            return 0.5
        elif days <= 30:
            return 1.0
        elif days <= 90:
            return 0.8
        else:
            return 0.4

    except Exception:
        return 0.4


def _source_reliability_score(source: str) -> float:
    """Static per-source reliability weight. Unchanged from v1."""
    return SOURCE_RELIABILITY.get(source, 0.5)


# Stage 1 public entrypoint: returns (score, tier) for one grant + org_profile.
def score_grant(grant: dict, org_profile: dict, weights: dict) -> tuple[float, str]:
    """Score a single grant against the org profile. Returns (score, tier).

    Sector signal is now the lensed 9-category keyword scorer. Geographic,
    amount, deadline, and source-reliability signals are unchanged.
    """
    w_sector = weights.get("sector_match", 0.40)
    w_geo = weights.get("geographic_match", 0.15)
    w_amount = weights.get("amount_fit", 0.20)
    w_deadline = weights.get("deadline_proximity", 0.15)
    w_source = weights.get("source_reliability", 0.10)

    # Parse JSON fields from grant row (defensive defaults).
    try:
        grant_countries = json.loads(grant.get("countries_json", "[]") or "[]")
    except (ValueError, TypeError):
        grant_countries = []
    try:
        grant_regions = json.loads(grant.get("regions_json", "[]") or "[]")
    except (ValueError, TypeError):
        grant_regions = []

    # Parse v2 taxonomy fields from org_profile.
    try:
        taxonomy = json.loads(org_profile.get("taxonomy_json", "{}") or "{}")
    except (ValueError, TypeError):
        taxonomy = {}
    try:
        category_weights = json.loads(org_profile.get("category_weights_json", "{}") or "{}")
    except (ValueError, TypeError):
        category_weights = {}

    # Legacy org country/region fields for the geographic signal.
    try:
        org_countries = json.loads(org_profile.get("countries_json", "[]") or "[]")
    except (ValueError, TypeError):
        org_countries = []
    org_regions = org_profile.get("regions")
    if org_regions is None:
        try:
            org_regions = json.loads(org_profile.get("regions_json", "[]") or "[]")
        except (ValueError, TypeError):
            org_regions = []
    if isinstance(org_regions, str):
        try:
            org_regions = json.loads(org_regions) if org_regions.startswith("[") else [org_regions]
        except (ValueError, TypeError):
            org_regions = [org_regions]

    grant_text = _build_grant_text(grant)
    sector_val = _category_score(grant_text, taxonomy, category_weights)
    geo_val = _geographic_score(grant_countries, grant_regions, org_countries, org_regions)
    amount_val = _amount_score(
        grant.get("amount_floor"), grant.get("amount_ceiling"),
        org_profile.get("grant_range_min", 5000),
        org_profile.get("grant_range_max", 250000),
    )
    deadline_val = _deadline_score(grant.get("close_date", ""))
    source_val = _source_reliability_score(grant.get("source", ""))

    score = (
        w_sector * sector_val
        + w_geo * geo_val
        + w_amount * amount_val
        + w_deadline * deadline_val
        + w_source * source_val
    )
    score = round(score, 4)

    tier = "IRRELEVANT"
    for threshold, tier_name in TIER_THRESHOLDS:
        if score >= threshold:
            tier = tier_name
            break

    return score, tier


# Bulk re-scorer: pulls org_profile (including new v2 taxonomy columns) and
# applies score_grant to every row in the grants table.
def score_all_grants(conn: sqlite3.Connection, config: dict):
    """Re-score all grants against the current org profile."""
    weights = config.get("scoring", {})

    org_row = conn.execute("SELECT * FROM org_profile WHERE id = 1").fetchone()
    if not org_row:
        logger.warning("No org profile found, cannot score grants")
        return

    org_profile = dict(org_row)
    # Regions are also kept on config for cases where the DB row is empty.
    if not org_profile.get("regions"):
        org_profile["regions"] = config.get("org_profile", {}).get("regions", [])

    grants = conn.execute("SELECT * FROM grants").fetchall()
    logger.info(f"Scoring {len(grants)} grants")

    tier_counts: dict[str, int] = {}
    for grant in grants:
        g = dict(grant)
        score, tier = score_grant(g, org_profile, weights)
        conn.execute(
            "UPDATE grants SET relevance_score = ?, relevance_tier = ?, last_updated_at = datetime('now') WHERE id = ?",
            (score, tier, g["id"]),
        )
        tier_counts[tier] = tier_counts.get(tier, 0) + 1

    conn.commit()

    for tier_name in ["HIGH", "MEDIUM", "LOW", "IRRELEVANT"]:
        logger.info(f"  {tier_name}: {tier_counts.get(tier_name, 0)}")
