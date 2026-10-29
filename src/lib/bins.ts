export const SENTENCE_BINS = [
  { label: "1–5", min: 1, max: 5 },
  { label: "6–10", min: 6, max: 10 },
  { label: "11–15", min: 11, max: 15 },
  { label: "16–20", min: 16, max: 20 },
  { label: "21–30", min: 21, max: 30 },
  { label: "31–40", min: 31, max: 40 },
  { label: "41+", min: 41, max: Number.POSITIVE_INFINITY },
] as const

export function binCounts(lengths: number[]): number[] {
  return SENTENCE_BINS.map(
    (bin) => lengths.filter((length) => length >= bin.min && length <= bin.max).length,
  )
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  return sorted[mid] ?? null
}
