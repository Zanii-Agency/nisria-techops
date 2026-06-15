"""Tests for the v2 Stage 1 lensed keyword scorer."""

import json

import pytest

from src.scoring.relevance import _category_score, score_grant


# Synthetic taxonomy mirrors the production 9-category shape but slimmed for
# clarity. Real config lives in config/config.yaml under org_profile.taxonomy.
SYNTH_TAXONOMY = {
    "geography": ["Kenya", "East Africa", "Africa", "Global South", "Gilgil",
                  "Kibera", "Diaspora"],
    "people": ["Women", "Girls", "Youth", "Children", "Vulnerable Children",
               "Families", "Artisans", "Survivors"],
    "leadership": ["Women-Led", "African-Led", "Community-Led", "Grassroots",
                   "Diaspora Leader", "Social Entrepreneur", "Founder",
                   "Changemaker", "Women of Color", "African Women"],
    "programs": ["Child Protection", "Family Reunification", "Safe Haven",
                 "Rescue", "Education", "Vocational Training", "Microfinance",
                 "Food Security", "Play", "Rehabilitation",
                 "Psychosocial Support"],
    "economic_empowerment": ["Livelihoods", "Women's Economic Empowerment",
                             "Social Enterprise", "Artisan", "Fair Trade",
                             "Income Generation"],
    "fashion_sustainability": ["Sustainable Fashion", "Upcycled Fashion",
                               "Circular Economy", "Textile Waste",
                               "Ethical Fashion", "Eco-Friendly"],
    "health": ["Holistic Care", "Trauma-Informed", "Mental Health", "HIV",
               "Wellness"],
    "model": ["Holistic", "Family-Centered", "Community-First", "Anti-Poverty",
              "Locally-Led", "Grassroots", "Reintegration"],
    "awards_fellowships": ["Emerging Leader", "Visionary", "Pioneer",
                           "Social Innovator", "Humanitarian", "Changemaker",
                           "Mid-Career", "Cross-Cultural"],
}

SYNTH_WEIGHTS = {
    "geography": 0.20,
    "people": 0.15,
    "leadership": 0.15,
    "programs": 0.20,
    "economic_empowerment": 0.10,
    "fashion_sustainability": 0.05,
    "health": 0.05,
    "model": 0.05,
    "awards_fellowships": 0.05,
}


class TestCategoryScore:
    def test_strong_fit_grant_text(self):
        """A grant whose body name-checks African women, Kenya, grassroots,
        rescue, education, and vulnerable children should clear 0.3 once the
        lens picks up across multiple categories. We pad the text with the
        full sector vocabulary because the saturation denom of max(3, len)
        means a single keyword per category only contributes thinly."""
        grant_text = (
            "African women-led grassroots organization in Kenya, East Africa "
            "and Africa, serving vulnerable children, girls, youth, women and "
            "families. Community-led, locally-led, holistic, family-centered "
            "approach. Programs cover child protection, family reunification, "
            "safe haven rescue, education, vocational training, microfinance, "
            "food security, play, rehabilitation, and psychosocial support. "
            "Run by a diaspora leader and social entrepreneur founder, a "
            "changemaker woman of color. African women in leadership."
        ).lower()
        score = _category_score(grant_text, SYNTH_TAXONOMY, SYNTH_WEIGHTS)
        assert score > 0.3, f"expected > 0.3 for strong-fit text, got {score}"

    def test_poor_fit_grant_text(self):
        """A grant about US solar tax credits should score under 0.1: zero
        category keywords match."""
        grant_text = "US tax credits for solar installation businesses".lower()
        score = _category_score(grant_text, SYNTH_TAXONOMY, SYNTH_WEIGHTS)
        assert score < 0.1, f"expected < 0.1 for poor-fit text, got {score}"

    def test_empty_inputs_return_zero(self):
        """Defensive: empty text, empty taxonomy, or empty weights all return 0.0."""
        assert _category_score("", SYNTH_TAXONOMY, SYNTH_WEIGHTS) == 0.0
        assert _category_score("women kenya", {}, SYNTH_WEIGHTS) == 0.0
        assert _category_score("women kenya", SYNTH_TAXONOMY, {}) == 0.0


class TestScoreGrantV2:
    def test_strong_synthetic_grant_lands_high(self):
        """A synthetic grant for African women-led grassroots work in Kenya
        with rescue + education + community-led + holistic + women-of-color
        cues, on a reliable source, well-fit amount, and a sweet-spot
        deadline should land in the HIGH tier."""
        # Build a far-future deadline so we don't rely on wall-clock dates.
        # Anything > 90 days returns deadline=0.4, but we want sweet-spot so
        # we set a date 30 days out at test time using datetime math.
        from datetime import datetime, timedelta
        deadline = (datetime.now() + timedelta(days=20)).strftime("%Y-%m-%d")

        grant = {
            "title": "Vulnerable Children Rescue and Education Grant",
            "description": (
                "Funding for African women-led, community-led grassroots "
                "organizations in Kenya, East Africa, and the wider Global "
                "South delivering child protection, family reunification, "
                "safe haven rescue, education, vocational training, "
                "microfinance, food security, play, rehabilitation, and "
                "psychosocial support to vulnerable children, girls, youth, "
                "families, artisans, and survivors. Priority for women of "
                "color, African women, diaspora leaders, social entrepreneurs, "
                "and founders taking a holistic, family-centered, "
                "community-first, anti-poverty, locally-led, "
                "trauma-informed approach with strong wellness, mental "
                "health, and reintegration support. Eligible: emerging "
                "leader, visionary, pioneer, social innovator, humanitarian, "
                "changemaker, mid-career, cross-cultural. Livelihoods, "
                "women's economic empowerment, social enterprise, artisan, "
                "fair trade, and income generation work welcomed. Bonus "
                "for sustainable fashion, upcycled fashion, circular "
                "economy, textile waste, ethical fashion, and eco-friendly "
                "models."
            ),
            "agency": "Africa Women's Development Fund",
            "amount_floor": 25000,
            "amount_ceiling": 150000,
            "close_date": deadline,
            "source": "grants_gov",
            "sectors_json": json.dumps(["children", "education"]),
            "countries_json": json.dumps(["KE"]),
            "regions_json": json.dumps(["East Africa"]),
            "categories_json": json.dumps([]),
            "eligibility_json": json.dumps([]),
        }
        org_profile = {
            "taxonomy_json": json.dumps(SYNTH_TAXONOMY),
            "category_weights_json": json.dumps(SYNTH_WEIGHTS),
            "countries_json": json.dumps(["KE", "US"]),
            "regions_json": json.dumps(["East Africa", "Sub-Saharan Africa"]),
            "grant_range_min": 5000,
            "grant_range_max": 250000,
        }
        weights = {
            "sector_match": 0.40,
            "geographic_match": 0.15,
            "amount_fit": 0.20,
            "deadline_proximity": 0.15,
            "source_reliability": 0.10,
        }
        score, tier = score_grant(grant, org_profile, weights)
        assert tier == "HIGH", f"expected HIGH for strong synthetic grant, got {tier} (score {score})"
