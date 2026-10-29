import { wordCount } from "../lib/tokenize"
import type { Piece } from "../types"

export function TextColumn({
  title,
  hint,
  pieces,
  open,
  onToggle,
  onChange,
  onRemove,
  onAdd,
}: {
  title: string
  hint: string
  pieces: Piece[]
  open: Record<string, boolean>
  onToggle: (id: string) => void
  onChange: (id: string, patch: Partial<Piece>) => void
  onRemove: (id: string) => void
  onAdd: () => void
}) {
  const words = pieces.reduce((sum, piece) => sum + (piece.text ? wordCount(piece.text) : 0), 0)
  return (
    <section className="column" aria-labelledby={`${title}-heading`}>
      <header className="column-head">
        <h2 id={`${title}-heading`}>{title}</h2>
        <p>
          {pieces.filter((piece) => piece.text.trim()).length} texts · {words.toLocaleString("en")} words
        </p>
        <p className="hint">{hint}</p>
      </header>
      <ul className="pieces">
        {pieces.map((piece, index) => {
          const expanded = open[piece.id] ?? piece.text.trim() === ""
          const count = piece.text ? wordCount(piece.text) : 0
          return (
            <li key={piece.id} className="piece">
              <div className="piece-bar">
                <button type="button" className="piece-toggle" aria-expanded={expanded} onClick={() => onToggle(piece.id)}>
                  <span>{piece.title || `Text ${index + 1}`}</span>
                  <span className="piece-count">{count.toLocaleString("en")} words</span>
                </button>
                <button type="button" className="text-button" onClick={() => onRemove(piece.id)}>
                  Remove
                </button>
              </div>
              {expanded && (
                <div className="piece-body">
                  <label>
                    Title
                    <input
                      value={piece.title}
                      onChange={(event) => onChange(piece.id, { title: event.target.value })}
                    />
                  </label>
                  <label>
                    Text
                    <textarea
                      value={piece.text}
                      rows={8}
                      onChange={(event) => onChange(piece.id, { text: event.target.value.slice(0, 200_000) })}
                    />
                  </label>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <button type="button" className="add" onClick={onAdd}>
        Add a text
      </button>
    </section>
  )
}
