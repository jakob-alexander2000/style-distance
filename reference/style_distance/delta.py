"""Burrows' Delta against a reference voice.

Primary-set procedure, held-out drafts:

1. Relative frequency of each word in each text (count / tokens).
2. The N most frequent words in the pooled reference corpus. Rank is by
   raw count, ties broken alphabetically (Unicode code point order).
   A word that occurs in only one reference text is left out: one text
   cannot establish a rate for the voice. German restricts candidates
   to the function-word list before that ranking.
3. Mean and sample standard deviation (divisor n − 1) of those relative
   frequencies across the reference texts. A text that never uses the word
   contributes zero. Words with standard deviation zero are dropped.
4. The draft side is the unweighted mean of the drafts' relative frequencies.
5. z = (frequency − reference mean) / reference standard deviation.
   The reference centroid is zero in z-space, so Delta is the mean of |z|
   over the remaining words.
6. A word is over-used when the draft's relative frequency is higher than
   the reference mean.

This is the Delta in Burrows 2002: the mean of the absolute differences
between z-scores. Hoover 2004, p. 454, walks through one word of that
calculation (the published 3.136 check in the tests).

Operation order is part of the parity contract with src/lib/delta.ts.
Do not switch to a one-pass variance or a population divisor.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .tokenize import allowed_words, tokenize


@dataclass(frozen=True)
class Contribution:
    word: str
    abs_z: float
    signed_z: float
    freq_draft: float
    freq_voice: float
    direction: str
    mfw_index: int


@dataclass(frozen=True)
class DeltaResult:
    delta: float
    features: tuple[str, ...]
    dropped: tuple[str, ...]
    contributions: tuple[Contribution, ...]
    reference_tokens: int
    draft_tokens: int


def reading_for(delta: float, close_max: float, off_voice_min: float) -> str:
    if close_max >= off_voice_min:
        raise ValueError("closeMax must sit strictly below offVoiceMin")
    if delta <= close_max:
        return "close"
    if delta >= off_voice_min:
        return "off-voice"
    return "drifting"


def z_score(frequency: float, mean: float, sd: float) -> float:
    return (frequency - mean) / sd


def absolute_z_difference(
    frequency_a: float, frequency_b: float, mean: float, sd: float
) -> float:
    return abs(z_score(frequency_a, mean, sd) - z_score(frequency_b, mean, sd))


def deltas_to_voices(
    voices: list[tuple[str, list[list[str]]]],
    draft_docs: list[list[str]],
    n: int,
    allowed: frozenset[str] | set[str] | None,
) -> dict[str, DeltaResult]:
    """One shared primary set, then a Delta to each voice centroid.

    Mean, sample standard deviation, and the most frequent words come from
    every reference text together. With a single voice this is the same
    number as `delta_from_tokens`: the voice centroid is zero in z-space.
    With two voices the z-scores share a scale, which is Burrows' comparison.
    """
    if len(voices) < 1:
        raise ValueError("Delta needs a reference voice.")
    all_refs = [doc for _, docs in voices for doc in docs]
    if len(all_refs) < 2:
        raise ValueError("Delta needs at least two reference texts.")
    if len(draft_docs) < 1:
        raise ValueError("Delta needs at least one draft.")
    if any(len(doc) == 0 for doc in all_refs):
        raise ValueError("A reference text has no words after tokenising.")
    if any(len(doc) == 0 for doc in draft_docs):
        raise ValueError("A draft has no words after tokenising.")

    ref_rels = [_relative(doc) for doc in all_refs]
    draft_rels = [_relative(doc) for doc in draft_docs]
    counts = _corpus_counts(all_refs)
    features = _most_frequent(all_refs, counts, n, allowed)
    if len(features) < 2:
        raise ValueError("Not enough words with a spread to measure a distance.")

    means: dict[str, float] = {}
    sds: dict[str, float] = {}
    used: list[tuple[int, str]] = []
    dropped: list[str] = []
    for index, word in enumerate(features):
        values = [rel.get(word, 0.0) for rel in ref_rels]
        mean, sd = _mean_sample_sd(values)
        if sd == 0.0 or not math.isfinite(sd):
            dropped.append(word)
            continue
        means[word] = mean
        sds[word] = sd
        used.append((index, word))
    if len(used) < 2:
        raise ValueError("Not enough words with a spread to measure a distance.")

    freq_draft = {
        word: sum(rel.get(word, 0.0) for rel in draft_rels) / len(draft_rels)
        for _, word in used
    }
    z_draft = {word: z_score(freq_draft[word], means[word], sds[word]) for _, word in used}

    results: dict[str, DeltaResult] = {}
    feature_names = tuple(word for _, word in used)
    for voice_id, docs in voices:
        voice_rels = [_relative(doc) for doc in docs]
        contributions: list[Contribution] = []
        abs_sum = 0.0
        for index, word in used:
            freq_voice = sum(rel.get(word, 0.0) for rel in voice_rels) / len(voice_rels)
            z_voice = z_score(freq_voice, means[word], sds[word])
            signed = z_draft[word] - z_voice
            magnitude = abs(signed)
            if freq_draft[word] > freq_voice:
                direction = "over"
            elif freq_draft[word] < freq_voice:
                direction = "under"
            else:
                direction = "even"
            contributions.append(
                Contribution(
                    word=word,
                    abs_z=magnitude,
                    signed_z=signed,
                    freq_draft=freq_draft[word],
                    freq_voice=freq_voice,
                    direction=direction,
                    mfw_index=index,
                )
            )
            abs_sum += magnitude
        contributions.sort(key=lambda item: (-item.abs_z, item.word))
        results[voice_id] = DeltaResult(
            delta=abs_sum / len(used),
            features=feature_names,
            dropped=tuple(dropped),
            contributions=tuple(contributions),
            reference_tokens=sum(len(doc) for doc in docs),
            draft_tokens=sum(len(doc) for doc in draft_docs),
        )
    return results


def delta_between(
    reference_texts: list[str],
    draft_texts: list[str],
    n: int,
    language: str,
) -> DeltaResult:
    if n < 1:
        raise ValueError("N must be at least 1")
    ref_tokens = [tokenize(text) for text in reference_texts]
    draft_tokens = [tokenize(text) for text in draft_texts]
    return delta_from_tokens(ref_tokens, draft_tokens, n, allowed_words(language))


def delta_from_tokens(
    reference_docs: list[list[str]],
    draft_docs: list[list[str]],
    n: int,
    allowed: frozenset[str] | set[str] | None,
) -> DeltaResult:
    if len(reference_docs) < 2:
        raise ValueError("Delta needs at least two reference texts.")
    if len(draft_docs) < 1:
        raise ValueError("Delta needs at least one draft.")
    if any(len(doc) == 0 for doc in reference_docs):
        raise ValueError("A reference text has no words after tokenising.")
    if any(len(doc) == 0 for doc in draft_docs):
        raise ValueError("A draft has no words after tokenising.")

    ref_rels = [_relative(doc) for doc in reference_docs]
    draft_rels = [_relative(doc) for doc in draft_docs]
    counts = _corpus_counts(reference_docs)
    features = _most_frequent(reference_docs, counts, n, allowed)
    if len(features) < 2:
        raise ValueError("Not enough words with a spread to measure a distance.")

    used: list[str] = []
    dropped: list[str] = []
    contributions: list[Contribution] = []
    abs_sum = 0.0

    for index, word in enumerate(features):
        values = [rel.get(word, 0.0) for rel in ref_rels]
        mean, sd = _mean_sample_sd(values)
        if sd == 0.0 or not math.isfinite(sd):
            dropped.append(word)
            continue
        freq_voice = mean
        freq_draft = sum(rel.get(word, 0.0) for rel in draft_rels) / len(draft_rels)
        signed = z_score(freq_draft, mean, sd)
        magnitude = abs(signed)
        if freq_draft > freq_voice:
            direction = "over"
        elif freq_draft < freq_voice:
            direction = "under"
        else:
            direction = "even"
        used.append(word)
        contributions.append(
            Contribution(
                word=word,
                abs_z=magnitude,
                signed_z=signed,
                freq_draft=freq_draft,
                freq_voice=freq_voice,
                direction=direction,
                mfw_index=index,
            )
        )
        abs_sum += magnitude

    if len(used) < 2:
        raise ValueError("Not enough words with a spread to measure a distance.")

    contributions.sort(key=lambda item: (-item.abs_z, item.word))
    return DeltaResult(
        delta=abs_sum / len(used),
        features=tuple(used),
        dropped=tuple(dropped),
        contributions=tuple(contributions),
        reference_tokens=sum(len(doc) for doc in reference_docs),
        draft_tokens=sum(len(doc) for doc in draft_docs),
    )


def _relative(tokens: list[str]) -> dict[str, float]:
    total = len(tokens)
    counts: dict[str, int] = {}
    for token in tokens:
        counts[token] = counts.get(token, 0) + 1
    return {word: count / total for word, count in counts.items()}


def _corpus_counts(docs: list[list[str]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for doc in docs:
        for token in doc:
            counts[token] = counts.get(token, 0) + 1
    return counts


def _most_frequent(
    docs: list[list[str]],
    counts: dict[str, int],
    n: int,
    allowed: frozenset[str] | set[str] | None,
) -> list[str]:
    document_frequency: dict[str, int] = {}
    for doc in docs:
        for word in set(doc):
            document_frequency[word] = document_frequency.get(word, 0) + 1
    words = [
        word
        for word, count in counts.items()
        if count > 0
        and document_frequency.get(word, 0) >= 2
        and (allowed is None or word in allowed)
    ]
    words.sort(key=lambda word: (-counts[word], word))
    return words[:n]


def _mean_sample_sd(values: list[float]) -> tuple[float, float]:
    size = len(values)
    mean = sum(values) / size
    variance = sum((value - mean) ** 2 for value in values) / (size - 1)
    return mean, math.sqrt(variance)
