/**
 * Burrows' Delta against a reference voice.
 *
 * Operation order matches reference/style_distance/delta.py. That order is
 * the parity contract: two-pass sample variance, divisor n − 1, most-frequent
 * words ranked by raw count with alphabetical ties, words from only one
 * reference text left out.
 *
 * John Burrows, "Delta': a Measure of Stylistic Difference and a Guide to
 * Likely Authorship", Literary and Linguistic Computing 17.3 (2002), 267–287.
 * https://doi.org/10.1093/llc/17.3.267
 */

import { allowedWords, tokenize, type Language } from "./tokenize"

export type Direction = "over" | "under" | "even"
export type Reading = "close" | "drifting" | "off-voice"

export type Contribution = {
  word: string
  absZ: number
  signedZ: number
  freqDraft: number
  freqVoice: number
  direction: Direction
  mfwIndex: number
}

export type DeltaResult = {
  delta: number
  features: string[]
  dropped: string[]
  contributions: Contribution[]
  referenceTokens: number
  draftTokens: number
}

export function readingFor(delta: number, closeMax: number, offVoiceMin: number): Reading {
  if (closeMax >= offVoiceMin) {
    throw new Error("closeMax must sit strictly below offVoiceMin")
  }
  if (delta <= closeMax) return "close"
  if (delta >= offVoiceMin) return "off-voice"
  return "drifting"
}

export function zScore(frequency: number, mean: number, sd: number): number {
  return (frequency - mean) / sd
}

export function absoluteZDifference(
  frequencyA: number,
  frequencyB: number,
  mean: number,
  sd: number,
): number {
  return Math.abs(zScore(frequencyA, mean, sd) - zScore(frequencyB, mean, sd))
}

export function deltaBetween(
  referenceTexts: string[],
  draftTexts: string[],
  n: number,
  language: Language,
): DeltaResult {
  if (n < 1) throw new Error("N must be at least 1")
  return deltaFromTokens(
    referenceTexts.map(tokenize),
    draftTexts.map(tokenize),
    n,
    allowedWords(language),
  )
}

export function deltasToVoices(
  voices: { id: string; texts: string[] }[],
  draftTexts: string[],
  n: number,
  language: Language,
): Record<string, DeltaResult> {
  return deltasFromTokenVoices(
    voices.map((voice) => ({ id: voice.id, docs: voice.texts.map(tokenize) })),
    draftTexts.map(tokenize),
    n,
    allowedWords(language),
  )
}

export function deltaFromTokens(
  referenceDocs: string[][],
  draftDocs: string[][],
  n: number,
  allowed: Set<string> | null,
): DeltaResult {
  const measured = deltasFromTokenVoices(
    [{ id: "voice", docs: referenceDocs }],
    draftDocs,
    n,
    allowed,
  )
  const result = measured.voice
  if (!result) throw new Error("Delta needs a reference voice.")
  return result
}

