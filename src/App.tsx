import { useEffect, useMemo, useState } from "react"
import thresholds from "../data/thresholds.json"
import { RankBars } from "./components/RankBars"
import { SentenceChart } from "./components/SentenceChart"
import { TextColumn } from "./components/TextColumn"
import {
  deltaBetween,
  deltasToVoices,
  readingFor,
  type DeltaResult,
  type Reading,
} from "./lib/delta"
import { sentenceWordCounts, wordCount, type Language } from "./lib/tokenize"
import type { Piece, Voice } from "./types"

let sequence = 1
const nextId = () => `p${sequence++}`

function blank(title = ""): Piece {
  return { id: nextId(), title, text: "" }
}

const initialVoices: Voice[] = [
  { id: "house", label: "Reference", texts: [blank("Text 1"), blank("Text 2")] },
]

type LoadedText = { id: string; title: string; text: string }

export function App() {
  const [language, setLanguage] = useState<Language>("en")
  const [n, setN] = useState(150)
  const [voices, setVoices] = useState<Voice[]>(initialVoices)
  const [drafts, setDrafts] = useState<Piece[]>([blank("Draft 1")])
  const [heldOut, setHeldOut] = useState<Piece | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [mode, setMode] = useState<"custom" | "brand" | "authorship">("custom")
  const [selectedVoice, setSelectedVoice] = useState("house")
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [debounced, setDebounced] = useState({ voices, drafts, heldOut, n, language })

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebounced({ voices, drafts, heldOut, n, language })
    }, 180)
    return () => window.clearTimeout(handle)
  }, [voices, drafts, heldOut, n, language])

  const view = useMemo(() => buildView(debounced), [debounced])

  async function loadJson<T>(path: string): Promise<T> {
    const response = await fetch(path)
    if (!response.ok) throw new Error("The sample did not load.")
    return (await response.json()) as T
  }

  async function loadBrand() {
    setBusy(true)
    setLoadError(null)
    try {
      const data = await loadJson<{
        note: string
        references: LoadedText[]
        drafts: LoadedText[]
        heldOut: LoadedText
      }>("/samples/brand.json")
      setMode("brand")
      setLanguage("en")
      setNotice(data.note)
      setVoices([{ id: "house", label: "House voice", texts: data.references.map(asPiece) }])
      setDrafts(data.drafts.map(asPiece))
      setHeldOut(asPiece(data.heldOut))
      setSelectedVoice("house")
      setOpen({})
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The sample did not load.")
    } finally {
      setBusy(false)
    }
  }

  async function loadAuthorship() {
    setBusy(true)
    setLoadError(null)
    try {
      const data = await loadJson<{
        note: string
        chunks: { id: string; author: string; title: string; text: string }[]
      }>("/samples/authorship.json")
      const held = data.chunks.find((chunk) => chunk.id === thresholds.heldOutId)
      if (!held) throw new Error("The held-out chapter is missing from the sample.")
      const austen = data.chunks.filter((chunk) => chunk.author === "austen" && chunk.id !== held.id)
      const bronte = data.chunks.filter((chunk) => chunk.author === "bronte")
      setMode("authorship")
      setLanguage("en")
      setNotice(data.note)
      setVoices([
        { id: "austen", label: "Jane Austen", texts: austen.map(asPiece) },
        { id: "bronte", label: "Charlotte Brontë", texts: bronte.map(asPiece) },
      ])
      setDrafts([asPiece({ ...held, title: `${held.title}, held out` })])
      setHeldOut(null)
      setSelectedVoice("austen")
      setOpen({})
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The sample did not load.")
    } finally {
      setBusy(false)
    }
  }

  function clearAll() {
    setMode("custom")
    setLanguage("en")
    setNotice(null)
    setHeldOut(null)
    setVoices([{ id: "house", label: "Reference", texts: [blank("Text 1"), blank("Text 2")] }])
    setDrafts([blank("Draft 1")])
    setSelectedVoice("house")
    setOpen({})
    setLoadError(null)
  }

  function updateVoice(voiceId: string, pieceId: string, patch: Partial<Piece>) {
    setVoices((current) =>
      current.map((voice) =>
        voice.id === voiceId
          ? { ...voice, texts: voice.texts.map((piece) => (piece.id === pieceId ? { ...piece, ...patch } : piece)) }
          : voice,
      ),
    )
  }

  const activeVoice = voices.find((voice) => voice.id === selectedVoice) ?? voices[0]
  const explained =
    view.kind === "single"
      ? {
          contributions: view.contributions,
          motionKey: view.motionKey,
          lengths: view.referenceLengths,
          draftLengths: view.draftLengths,
        }
      : view.kind === "pair"
        ? {
            contributions: view.byVoice[selectedVoice]?.contributions ?? view.byVoice.austen?.contributions ?? [],
            motionKey: view.byVoice[selectedVoice]?.motionKey ?? view.byVoice.austen?.motionKey ?? "",
            lengths: view.byVoice[selectedVoice]?.lengths ?? view.byVoice.austen?.lengths ?? [],
            draftLengths: view.draftLengths,
          }
        : null

  return (
    <main>
      <a className="skip" href="#distance">
        Skip to the distance
      </a>
      <header className="mast">
        <p className="eyebrow">Burrows’ Delta</p>
        <h1>Style Distance</h1>
        <p className="lede">How far a draft sits from a house voice, as one number.</p>
      </header>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Language">
          <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>
            English
          </button>
          <button type="button" aria-pressed={language === "de"} onClick={() => setLanguage("de")}>
            Deutsch
          </button>
        </div>
        <label className="n-control">
          <span>Most frequent words</span>
          <input
            type="range"
            min={20}
            max={300}
            step={5}
            value={n}
            onChange={(event) => setN(Number(event.target.value))}
          />
          <input
            type="number"
            min={20}
            max={300}
            value={n}
            onChange={(event) => setN(clampN(Number(event.target.value)))}
            aria-label="Number of most frequent words"
          />
        </label>
        <button type="button" className="demo" onClick={loadAuthorship} disabled={busy}>
          Authorship demo
        </button>
        <button type="button" className="demo" onClick={loadBrand} disabled={busy}>
          Brand-voice demo
        </button>
        <button type="button" className="text-button" onClick={clearAll}>
          Clear
        </button>
      </div>

      {notice && <p className="notice">{notice}</p>}
      {loadError && <p className="banner banner-warn">{loadError}</p>}

      <section id="distance" className="distance" aria-live="polite">
        <h2>Distance</h2>
        {view.kind === "empty" && <p className="empty">{view.message}</p>}
        {view.kind === "error" && <p className="banner banner-warn">{view.message}</p>}
        {view.kind === "single" && (
          <SingleResult
            delta={view.delta}
            reading={view.reading}
            detail={view.detail}
            held={view.held}
            warning={view.warning}
          />
        )}
        {view.kind === "pair" && (
          <PairResult
            nearer={view.nearerLabel}
            austen={view.austen}
            bronte={view.bronte}
            detail={view.detail}
          />
        )}
        {explained && explained.contributions.length > 0 && (
          <div className="explain">
            <div>
              <div className="explain-head">
                <p className="eyebrow">Words that move the distance</p>
                {voices.length > 1 && (
                  <div className="seg" role="group" aria-label="Voice for the word list">
                    {voices.map((voice) => (
                      <button
                        key={voice.id}
                        type="button"
                        aria-pressed={voice.id === (activeVoice?.id ?? "")}
                        onClick={() => setSelectedVoice(voice.id)}
                      >
                        {voice.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="hint">
                Ranked by contribution. Over-used means the draft’s relative frequency is higher than{" "}
                {activeVoice?.label ?? "the reference"}. The bars start in frequency order and settle into this rank.
              </p>
              <RankBars rows={explained.contributions} motionKey={explained.motionKey} />
            </div>
            <SentenceChart reference={explained.lengths} drafts={explained.draftLengths} />
          </div>
        )}
      </section>

      <div className="columns">
        <div className="voice-stack">
          {voices.map((voice) => (
            <TextColumn
              key={voice.id}
              title={voice.label}
              hint={
                language === "de"
                  ? "German uses the function-word list, so ä, ö, ü and ß stay inside the word."
                  : "The reference is the house voice. Two texts are the minimum."
              }
              pieces={voice.texts}
              open={open}
              onToggle={(id) => setOpen((current) => ({ ...current, [id]: !(current[id] ?? voice.texts.find((piece) => piece.id === id)?.text.trim() === "") }))}
              onChange={(id, patch) => updateVoice(voice.id, id, patch)}
              onRemove={(id) =>
                setVoices((current) =>
                  current.map((item) =>
                    item.id === voice.id ? { ...item, texts: item.texts.filter((piece) => piece.id !== id) } : item,
                  ),
                )
              }
              onAdd={() =>
                setVoices((current) =>
                  current.map((item) =>
                    item.id === voice.id ? { ...item, texts: [...item.texts, blank(`Text ${item.texts.length + 1}`)] } : item,
                  ),
                )
              }
            />
          ))}
        </div>
        <TextColumn
          title="Drafts"
          hint="The drafts are measured as one centroid. Each draft counts equally."
          pieces={drafts}
          open={open}
          onToggle={(id) =>
            setOpen((current) => ({
              ...current,
              [id]: !(current[id] ?? drafts.find((piece) => piece.id === id)?.text.trim() === ""),
            }))
          }
          onChange={(id, patch) =>
            setDrafts((current) => current.map((piece) => (piece.id === id ? { ...piece, ...patch } : piece)))
          }
          onRemove={(id) => setDrafts((current) => current.filter((piece) => piece.id !== id))}
          onAdd={() => setDrafts((current) => [...current, blank(`Draft ${current.length + 1}`)])}
        />
      </div>

      <footer className="colophon">
        <p>
          John Burrows, “Delta: a Measure of Stylistic Difference and a Guide to Likely Authorship”,{" "}
          <cite>Literary and Linguistic Computing</cite> 17.3 (2002), 267–287.{" "}
          <a href="https://doi.org/10.1093/llc/17.3.267">doi:10.1093/llc/17.3.267</a>
        </p>
        <p>
          {mode === "authorship"
            ? `Shared z-scale, both novelists together. ${thresholds.sharedAttribution.correct} of ${thresholds.sharedAttribution.total} held-out chapters are nearer their own author.`
            : `Close is at or under ${thresholds.closeMax.toFixed(2)}. Off-voice is at or over ${thresholds.offVoiceMin.toFixed(2)}. Drifting is the open interval between those medians.`}
        </p>
      </footer>
    </main>
  )
}

function SingleResult({
  delta,
  reading,
  detail,
  held,
  warning,
}: {
  delta: number
  reading: Reading
  detail: string
  held: { delta: number; reading: Reading } | null
  warning: string | null
}) {
  return (
    <>
      <p className="num" data-testid="draft-distance">
        {delta.toFixed(2)}
      </p>
      <p className="reading" data-testid="draft-reading">
        {reading}
      </p>
      <p className="detail">{detail}</p>
      {held && (
        <p className="held">
          Held-out reference chunk{" "}
          <strong data-testid="heldout-reading">{held.reading}</strong>
          <span className="held-num">{held.delta.toFixed(2)}</span>
        </p>
      )}
      {warning && <p className="hint warn">{warning}</p>}
    </>
  )
}

function PairResult({
  nearer,
  austen,
  bronte,
  detail,
}: {
  nearer: string
  austen: number
  bronte: number
  detail: string
}) {
  return (
    <>
      <p className="attribution" data-testid="attribution">
        Nearer {nearer}.
      </p>
      <div className="pair">
        <p>
          <span className="pair-num" data-testid="voice-austen" data-delta={austen}>
            {austen.toFixed(2)}
          </span>
          <span>Jane Austen</span>
        </p>
        <p>
          <span className="pair-num" data-testid="voice-bronte" data-delta={bronte}>
            {bronte.toFixed(2)}
          </span>
          <span>Charlotte Brontë</span>
        </p>
      </div>
      <p className="detail">{detail}</p>
    </>
  )
}

type View =
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string }
  | {
      kind: "single"
      delta: number
      reading: Reading
      detail: string
      held: { delta: number; reading: Reading } | null
      warning: string | null
      contributions: DeltaResult["contributions"]
      motionKey: string
      referenceLengths: number[]
      draftLengths: number[]
    }
  | {
      kind: "pair"
      nearerLabel: string
      austen: number
      bronte: number
      detail: string
      byVoice: Record<string, { contributions: DeltaResult["contributions"]; lengths: number[]; motionKey: string }>
      draftLengths: number[]
    }

function buildView(input: {
  voices: Voice[]
  drafts: Piece[]
  heldOut: Piece | null
  n: number
  language: Language
}): View {
  const referenceTexts = input.voices.flatMap((voice) => filled(voice.texts))
  const draftTexts = filled(input.drafts)
  if (referenceTexts.length < 2 || draftTexts.length < 1) {
    return {
      kind: "empty",
      message:
        "Add at least two reference texts and one draft, or load a sample. Delta needs a mean and a sample standard deviation, so one reference text is not enough.",
    }
  }
  try {
    const draftLengths = draftTexts.flatMap((text) => sentenceWordCounts(text, input.language))
    if (input.voices.length > 1) {
      const measured = deltasToVoices(
        input.voices.map((voice) => ({ id: voice.id, texts: filled(voice.texts) })),
        draftTexts,
        input.n,
        input.language,
      )
      const austen = measured.austen
      const bronte = measured.bronte
      if (!austen || !bronte) throw new Error("Both voices need at least two texts.")
      const nearer = austen.delta <= bronte.delta ? "Jane Austen" : "Charlotte Brontë"
      const byVoice: Record<string, { contributions: DeltaResult["contributions"]; lengths: number[]; motionKey: string }> =
        {}
      for (const voice of input.voices) {
        const result = measured[voice.id]
        if (!result) continue
        byVoice[voice.id] = {
          contributions: topContributions(result),
          lengths: filled(voice.texts).flatMap((text) => sentenceWordCounts(text, input.language)),
          motionKey: motionKey(result, input.n),
        }
      }
      return {
        kind: "pair",
        nearerLabel: nearer,
        austen: austen.delta,
        bronte: bronte.delta,
        detail: describe(austen, input.n, input.language),
        byVoice,
        draftLengths,
      }
    }
    const voice = input.voices[0]
    if (!voice) {
      return { kind: "empty", message: "Add a reference voice." }
    }
    const result = deltaBetween(filled(voice.texts), draftTexts, input.n, input.language)
    const reading = readingFor(result.delta, thresholds.closeMax, thresholds.offVoiceMin)
    let held: { delta: number; reading: Reading } | null = null
    if (input.heldOut && input.heldOut.text.trim()) {
      const heldResult = deltaBetween(filled(voice.texts), [input.heldOut.text], input.n, input.language)
      held = {
        delta: heldResult.delta,
        reading: readingFor(heldResult.delta, thresholds.closeMax, thresholds.offVoiceMin),
      }
    }
    const lengths = filled(voice.texts).map((text) => wordCount(text))
    const medianLength = medianNumber(lengths)
    const warning =
      medianLength !== null && medianLength < 400
        ? "These reference texts are under 400 words. On the calibration novels, attribution got worse once chapters were cut that short."
        : null
    return {
      kind: "single",
      delta: result.delta,
      reading,
      detail: describe(result, input.n, input.language),
      held,
      warning,
      contributions: topContributions(result),
      motionKey: motionKey(result, input.n),
      referenceLengths: filled(voice.texts).flatMap((text) => sentenceWordCounts(text, input.language)),
      draftLengths,
    }
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "The distance could not be measured." }
  }
}

function topContributions(result: DeltaResult) {
  return result.contributions.slice(0, 8)
}

function motionKey(result: DeltaResult, n: number): string {
  return `${n}:${result.delta.toFixed(6)}:${result.contributions
    .slice(0, 8)
    .map((item) => item.word)
    .join("|")}`
}

function describe(result: DeltaResult, n: number, language: Language): string {
  const kind = language === "de" ? "most frequent function words" : "most frequent words"
  const dropped =
    result.dropped.length > 0
      ? ` ${result.dropped.length} of the top ${n} had no spread and were left out.`
      : ""
  return `Mean absolute z-score over ${result.features.length} ${kind}.${dropped}`
}

function filled(pieces: Piece[]): string[] {
  return pieces.map((piece) => piece.text.trim()).filter((text) => text.length > 0)
}

function asPiece(item: LoadedText): Piece {
  return { id: item.id || nextId(), title: item.title, text: item.text }
}

function clampN(value: number): number {
  if (!Number.isFinite(value)) return 150
  return Math.min(300, Math.max(20, Math.round(value)))
}

function medianNumber(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? null)
}
