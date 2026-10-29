"""Calibrate close / drifting / off-voice from the authorship chapters.

Leave one chapter out. Distance to the rest of that author, and distance to
the other author, both use the same per-voice Delta as the tool (N = 150).

Percentiles are Hyndman–Fan type 7 (linear interpolation between closest
ranks), which is numpy's default.

Thresholds, in order:

1. If the 90th percentile of same-author distances sits strictly below the
   10th percentile of cross-author distances, that gap is the cut:
   close ≤ P90(same), off-voice ≥ P10(cross), drifting in between.
2. Otherwise, if the medians are ordered the same way, use the medians.
3. Otherwise the corpus does not separate and calibration refuses to invent a cut.
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from pathlib import Path

from .delta import delta_from_tokens, deltas_to_voices
from .tokenize import tokenize

N = 150
ROOT = Path(__file__).resolve().parents[2]


def percentile(values: list[float], p: float) -> float:
    xs = sorted(values)
    if len(xs) == 1:
        return xs[0]
    rank = (len(xs) - 1) * (p / 100.0)
    low = math.floor(rank)
    high = math.ceil(rank)
    if low == high:
        return xs[int(rank)]
    weight = rank - low
    return xs[low] * (1 - weight) + xs[high] * weight


def summarise(values: list[float]) -> dict[str, float | int]:
    return {
        "count": len(values),
        "min": min(values),
        "p10": percentile(values, 10),
        "p25": percentile(values, 25),
        "p50": statistics.median(values),
        "p75": percentile(values, 75),
        "p90": percentile(values, 90),
        "max": max(values),
        "mean": statistics.fmean(values),
    }


def _tokens_for(chunks: list[dict]) -> dict[str, list[str]]:
    return {chunk["id"]: tokenize(chunk["text"]) for chunk in chunks}


def leave_one_out(chunks: list[dict], tokens: dict[str, list[str]] | None = None, n: int = N) -> list[dict]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for chunk in chunks:
        grouped[chunk["author"]].append(chunk)
    if tokens is None:
        tokens = _tokens_for(chunks)
    rows: list[dict] = []
    for author, group in grouped.items():
        other_ids = [other["id"] for name, items in grouped.items() if name != author for other in items]
        other_docs = [tokens[item_id] for item_id in other_ids]
        for chunk in group:
            ref_docs = [tokens[item["id"]] for item in group if item["id"] != chunk["id"]]
            draft = [tokens[chunk["id"]]]
            same = delta_from_tokens(ref_docs, draft, n, None)
            cross = delta_from_tokens(other_docs, draft, n, None)
            rows.append(
                {
                    "id": chunk["id"],
                    "author": author,
                    "title": chunk["title"],
                    "words": chunk["words"],
                    "deltaSame": same.delta,
                    "deltaCross": cross.delta,
                    "correct": same.delta < cross.delta,
                }
            )
    return rows


def choose_thresholds(same: list[float], cross: list[float]) -> dict:
    same_p90 = percentile(same, 90)
    cross_p10 = percentile(cross, 10)
    if same_p90 < cross_p10:
        return {
            "closeMax": same_p90,
            "offVoiceMin": cross_p10,
            "rule": (
                "The 90th percentile of same-author leave-one-out distances "
                "sits below the 10th percentile of cross-author distances. "
                "Close means at or under that 90th percentile. Off-voice means "
                "at or over that 10th percentile. Drifting is the open interval between them."
            ),
            "method": "percentile-gap",
        }
    same_median = statistics.median(same)
    cross_median = statistics.median(cross)
    if same_median < cross_median:
        return {
            "closeMax": same_median,
            "offVoiceMin": cross_median,
            "rule": (
                "Same-author and cross-author distances overlap, so the percentile "
                "gap is not available. Close means at or under the median same-author "
                "distance. Off-voice means at or over the median cross-author distance. "
                "Drifting is the open interval between the medians."
            ),
            "method": "median-overlap",
        }
    raise RuntimeError("The validation corpus does not separate same-author from cross-author distances.")


def shared_leave_one_out(
    chunks: list[dict], tokens: dict[str, list[str]] | None = None, n: int = N
) -> list[dict]:
    """Burrows' comparison: one z-scale for every reference text, two voice centroids."""
    grouped: dict[str, list[dict]] = defaultdict(list)
    for chunk in chunks:
        grouped[chunk["author"]].append(chunk)
    if tokens is None:
        tokens = _tokens_for(chunks)
    rows: list[dict] = []
    for author, group in grouped.items():
        other = next(name for name in grouped if name != author)
        for chunk in group:
            voices = [
                (
                    name,
                    [tokens[item["id"]] for item in items if item["id"] != chunk["id"]],
                )
                for name, items in grouped.items()
            ]
            measured = deltas_to_voices(voices, [tokens[chunk["id"]]], n, None)
            same = measured[author].delta
            cross = measured[other].delta
            rows.append(
                {
                    "id": chunk["id"],
                    "author": author,
                    "title": chunk["title"],
                    "words": chunk["words"],
                    "deltaSame": same,
                    "deltaCross": cross,
                    "correct": same < cross,
                }
            )
    return rows