export function deltasFromTokenVoices(
  voices: { id: string; docs: string[][] }[],
  draftDocs: string[][],
  n: number,
  allowed: Set<string> | null,
): Record<string, DeltaResult> {
  if (voices.length < 1) throw new Error("Delta needs a reference voice.")
  const allRefs = voices.flatMap((voice) => voice.docs)
  if (allRefs.length < 2) throw new Error("Delta needs at least two reference texts.")
  if (draftDocs.length < 1) throw new Error("Delta needs at least one draft.")
  if (allRefs.some((doc) => doc.length === 0)) {
    throw new Error("A reference text has no words after tokenising.")
  }
  if (draftDocs.some((doc) => doc.length === 0)) {
    throw new Error("A draft has no words after tokenising.")
  }

  const refRels = allRefs.map(relative)
  const draftRels = draftDocs.map(relative)
  const counts = corpusCounts(allRefs)
  const features = mostFrequent(allRefs, counts, n, allowed)
  if (features.length < 2) {
    throw new Error("Not enough words with a spread to measure a distance.")
  }

  const means = new Map<string, number>()
  const sds = new Map<string, number>()
  const used: { index: number; word: string }[] = []
  const dropped: string[] = []
  features.forEach((word, index) => {
    const values = refRels.map((rel) => rel.get(word) ?? 0)
    const [mean, sd] = meanSampleSd(values)
    if (sd === 0 || !Number.isFinite(sd)) {
      dropped.push(word)
      return
    }
    means.set(word, mean)
    sds.set(word, sd)
    used.push({ index, word })
  })
  if (used.length < 2) {
    throw new Error("Not enough words with a spread to measure a distance.")
  }

  const freqDraft = new Map<string, number>()
  const zDraft = new Map<string, number>()
  for (const { word } of used) {
    let sum = 0
    for (const rel of draftRels) sum += rel.get(word) ?? 0
    const frequency = sum / draftRels.length
    freqDraft.set(word, frequency)
    zDraft.set(word, zScore(frequency, means.get(word) ?? 0, sds.get(word) ?? 1))
  }

  const featureNames = used.map((item) => item.word)
  const results: Record<string, DeltaResult> = {}
  for (const voice of voices) {
    if (voice.docs.length < 1) throw new Error("Each voice needs at least one text.")
    const voiceRels = voice.docs.map(relative)
    const contributions: Contribution[] = []
    let absSum = 0
    for (const { index, word } of used) {
      let voiceSum = 0
      for (const rel of voiceRels) voiceSum += rel.get(word) ?? 0
      const freqVoice = voiceSum / voiceRels.length
      const mean = means.get(word) ?? 0
      const sd = sds.get(word) ?? 1
      const zVoice = zScore(freqVoice, mean, sd)
      const signed = (zDraft.get(word) ?? 0) - zVoice
      const magnitude = Math.abs(signed)
      const draftFrequency = freqDraft.get(word) ?? 0
      const direction: Direction =
        draftFrequency > freqVoice ? "over" : draftFrequency < freqVoice ? "under" : "even"
      contributions.push({
        word,
        absZ: magnitude,
        signedZ: signed,
        freqDraft: draftFrequency,
        freqVoice,
        direction,
        mfwIndex: index,
      })
      absSum += magnitude
    }
    contributions.sort((a, b) => b.absZ - a.absZ || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))
    results[voice.id] = {
      delta: absSum / used.length,
      features: featureNames,
      dropped: [...dropped],
      contributions,
      referenceTokens: voice.docs.reduce((sum, doc) => sum + doc.length, 0),
      draftTokens: draftDocs.reduce((sum, doc) => sum + doc.length, 0),
    }
  }
  return results
}

function relative(tokens: string[]): Map<string, number> {
  const total = tokens.length
  const counts = new Map<string, number>()
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
  const rel = new Map<string, number>()
  for (const [word, count] of counts) rel.set(word, count / total)
  return rel
}

function corpusCounts(docs: string[][]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const doc of docs) {
    for (const token of doc) counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return counts
}

function mostFrequent(
  docs: string[][],
  counts: Map<string, number>,
  n: number,
  allowed: Set<string> | null,
): string[] {
  const documentFrequency = new Map<string, number>()
  for (const doc of docs) {
    for (const word of new Set(doc)) {
      documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1)
    }
  }
  const words: string[] = []
  for (const [word, count] of counts) {
    if (count > 0 && (documentFrequency.get(word) ?? 0) >= 2 && (allowed === null || allowed.has(word))) {
      words.push(word)
    }
  }
  words.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || (a < b ? -1 : a > b ? 1 : 0))
  return words.slice(0, n)
}

function meanSampleSd(values: number[]): [number, number] {
  const size = values.length
  let mean = 0
  for (const value of values) mean += value
  mean /= size
  let variance = 0
  for (const value of values) {
    const diff = value - mean
    variance += diff * diff
  }
  variance /= size - 1
  return [mean, Math.sqrt(variance)]
}
