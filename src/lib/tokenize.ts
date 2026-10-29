import abbreviations from "../../data/abbreviations.json"
import functionWordsDe from "../../data/function-words-de.txt?raw"

const LETTER = "A-Za-zÀ-ÖØ-öø-ÿ"
const LETTER_RE = new RegExp(`^[${LETTER}]$`)
const TOKEN_RE = new RegExp(`[${LETTER}]+(?:'[${LETTER}]+)*`, "g")

export type Language = "en" | "de"

let germanWords: Set<string> | null = null

export function germanFunctionWords(): Set<string> {
  if (germanWords) return germanWords
  const words = new Set<string>()
  for (const line of functionWordsDe.split("\n")) {
    const word = line.split("#", 1)[0]?.trim().toLowerCase() ?? ""
    if (word) words.add(word)
  }
  germanWords = words
  return words
}

export function isLetter(ch: string): boolean {
  return ch.length === 1 && LETTER_RE.test(ch)
}

export function normalize(text: string): string {
  if (!text) return ""
  let value = text
  value = value
    .replaceAll("\u2019", "'")
    .replaceAll("\u2018", "'")
    .replaceAll("\u02bc", "'")
    .replaceAll("\u2032", "'")
  value = value
    .replaceAll("\u201c", " ")
    .replaceAll("\u201d", " ")
    .replaceAll("\u201e", " ")
    .replaceAll("\u00ab", " ")
    .replaceAll("\u00bb", " ")
    .replaceAll('"', " ")
  value = value
    .replaceAll("\u2014", " ")
    .replaceAll("\u2013", " ")
    .replaceAll("\u2015", " ")
    .replaceAll("—", " ")
    .replaceAll("–", " ")
  value = value.replaceAll("\u00a0", " ").replaceAll("\u202f", " ")
  value = value.replaceAll("_", "")
  value = value.replaceAll("\u2026", "...")
  return value.toLowerCase()
}

export function tokenize(text: string): string[] {
  return normalize(text).match(TOKEN_RE) ?? []
}

const wordCountCache = new Map<string, number>()

export function wordCount(text: string): number {
  const cached = wordCountCache.get(text)
  if (cached !== undefined) return cached
  const count = tokenize(text).length
  if (wordCountCache.size > 500) wordCountCache.clear()
  wordCountCache.set(text, count)
  return count
}

export function allowedWords(language: Language): Set<string> | null {
  if (language === "de") return germanFunctionWords()
  return null
}

function orderAbbrevs(words: readonly string[]): string[] {
  return [...words]
    .map((word) => word.toLowerCase())
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
}

const ABBREV: Record<Language, string[]> = {
  en: orderAbbrevs(abbreviations.en),
  de: orderAbbrevs([...abbreviations.en, ...abbreviations.de]),
}

export function abbreviationsFor(language: Language): string[] {
  return ABBREV[language]
}

export function protectAbbreviations(text: string, abbrevs: readonly string[]): string {
  let value = text
  for (const abbr of abbrevs) {
    const needle = `${abbr}.`
    let start = 0
    const parts: string[] = []
    while (true) {
      const index = value.indexOf(needle, start)
      if (index < 0) {
        parts.push(value.slice(start))
        break
      }
      const prevOk = index === 0 || !isLetter(value[index - 1] ?? "")
      if (prevOk) {
        parts.push(value.slice(start, index), `${abbr}\u00b7`)
        start = index + needle.length
      } else {
        parts.push(value.slice(start, index + 1))
        start = index + 1
      }
    }
    value = parts.join("")
  }
  return value
}

export function sentenceWordCounts(text: string, language: Language): number[] {
  const norm = protectAbbreviations(normalize(text), abbreviationsFor(language))
  const counts: number[] = []
  let buf = ""
  const flush = () => {
    const words = buf.match(TOKEN_RE) ?? []
    if (words.length) counts.push(words.length)
    buf = ""
  }
  for (const ch of norm) {
    if (ch === "." || ch === "!" || ch === "?") flush()
    else buf += ch
  }
  flush()
  return counts
}
