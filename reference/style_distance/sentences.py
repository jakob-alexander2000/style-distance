"""Sentence-length counts. The abbreviation list and scan match the TypeScript port."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .tokenize import TOKEN_RE, is_letter, normalize

_ROOT = Path(__file__).resolve().parents[2]


@lru_cache(maxsize=1)
def _abbreviations() -> dict[str, tuple[str, ...]]:
    raw = json.loads((_ROOT / "data" / "abbreviations.json").read_text(encoding="utf-8"))
    def ordered(words: list[str]) -> tuple[str, ...]:
        return tuple(sorted({word.lower() for word in words}, key=lambda word: (-len(word), word)))

    return {
        "en": ordered(list(raw["en"])),
        "de": ordered(list(raw["en"]) + list(raw["de"])),
    }


def abbreviations_for(language: str) -> tuple[str, ...]:
    try:
        return _abbreviations()[language]
    except KeyError as exc:
        raise ValueError(f"Unsupported language: {language}") from exc


def protect_abbreviations(text: str, abbrevs: tuple[str, ...]) -> str:
    """Replace abbr. with abbr· when the dot is an abbreviation, not a sentence end."""
    for abbr in abbrevs:
        needle = abbr + "."
        start = 0
        parts: list[str] = []
        while True:
            index = text.find(needle, start)
            if index < 0:
                parts.append(text[start:])
                break
            prev_ok = index == 0 or not is_letter(text[index - 1])
            if prev_ok:
                parts.append(text[start:index])
                parts.append(abbr + "\u00b7")
                start = index + len(needle)
            else:
                parts.append(text[start : index + 1])
                start = index + 1
        text = "".join(parts)
    return text


def sentence_word_counts(text: str, language: str) -> list[int]:
    norm = protect_abbreviations(normalize(text), abbreviations_for(language))
    counts: list[int] = []
    for part in _split_sentences(norm):
        words = TOKEN_RE.findall(part)
        if words:
            counts.append(len(words))
    return counts


def _split_sentences(text: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    for ch in text:
        if ch in ".!?":
            parts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    parts.append("".join(buf))
    return parts
