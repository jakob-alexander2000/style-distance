"""Build the public-domain authorship sample from Project Gutenberg.

Downloads Pride and Prejudice and Jane Eyre, drops the Gutenberg header,
footer, and illustration blocks, and writes public/samples/authorship.json.

The texts of both novels are in the public domain. The Project Gutenberg
header and footer are not kept.
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

from style_distance.tokenize import tokenize

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "samples" / "authorship.json"
CACHE = ROOT / "reference" / ".cache"

SOURCES = {
    "austen": {
        "author": "Jane Austen",
        "work": "Pride and Prejudice",
        "year": 1813,
        "url": "https://www.gutenberg.org/ebooks/1342",
        "text_url": "https://www.gutenberg.org/cache/epub/1342/pg1342.txt",
    },
    "bronte": {
        "author": "Charlotte Brontë",
        "work": "Jane Eyre",
        "year": 1847,
        "url": "https://www.gutenberg.org/ebooks/1260",
        "text_url": "https://www.gutenberg.org/cache/epub/1260/pg1260.txt",
    },
}

HEADING = re.compile(
    r"^(?:CHAPTER|Chapter)\s+([IVXLCDM]+)(?:[.\]]+|\s*[—–-].*)?\s*$"
)
MIN_WORDS = 650


def fetch(url: str, dest: Path) -> str:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        return dest.read_text(encoding="utf-8")
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "style-distance/1.0 (public-domain corpus preparation)"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        text = response.read().decode("utf-8")
    dest.write_text(text, encoding="utf-8")
    return text


def ebook_body(text: str) -> str:
    start = text.index("*** START OF")
    start = text.index("\n", start) + 1
    end = text.index("*** END OF")
    return text[start:end]


def strip_brackets(text: str) -> str:
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        if text[i] == "[":
            j = _match_bracket(text, i)
            inner = text[i + 1 : j - 1] if j > i and text[j - 1] == "]" else text[i + 1 :]
            head = inner.lstrip().lower()
            if (
                head.startswith("illustration")
                or head.startswith("_copyright")
                or head.startswith("copyright")
                or "copyright 1894" in head
            ):
                # The illustrated Austen edition hides "Chapter I.]" inside the
                # title-page bracket. Keep a real heading; drop the rest.
                kept = [
                    line.strip()
                    for line in inner.splitlines()
                    if HEADING.match(line.strip())
                ]
                if kept:
                    out.append("\n" + "\n".join(kept) + "\n")
                i = j
                continue
            out.append(text[i:j])
            i = j
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


def _match_bracket(text: str, start: int) -> int:
    depth = 0
    for index in range(start, len(text)):
        char = text[index]
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return index + 1
    return len(text)


def unwrap(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("_", "")
    paragraphs: list[str] = []
    for block in re.split(r"\n\s*\n", text):
        line = re.sub(r"[ \t]+", " ", block)
        line = re.sub(r"\s*\n\s*", " ", line).strip()
        if line:
            paragraphs.append(line)
    return "\n\n".join(paragraphs)


def roman_to_int(numeral: str) -> int:
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    previous = 0
    for char in reversed(numeral):
        value = values[char]
        if value < previous:
            total -= value
        else:
            total += value
            previous = value
    return total


def chapters(body: str) -> list[tuple[int, str, str]]:
    body = strip_brackets(body)
    lines = body.splitlines()
    found: list[tuple[int, int, str]] = []
    for index, line in enumerate(lines):
        match = HEADING.match(line.strip())
        if match:
            found.append((index, roman_to_int(match.group(1)), match.group(1)))
    chunks: list[tuple[int, str, str]] = []
    for position, (line_index, number, numeral) in enumerate(found):
        end = found[position + 1][0] if position + 1 < len(found) else len(lines)
        prose = unwrap("\n".join(lines[line_index + 1 : end]))
        chunks.append((number, f"Chapter {numeral}", prose))
    return chunks


def build() -> dict:
    samples = []
    for key, meta in SOURCES.items():
        raw = fetch(meta["text_url"], CACHE / f"{key}.txt")
        extracted = chapters(ebook_body(raw))
        seen: dict[int, tuple[str, str, int]] = {}
        for number, title, prose in extracted:
            words = tokenize(prose)
            if len(words) < MIN_WORDS:
                continue
            previous = seen.get(number)
            if previous is None or len(words) > previous[2]:
                seen[number] = (title, prose, len(words))
        for number in sorted(seen):
            title, prose, count = seen[number]
            samples.append(
                {
                    "id": f"{key}-{number}",
                    "author": key,
                    "title": title,
                    "words": count,
                    "text": prose,
                }
            )
    return {
        "language": "en",
        "synthetic": False,
        "note": (
            "Public domain. Jane Austen, Pride and Prejudice (1813), and "
            "Charlotte Brontë, Jane Eyre (1847), from Project Gutenberg. "
            "The Gutenberg header, footer, and illustration blocks are removed."
        ),
        "sources": {
            key: {k: v for k, v in meta.items() if k != "text_url"}
            for key, meta in SOURCES.items()
        },
        "chunks": samples,
    }


def main() -> None:
    payload = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    from collections import Counter

    counts = Counter(chunk["author"] for chunk in payload["chunks"])
    words = {key: [] for key in SOURCES}
    for chunk in payload["chunks"]:
        words[chunk["author"]].append(chunk["words"])
    print(f"wrote {OUT}")
    for key, total in counts.items():
        series = words[key]
        print(
            f"{key}: {total} chapters, words min {min(series)} median {sorted(series)[len(series)//2]} max {max(series)}"
        )
    first = next(chunk for chunk in payload["chunks"] if chunk["id"] == "austen-1")
    print("austen-1 starts:", first["text"][:80].replace("\n", " "))
    bronte = next(chunk for chunk in payload["chunks"] if chunk["id"] == "bronte-1")
    print("bronte-1 starts:", bronte["text"][:80].replace("\n", " "))


if __name__ == "__main__":
    main()
