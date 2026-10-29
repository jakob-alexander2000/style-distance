import { SENTENCE_BINS, binCounts, median } from "../lib/bins"

export function SentenceChart({
  reference,
  drafts,
}: {
  reference: number[]
  drafts: number[]
}) {
  const referenceBins = binCounts(reference)
  const draftBins = binCounts(drafts)
  const max = Math.max(1, ...referenceBins, ...draftBins)
  const referenceMedian = median(reference)
  const draftMedian = median(drafts)
  const label =
    referenceMedian !== null && draftMedian !== null
      ? `Sentence length. Reference median ${formatMedian(referenceMedian)} words, drafts ${formatMedian(draftMedian)} words.`
      : "Sentence length."

  return (
    <figure className="chart" aria-label={label}>
      <figcaption>
        <span className="eyebrow">Sentence length</span>
        <span className="chart-medians">
          {referenceMedian !== null && draftMedian !== null
            ? `Median ${formatMedian(referenceMedian)} words in the reference, ${formatMedian(draftMedian)} in the drafts.`
            : "Not enough sentences yet."}
        </span>
      </figcaption>
      <div className="chart-legend">
        <span>
          <i className="swatch swatch-ref" /> Reference
        </span>
        <span>
          <i className="swatch swatch-draft" /> Drafts
        </span>
      </div>
      <div className="chart-rows">
        {SENTENCE_BINS.map((bin, index) => (
          <div className="chart-row" key={bin.label}>
            <span className="chart-label">{bin.label}</span>
            <span className="chart-pair">
              <span
                className="chart-bar chart-bar-ref"
                style={{ width: `${((referenceBins[index] ?? 0) / max) * 100}%` }}
              />
              <span
                className="chart-bar chart-bar-draft"
                style={{ width: `${((draftBins[index] ?? 0) / max) * 100}%` }}
              />
            </span>
          </div>
        ))}
      </div>
    </figure>
  )
}

function formatMedian(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
