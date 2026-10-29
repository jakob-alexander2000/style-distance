from style_distance.sentences import sentence_word_counts
from style_distance.tokenize import german_function_words, tokenize


def test_german_umlauts_and_eszett_stay_inside_the_word():
    assert tokenize("Für die Straße — daß die Übergröße bleibt.") == [
        "für",
        "die",
        "straße",
        "daß",
        "die",
        "übergröße",
        "bleibt",
    ]


def test_eszett_is_not_expanded_to_ss():
    assert tokenize("Fußgänger") == ["fußgänger"]
    assert tokenize("STRASSE") == ["strasse"]


def test_apostrophe_and_curly_quote():
    assert tokenize("Don’t stop.") == ["don't", "stop"]
    assert tokenize("Mr. Bennet said no.") == ["mr", "bennet", "said", "no"]


def test_mr_does_not_end_the_sentence():
    counts = sentence_word_counts(
        "Mr. Bennet replied that he had not. Mrs. Long has just been here!",
        "en",
    )
    assert counts == [7, 6]


def test_german_abbreviation_z_b():
    counts = sentence_word_counts("Das ist groß, z.B. die Straße. Wirklich.", "de")
    assert counts == [7, 1]


def test_function_word_list_has_umlauts_and_not_content():
    words = german_function_words()
    assert "für" in words
    assert "über" in words
    assert "daß" in words
    assert "dass" in words
    assert "straße" not in words
    assert "haus" not in words
    assert len(words) >= 150
