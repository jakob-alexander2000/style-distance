"""Tokenising shared with the TypeScript port.

A word is a run of Latin letters, including German ä ö ü ß, with an ASCII
apostrophe allowed inside the word (don't). Casefolding is Unicode lower,
not a German locale fold: ß stays ß, and SS is not rewritten to ß.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_LETTER = "A-Za-zÀ-ÖØ-öø-ÿ"
_LETTER_RE = re.compile(rf"[{_LETTER}]")
TOKEN_RE = re.compile(rf"[{_LETTER}]+(?:'[{_LETTER}]+)*")


def is_letter(ch: str) -> bool:
    return len(ch) == 1 and _LETTER_RE.fullmatch(ch) is not None


def normalize(text: str) -> str:
    if not text:
        return ""
    text = (
        text.replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u02bc", "'")
        .replace("\u2032", "'")
    )
    text = (
        text.replace("\u201c", " ")
        .replace("\u201d", " ")
        .replace("\u201e", " ")
        .replace("\u00ab", " ")
        .replace("\u00bb", " ")
        .replace('"', " ")
    )
    text = (
        text.replace("\u2014", " ")
        .replace("\u2013", " ")
        .replace("\u2015", " ")
        .replace("—", " ")
        .replace("–", " ")
    )
    text = text.replace("\u00a0", " ").replace("\u202f", " ")
    text = text.replace("_", "")
    text = text.replace("\u2026", "...")
    return text.lower()


def tokenize(text: str) -> list[str]:
    return TOKEN_RE.findall(normalize(text))


@lru_cache(maxsize=1)
def german_function_words() -> frozenset[str]:
    path = _ROOT / "data" / "function-words-de.txt"
    words: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip().lower()
        if line:
            words.add(line)
    return frozenset(words)


def allowed_words(language: str) -> frozenset[str] | None:
    if language == "de":
        return german_function_words()
    if language == "en":
        return None
    raise ValueError(f"Unsupported language: {language}")
