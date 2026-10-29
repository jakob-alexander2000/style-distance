import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { absoluteZDifference, deltaBetween, readingFor, zScore } from "./delta"
import { sentenceWordCounts, tokenize } from "./tokenize"

const R1 = "the the the the the the of of and and"
const R2 = "the the the the of of of of and and"
const R3 = "the the of of and and and and and and"
const R4 = "the the the the of of of of and and"
const D1 = "the of of and and and and and and and"
const D2 = "the the the of and and and and and and"
const HAND_EXPECTED = (Math.sqrt(1.5) + 0.75 * Math.sqrt(3) + 1.75) / 3

describe("delta", () => {
  it("matches the hand-computed closed form", () => {
    const result = deltaBetween([R1, R2, R3, R4], [D1, D2], 3, "en")
    expect(Math.abs(result.delta - HAND_EXPECTED)).toBeLessThan(1e-12)
    const and = result.contributions.find((item) => item.word === "and")
    const the = result.contributions.find((item) => item.word === "the")
    const of = result.contributions.find((item) => item.word === "of")
    expect(and?.signedZ).toBeCloseTo(1.75, 12)
    expect(the?.signedZ).toBeCloseTo(-Math.sqrt(1.5), 12)
    expect(of?.signedZ).toBeCloseTo(-0.75 * Math.sqrt(3), 12)
    expect(and?.direction).toBe("over")
    expect(result.contributions[0]?.word).toBe("and")
  })

  it("reproduces Hoover 2004's published difference for of", () => {
    const mean = 1.821
    const paradiseLost = 2.769
    const behn = 1.783
    const sd = (paradiseLost - mean) / 3.015
    expect(zScore(paradiseLost, mean, sd)).toBeCloseTo(3.015, 12)
    expect(Number(zScore(behn, mean, sd).toFixed(3))).toBe(-0.121)
    expect(Number(absoluteZDifference(paradiseLost, behn, mean, sd).toFixed(3))).toBe(3.136)
  })

  it("drops a word that occurs in only one reference text", () => {
    const result = deltaBetween(
      ["the the the alpha alpha", "the the of of", "the of of of"],
      ["alpha alpha alpha of of"],
      10,
      "en",
    )
    expect(result.features).not.toContain("alpha")
    expect(result.features).toContain("the")
  })
})

describe("tokenising", () => {
  it("keeps umlauts and ß inside the word", () => {
    expect(tokenize("Für die Straße — daß die Übergröße bleibt.")).toEqual([
      "für",
      "die",
      "straße",
      "daß",
      "die",
      "übergröße",
      "bleibt",
    ])
    expect(tokenize("Fußgänger")).toEqual(["fußgänger"])
    expect(tokenize("STRASSE")).toEqual(["strasse"])
  })

  it("does not split on Mr.", () => {
    expect(
      sentenceWordCounts("Mr. Bennet replied that he had not. Mrs. Long has just been here!", "en"),
    ).toEqual([7, 6])
  })
})

describe("brand sample", () => {
  it("reads the drifted set as off-voice and the held-out chunk as close", () => {
    const brand = JSON.parse(readFileSync("public/samples/brand.json", "utf8")) as {
      references: { text: string }[]
      drafts: { text: string }[]
      heldOut: { text: string }
    }
    const thresholds = JSON.parse(readFileSync("data/thresholds.json", "utf8")) as {
      n: number
      closeMax: number
      offVoiceMin: number
    }
    const references = brand.references.map((item) => item.text)
    const draft = deltaBetween(
      references,
      brand.drafts.map((item) => item.text),
      thresholds.n,
      "en",
    )
    const held = deltaBetween(references, [brand.heldOut.text], thresholds.n, "en")
    expect(readingFor(draft.delta, thresholds.closeMax, thresholds.offVoiceMin)).toBe("off-voice")
    expect(readingFor(held.delta, thresholds.closeMax, thresholds.offVoiceMin)).toBe("close")
  })
})
