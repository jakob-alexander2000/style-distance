"""Hand-computed Delta, and Hoover's published one-word walkthrough of Burrows."""

from __future__ import annotations

import math

import pytest

from style_distance.delta import absolute_z_difference, delta_between, z_score

# Four reference texts and two drafts, ten tokens each.
# Relative frequencies:
#   the  0.6  0.4  0.2  0.4    draft centroid 0.20    z = -sqrt(3/2)
#   of   0.2  0.4  0.2  0.4    draft centroid 0.15    z = -0.75 * sqrt(3)
#   and  0.2  0.2  0.6  0.2    draft centroid 0.65    z = 1.75
# Sample standard deviation (divisor n − 1). Top 3 words are the whole vocabulary.
R1 = "the the the the the the of of and and"
R2 = "the the the the of of of of and and"
R3 = "the the of of and and and and and and"
R4 = "the the the the of of of of and and"
D1 = "the of of and and and and and and and"
D2 = "the the the of and and and and and and"

HAND_EXPECTED = (math.sqrt(1.5) + 0.75 * math.sqrt(3) + 1.75) / 3


def test_hand_computed_delta_matches_closed_form():
    result = delta_between([R1, R2, R3, R4], [D1, D2], n=3, language="en")
    assert result.features == ("the", "and", "of") or set(result.features) == {
        "the",
        "and",
        "of",
    }
    assert abs(result.delta - HAND_EXPECTED) < 1e-12
    by_word = {item.word: item for item in result.contributions}
    assert abs(by_word["and"].signed_z - 1.75) < 1e-12
    assert abs(by_word["the"].signed_z - (-math.sqrt(1.5))) < 1e-12
    assert abs(by_word["of"].signed_z - (-0.75 * math.sqrt(3))) < 1e-12
    assert by_word["and"].direction == "over"
    assert by_word["the"].direction == "under"
    assert by_word["of"].direction == "under"
    assert result.contributions[0].word == "and"


def test_sample_standard_deviation_not_population():
    """Population sd for "and" would be 0.173..., and z would not be 1.75."""
    result = delta_between([R1, R2, R3, R4], [D1, D2], n=3, language="en")
    and_z = next(item.signed_z for item in result.contributions if item.word == "and")
    assert abs(and_z - 1.75) < 1e-12


def test_hoover_2004_published_of_difference():
    """Hoover 2004, p. 454, walking through Burrows on the word "of".

    Mean frequency 1.821. Paradise Lost 2.769 is 3.015 standard deviations
    above the mean. Behn's selection, 1.783, is 0.121 below. The absolute
    difference of those z-scores is 3.136.

    David L. Hoover, "Testing Burrows's Delta", Literary and Linguistic
    Computing 19.4 (2004), 453–475. https://doi.org/10.1093/llc/19.4.453
    """
    mean = 1.821
    paradise_lost = 2.769
    behn = 1.783
    published_z_pl = 3.015
    sd = (paradise_lost - mean) / published_z_pl
    z_pl = z_score(paradise_lost, mean, sd)
    z_behn = z_score(behn, mean, sd)
    difference = absolute_z_difference(paradise_lost, behn, mean, sd)
    assert abs(z_pl - 3.015) < 1e-12
    assert round(z_behn, 3) == -0.121
    assert round(difference, 3) == 3.136


def test_zero_variance_word_is_dropped():
    refs = [
        "the the the alpha",
        "the the of alpha",
        "the of of alpha",
    ]
    drafts = ["of of of of"]
    result = delta_between(refs, drafts, n=10, language="en")
    assert "alpha" in result.dropped
    assert "alpha" not in result.features


def test_tie_breaks_alphabetically():
    # aa and bb both occur 6 times. Alphabetical order keeps aa ahead of bb.
    refs = [
        "aa aa aa bb cc",
        "aa bb bb bb cc",
        "aa aa bb bb dd",
    ]
    result = delta_between(refs, ["aa bb cc dd"], n=2, language="en")
    assert result.features[0] == "aa"
    assert result.features[1] == "bb"


def test_word_in_only_one_reference_text_is_excluded():
    refs = [
        "the the the alpha alpha",
        "the the of of",
        "the of of of",
    ]
    result = delta_between(refs, ["alpha alpha alpha of of"], n=10, language="en")
    assert "alpha" not in result.features
    assert "the" in result.features


def test_requires_two_reference_texts():
    with pytest.raises(ValueError, match="two reference"):
        delta_between(["the the of"], ["the of of"], n=2, language="en")


def test_german_function_words_keep_umlauts_and_drop_content():
    refs = [
        "Für die Straße und für das Haus ist die Lage gut und die Lage bleibt.",
        "Für die Straße und für den Hof ist die Lage ruhig und die Lage bleibt.",
        "Über die Straße und für das Tor ist die Lage weit und die Lage bleibt.",
    ]
    drafts = [
        "Die Größe der Straße und die Größe des Hofs bleiben für die Lage jedoch anders.",
    ]
    result = delta_between(refs, drafts, n=20, language="de")
    assert "straße" not in result.features
    assert "für" in result.features
    assert "die" in result.features
    assert result.delta > 0
