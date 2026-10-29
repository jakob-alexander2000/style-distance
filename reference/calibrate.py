"""Rewrite data/thresholds.json and data/validation.json from the corpus."""

from __future__ import annotations

import json
from pathlib import Path

from style_distance.validate import ROOT, compute, public_thresholds


def main() -> None:
    stats = compute()
    data = ROOT / "data"
    data.mkdir(parents=True, exist_ok=True)
    (data / "validation.json").write_text(
        json.dumps(stats, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    (data / "thresholds.json").write_text(
        json.dumps(public_thresholds(stats), ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    held = stats["heldOut"]
    print(
        f"method={stats['method']} closeMax={stats['closeMax']:.4f} "
        f"offVoiceMin={stats['offVoiceMin']:.4f}"
    )
    print(f"per-voice {stats['perVoiceAttribution']}")
    print(f"shared {stats['sharedAttribution']}")
    print(
        f"same p50={stats['sameAuthor']['p50']:.4f} p90={stats['sameAuthor']['p90']:.4f} "
        f"cross p10={stats['crossAuthor']['p10']:.4f} p50={stats['crossAuthor']['p50']:.4f}"
    )
    print("misses", [row["id"] for row in stats["sharedMisses"]])
    print(
        f"held out {held['id']} {held['title']} words={held['words']} "
        f"same={held['deltaSame']:.4f} cross={held['deltaCross']:.4f}"
    )
    for row in stats["lengthCheck"]:
        print(f"length {row['words']}: {row['correct']}/{row['total']} skipped={row['skipped']}")


if __name__ == "__main__":
    main()