def choose_held_out(rows: list[dict]) -> dict:
    """A representative correct Austen chapter, not the easiest and not a short one."""
    pool = [
        row
        for row in rows
        if row["author"] == "austen" and row["correct"] and row["words"] >= 1200
    ]
    if not pool:
        pool = [row for row in rows if row["author"] == "austen" and row["correct"]]
    if not pool:
        raise RuntimeError("No held-out Austen chapter was attributed to Austen.")
    margins = [row["deltaCross"] - row["deltaSame"] for row in pool]
    target = statistics.median(margins)
    pool.sort(key=lambda row: (abs((row["deltaCross"] - row["deltaSame"]) - target), row["id"]))
    return pool[0]


def length_check(chunks: list[dict], tokens: dict[str, list[str]], limits: tuple[int, ...] = (400, 800, 1200, 2000)) -> list[dict]:
    """Shared-basis attribution when every text is cut to its first N words."""
    grouped: dict[str, list[dict]] = defaultdict(list)
    for chunk in chunks:
        grouped[chunk["author"]].append(chunk)
    report = []
    for limit in limits:
        eligible = {
            author: [chunk for chunk in items if len(tokens[chunk["id"]]) >= limit]
            for author, items in grouped.items()
        }
        if any(len(items) < 3 for items in eligible.values()):
            report.append({"words": limit, "correct": 0, "total": 0, "skipped": True})
            continue
        cut = {
            chunk["id"]: tokens[chunk["id"]][:limit]
            for items in eligible.values()
            for chunk in items
        }
        flat = [chunk for items in eligible.values() for chunk in items]
        rows = shared_leave_one_out(flat, tokens=cut)
        correct = sum(1 for row in rows if row["correct"])
        report.append(
            {
                "words": limit,
                "correct": correct,
                "total": len(rows),
                "skipped": False,
            }
        )
    return report


def compute(chunks: list[dict] | None = None) -> dict:
    if chunks is None:
        import json

        payload = json.loads((ROOT / "public" / "samples" / "authorship.json").read_text(encoding="utf-8"))
        chunks = payload["chunks"]
    tokens = _tokens_for(chunks)
    per_voice = leave_one_out(chunks, tokens=tokens)
    shared = shared_leave_one_out(chunks, tokens=tokens)
    same = [row["deltaSame"] for row in per_voice]
    cross = [row["deltaCross"] for row in per_voice]
    chosen = choose_thresholds(same, cross)
    held = choose_held_out(shared)
    return {
        "n": N,
        "closeMax": chosen["closeMax"],
        "offVoiceMin": chosen["offVoiceMin"],
        "rule": chosen["rule"],
        "method": chosen["method"],
        "sameAuthor": summarise(same),
        "crossAuthor": summarise(cross),
        "perVoiceAttribution": _score(per_voice),
        "sharedAttribution": _score(shared),
        "sharedSameAuthor": summarise([row["deltaSame"] for row in shared]),
        "sharedCrossAuthor": summarise([row["deltaCross"] for row in shared]),
        "heldOutId": held["id"],
        "heldOut": {
            "id": held["id"],
            "author": held["author"],
            "title": held["title"],
            "words": held["words"],
            "deltaSame": held["deltaSame"],
            "deltaCross": held["deltaCross"],
        },
        "sharedMisses": [
            {
                "id": row["id"],
                "author": row["author"],
                "title": row["title"],
                "words": row["words"],
                "deltaSame": row["deltaSame"],
                "deltaCross": row["deltaCross"],
            }
            for row in shared
            if not row["correct"]
        ],
        "lengthCheck": length_check(chunks, tokens),
        "rows": shared,
    }


def _score(rows: list[dict]) -> dict:
    by_author = {}
    for author in ("austen", "bronte"):
        subset = [row for row in rows if row["author"] == author]
        by_author[author] = {
            "correct": sum(1 for row in subset if row["correct"]),
            "total": len(subset),
        }
    return {
        "correct": sum(1 for row in rows if row["correct"]),
        "total": len(rows),
        "byAuthor": by_author,
    }


def public_thresholds(stats: dict) -> dict:
    """What the app and the README need. Per-chapter rows stay in validation.json."""
    keep = {key: stats[key] for key in stats if key != "rows"}
    return keep
