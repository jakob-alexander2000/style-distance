"""The synthetic demo has to land on the calibrated readings."""

from __future__ import annotations

import json
from pathlib import Path

from brand_texts import documents
from style_distance.delta import delta_between, deltas_to_voices, reading_for

ROOT = Path(__file__).resolve().parents[2]
HAND_REFS = [
    "the the the the the the of of and and",
    "the the the the of of of of and and",
    "the the of of and and and and and and",
    "the the the the of of of of and and",
]
HAND_DRAFTS = [
    "the of of and and and and and and and",
    "the the the of and and and and and and",
]


def test_single_voice_shared_basis_matches_plain_delta():
    from style_distance.tokenize import tokenize

    plain = delta_between(HAND_REFS, HAND_DRAFTS, n=3, language="en")
    shared = deltas_to_voices(
        [("house", [tokenize(text) for text in HAND_REFS])],
        [tokenize(text) for text in HAND_DRAFTS],
        3,
        None,
    )["house"]
    assert abs(plain.delta - shared.delta) < 1e-12


def test_brand_readings_match_the_calibrated_cuts():
    payload = documents()
    thresholds = json.loads((ROOT / "data" / "thresholds.json").read_text(encoding="utf-8"))
    references = [item["text"] for item in payload["references"]]
    drafts = [item["text"] for item in payload["drafts"]]
    held = payload["heldOut"]["text"]
    draft_delta = delta_between(references, drafts, thresholds["n"], "en")
    held_delta = delta_between(references, [held], thresholds["n"], "en")
    assert reading_for(draft_delta.delta, thresholds["closeMax"], thresholds["offVoiceMin"]) == "off-voice"
    assert reading_for(held_delta.delta, thresholds["closeMax"], thresholds["offVoiceMin"]) == "close"
    assert payload["synthetic"] is True
    assert held[:40] not in references[0]


def test_thresholds_file_matches_a_recompute():
    from style_distance.validate import compute

    fresh = compute()
    saved = json.loads((ROOT / "data" / "thresholds.json").read_text(encoding="utf-8"))
    assert abs(saved["closeMax"] - fresh["closeMax"]) < 1e-9
    assert abs(saved["offVoiceMin"] - fresh["offVoiceMin"]) < 1e-9
    assert saved["heldOutId"] == fresh["heldOutId"]
    assert saved["sharedAttribution"]["correct"] == fresh["sharedAttribution"]["correct"]
    assert saved["perVoiceAttribution"]["byAuthor"]["austen"]["correct"] == 61
    assert fresh["sharedAttribution"]["byAuthor"]["bronte"]["correct"] == fresh["sharedAttribution"]["byAuthor"]["bronte"]["total"]
