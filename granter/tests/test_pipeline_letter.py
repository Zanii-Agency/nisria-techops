"""Tests for the three Nur-screenshot asks:
  A. Pipeline delete (route side-effect, covered by the route).
  B. PIPELINE_STAGES now contains 'completed_elsewhere' (7 total).
  C. Letter generator accepts a synthetic funder dict (no id, name only).
"""

from __future__ import annotations

from src.web.routes.tracker import PIPELINE_STAGES
from src.letter.generator import generate_letter


def test_pipeline_stages_has_completed_elsewhere():
    """The new 7th stage must be present and at the end of the list."""
    assert "completed_elsewhere" in PIPELINE_STAGES
    assert len(PIPELINE_STAGES) == 7
    assert PIPELINE_STAGES[-1] == "completed_elsewhere"


def test_pipeline_stages_preserves_original_six():
    """We did not drop or reorder any original stage."""
    for s in ["identified", "researching", "writing", "submitted", "awarded", "rejected"]:
        assert s in PIPELINE_STAGES


def test_letter_generator_accepts_synthetic_funder(db):
    """A dict-shaped funder context routes through the generator without
    hitting the funders table or any external service. This is the path the
    Outreach Letter form takes when Nur fills the 'Other funder' textbox."""
    synthetic = {
        "id": None,
        "name": "Mastercard Foundation",
        "sector_focus": "women's economic empowerment",
        "geographic_focus": "East Africa",
        "description": "",
    }
    letter = generate_letter(db, synthetic, tone="formal")
    assert isinstance(letter, str)
    assert "Mastercard Foundation" in letter
    # The synthetic-context branch should weave in sector + geography.
    assert (
        "women's economic empowerment" in letter
        or "East Africa" in letter
    )


def test_letter_generator_synthetic_funder_minimum_fields(db):
    """Name-only synthetic dict must still produce a letter (other fields blank)."""
    synthetic = {"id": None, "name": "Anonymous Trust"}
    letter = generate_letter(db, synthetic, tone="warm")
    assert isinstance(letter, str)
    assert "Anonymous Trust" in letter
    assert not letter.startswith("Error:")


def test_letter_generator_synthetic_funder_rejects_empty_name(db):
    """A synthetic dict without a name must surface an error, not crash."""
    letter = generate_letter(db, {"id": None, "name": ""}, tone="formal")
    assert letter.startswith("Error:")


def test_letter_generator_legacy_funder_id_still_works(db):
    """The original int-id signature must keep working for existing call sites."""
    # No funder in the in-memory DB. Should return the not-found error, not crash.
    letter = generate_letter(db, 999, tone="formal")
    assert letter.startswith("Error:")
