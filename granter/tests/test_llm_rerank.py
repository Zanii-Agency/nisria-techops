"""Tests for the Stage 2 LLM re-rank module.

These tests cover the pure-Python pieces: taxonomy block rendering and JSON
response parsing. The Anthropic API is not exercised here. End-to-end
behaviour of rerank_grant and rerank_top_n is left to integration runs against
the real API.
"""

import json

import pytest

from src.scoring.llm_rerank import (
    GRANT_FIT_MASTER_PROMPT,
    _build_taxonomy_block,
    parse_llm_response,
)


# A slimmed taxonomy used purely to exercise the rendering function. Production
# taxonomy lives in config/config.yaml.
SAMPLE_TAXONOMY = {
    "geography": ["Kenya", "East Africa", "Africa", "Global South"],
    "people": ["Women", "Girls", "Children", "Families"],
    "leadership": ["Women-Led", "Grassroots", "Diaspora Leader"],
    "programs": ["Rescue", "Education", "Food Security"],
    "economic_empowerment": ["Livelihoods", "Social Enterprise"],
    "fashion_sustainability": ["Sustainable Fashion", "Upcycled Fashion"],
    "health": ["Trauma-Informed", "Mental Health"],
    "model": ["Holistic", "Family-Centered"],
    "awards_fellowships": ["Emerging Leader", "Visionary"],
}

SAMPLE_WEIGHTS = {
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


# A canonical, complete LLM response payload — used to test parse_llm_response
# in both bare-JSON and code-fenced forms.
VALID_RESPONSE = {
    "fit_score": 8,
    "tier": "HIGH",
    "lane": "org_lane",
    "lead_program": "rescue",
    "tags_matched": {
        "geography": ["Kenya"],
        "people": ["Children"],
        "leadership": ["Grassroots"],
        "programs": ["Rescue"],
        "economic_empowerment": [],
        "fashion_sustainability": [],
        "health": ["Trauma-Informed"],
        "model": ["Holistic"],
        "awards_fellowships": [],
    },
    "commercial_criteria": {
        "funder_type": "foundation",
        "award_format": "open RFP",
        "average_award_usd": 50000,
        "match_required_pct": 0,
        "restricted": False,
        "multi_year": True,
        "trust_based": True,
        "dei_lens": True,
        "eligibility_us_501c3": True,
        "eligibility_kenya_cbo": True,
    },
    "hard_filter_triggered": None,
    "top_3_alignment_reasons": [
        "Kenya focus matches our Gilgil + Kibera base",
        "Funds grassroots women-led child-protection work",
        "Multi-year trust-based foundation",
    ],
    "top_2_risks": [
        "Funder requires US 501c3 only, not Kenya CBO",
        "Application deadline tight",
    ],
    "missing_info_needed": ["confirm match requirement"],
    "apply_recommendation": "apply",
    "one_line_pitch": "Place-based child rescue and reunification in Kenya by a women-led grassroots team.",
}


class TestBuildTaxonomyBlock:
    def test_renders_categories_and_weights(self):
        """Block must mention each category name and its `weight 0.NN` value."""
        block = _build_taxonomy_block(SAMPLE_TAXONOMY, SAMPLE_WEIGHTS)
        assert isinstance(block, str)
        assert "geography" in block
        # Exact formatting check: the production prompt-reader expects the
        # `weight 0.20` token, two decimals, lowercase keyword "weight".
        assert "weight 0.20" in block
        # Every category we asked for should appear at least once.
        for category in SAMPLE_TAXONOMY:
            assert category in block, f"missing category {category} in block"

    def test_empty_inputs_return_empty_string(self):
        """Defensive: empty taxonomy returns "" (not a crash)."""
        assert _build_taxonomy_block({}, {}) == ""
        assert _build_taxonomy_block({}, SAMPLE_WEIGHTS) == ""

    def test_zero_weight_categories_are_skipped(self):
        """Categories with zero weight contribute nothing and stay out of the block."""
        weights = dict(SAMPLE_WEIGHTS)
        weights["awards_fellowships"] = 0.0
        block = _build_taxonomy_block(SAMPLE_TAXONOMY, weights)
        assert "awards_fellowships" not in block
        # Sanity: the rest still rendered.
        assert "geography" in block


class TestParseLlmResponse:
    def test_parses_bare_json(self):
        """Plain JSON object goes through unchanged."""
        text = json.dumps(VALID_RESPONSE)
        parsed = parse_llm_response(text)
        assert parsed["fit_score"] == 8
        assert parsed["tier"] == "HIGH"
        assert parsed["apply_recommendation"] == "apply"

    def test_parses_code_fenced_json(self):
        """Code-fenced JSON (```json ... ```) is stripped before parsing."""
        fenced = "```json\n" + json.dumps(VALID_RESPONSE) + "\n```"
        parsed = parse_llm_response(fenced)
        assert parsed["fit_score"] == 8
        assert parsed["lead_program"] == "rescue"

    def test_parses_unlabeled_code_fence(self):
        """Plain ``` fences without `json` label should also strip cleanly."""
        fenced = "```\n" + json.dumps(VALID_RESPONSE) + "\n```"
        parsed = parse_llm_response(fenced)
        assert parsed["tier"] == "HIGH"

    def test_raises_on_garbage(self):
        """Non-JSON garbage must raise ValueError, not crash on json.loads."""
        with pytest.raises(ValueError):
            parse_llm_response("this is not json, just words")

    def test_raises_on_empty(self):
        """Empty body is a ValueError too."""
        with pytest.raises(ValueError):
            parse_llm_response("")

    def test_raises_on_missing_keys(self):
        """A JSON object missing the required schema fields must fail validation."""
        with pytest.raises(ValueError):
            parse_llm_response(json.dumps({"fit_score": 5, "tier": "MEDIUM"}))

    def test_raises_on_non_object_json(self):
        """A JSON array is valid JSON but not the contract we want."""
        with pytest.raises(ValueError):
            parse_llm_response(json.dumps([1, 2, 3]))


class TestPromptTemplate:
    def test_prompt_template_contains_tokens(self):
        """The master prompt should still carry every interpolation token we replace at call time."""
        for token in (
            "__NUR_FOUNDER_PROFILE__",
            "__TAXONOMY_BLOCK__",
            "__GRANT_TITLE__",
            "__GRANT_FUNDER__",
            "__GRANT_DESCRIPTION__",
            "__TODAY_ISO__",
        ):
            assert token in GRANT_FIT_MASTER_PROMPT, f"missing token {token}"
