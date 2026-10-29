"""Print a Delta result as JSON for the TypeScript parity test.

Usage: python -m style_distance path/to/fixture.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .delta import delta_between


def main() -> None:
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    result = delta_between(
        payload["reference"],
        payload["drafts"],
        int(payload["n"]),
        payload["language"],
    )
    json.dump(
        {
            "delta": result.delta,
            "features": list(result.features),
            "dropped": list(result.dropped),
            "contributions": [
                {
                    "word": item.word,
                    "absZ": item.abs_z,
                    "signedZ": item.signed_z,
                    "direction": item.direction,
                }
                for item in result.contributions
            ],
        },
        sys.stdout,
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
