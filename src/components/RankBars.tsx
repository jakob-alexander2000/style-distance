import { useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Contribution } from "../lib/delta"

const ROW = 36

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
  useLayoutEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = () => setReduce(query.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])
  return reduce
}

export function RankBars({ rows, motionKey }: { rows: Contribution[]; motionKey: string }) {
  const reduce = useReducedMotion()
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])
  const barRefs = useRef<(HTMLSpanElement | null)[]>([])
  const startAt = useMemo(() => {
    const ranked = [...rows].sort((a, b) => a.mfwIndex - b.mfwIndex || (a.word < b.word ? -1 : 1))
    return new Map(ranked.map((row, index) => [row.word, index]))
  }, [rows])

  useLayoutEffect(() => {
    const apply = (t: number) => {
      rows.forEach((row, index) => {
        const el = rowRefs.current[index]
        const bar = barRefs.current[index]
        if (!el) return
        const from = startAt.get(row.word) ?? index
        const y = (from + (index - from) * t) * ROW
        el.style.transform = `translate3d(0, ${y}px, 0)`
        if (bar) bar.style.transform = `scaleX(${t})`
      })
    }
    if (reduce) {
      apply(1)
      return
    }
    let frame = 0
    const started = performance.now()
    const duration = 720
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration)
      const eased = 1 - (1 - t) ** 3
      apply(eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    apply(0)
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [motionKey, reduce, rows, startAt])

  const max = rows[0]?.absZ || 1
  return (
    <ol className="ranks" style={{ height: rows.length * ROW }}>
      {rows.map((row, index) => (
        <li
          key={row.word}
          className="rank"
          data-rank={index}
          ref={(el) => {
            rowRefs.current[index] = el
          }}
          style={{ height: ROW }}
        >
          <span className="rank-word">{row.word}</span>
          <span className="rank-track" aria-hidden="true">
            <span
              className="rank-bar"
              ref={(el) => {
                barRefs.current[index] = el
              }}
              style={{ width: `${Math.max(4, (row.absZ / max) * 100)}%` }}
            />
          </span>
          <span className="rank-dir">
            {row.direction === "over" ? "over-used" : row.direction === "under" ? "under-used" : "even"}
          </span>
        </li>
      ))}
    </ol>
  )
}
