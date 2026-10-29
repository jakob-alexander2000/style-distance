import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { deltaBetween, type Contribution } from "../lib/delta"

type Fixture = {
  language: "en" | "de"
  n: number
  reference: string[]
  drafts: string[]
}

type PythonResult = {
  delta: number
  features: string[]
  contributions: { word: string; absZ: number; signedZ: number; direction: string }[]
}

function pythonDelta(fixturePath: string): PythonResult {
  const stdout = execFileSync("python3", ["-m", "style_distance", fixturePath], {
    cwd: process.cwd(),
    env: { ...process.env, PYTHONPATH: "reference" },
    encoding: "utf8",
  })
  return JSON.parse(stdout) as PythonResult
}

function assertParity(fixturePath: string) {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture
  const python = pythonDelta(fixturePath)
  const typescript = deltaBetween(fixture.reference, fixture.drafts, fixture.n, fixture.language)
  expect(Math.abs(typescript.delta - python.delta)).toBeLessThan(1e-9)
  expect(typescript.features).toEqual(python.features)
  const byWord = new Map<string, Contribution>(typescript.contributions.map((item) => [item.word, item]))
  for (const item of python.contributions) {
    const match = byWord.get(item.word)
    expect(match, item.word).toBeTruthy()
    expect(Math.abs((match?.absZ ?? 0) - item.absZ)).toBeLessThan(1e-9)
    expect(Math.abs((match?.signedZ ?? 0) - item.signedZ)).toBeLessThan(1e-9)
    expect(match?.direction).toBe(item.direction)
  }
}

describe("parity with the Python reference", () => {
  it("matches the hand-computed English fixture within 1e-9", () => {
    assertParity("reference/fixtures/hand-en.json")
  })

  it("matches the German fixture within 1e-9", () => {
    assertParity("reference/fixtures/de-voice.json")
  })

  it("matches the synthetic demo within 1e-9", () => {
    const brand = JSON.parse(readFileSync("public/samples/brand.json", "utf8")) as {
      references: { text: string }[]
      drafts: { text: string }[]
      heldOut: { text: string }
    }
    const thresholds = JSON.parse(readFileSync("data/thresholds.json", "utf8")) as { n: number }
    const fixture = {
      language: "en" as const,
      n: thresholds.n,
      reference: brand.references.map((item) => item.text),
      drafts: brand.drafts.map((item) => item.text),
    }
    const dir = mkdtempSync(join(tmpdir(), "style-distance-"))
    const path = join(dir, "brand-drafts.json")
    writeFileSync(path, JSON.stringify(fixture))
    assertParity(path)
    const heldPath = join(dir, "brand-held.json")
    writeFileSync(heldPath, JSON.stringify({ ...fixture, drafts: [brand.heldOut.text] }))
    assertParity(heldPath)
  })
})
