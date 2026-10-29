"""Burrows' Delta, as Style Distance measures it.

The operation order in this package is a parity contract with src/lib/delta.ts.
"""

from .delta import DeltaResult, delta_between, reading_for
from .sentences import sentence_word_counts
from .tokenize import tokenize

__all__ = [
    "DeltaResult",
    "delta_between",
    "reading_for",
    "sentence_word_counts",
    "tokenize",
]
