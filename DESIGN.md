# Design

Style Distance is a measuring instrument. The page should look like one: a warm paper ground, a single accent, and type that can carry a number.

Dieter Rams: as little design as possible. Swiss typography: a grid, a clear hierarchy, one job per element. Motion is reserved for the moment the word list settles into rank order, which is the explanation of the number.

## Colour

All pairs below are measured against the surface they sit on. Every one is at least 4.5:1.

| Token | Value | Use | Contrast |
| --- | --- | --- | --- |
| `--bg` | `#f3f0e8` | Page | — |
| `--surface` | `#fbfaf6` | Fields, banners | — |
| `--ink` | `#1a1916` | Text, reference bars | 15.44 on `--bg`, 16.83 on `--surface` |
| `--muted` | `#5c564e` | Labels, secondary text | 6.37 on `--bg`, 6.94 on `--surface` |
| `--line` | `#e0d9ce` | Rules, field borders | decorative, not text |
| `--accent` | `#8d3418` | The distance, draft bars, the rule under the title | 6.99 on `--bg`, 7.63 on `--surface` |

`--accent` is the only chromatic colour. Close, drifting, and off-voice are told in words, not in a traffic-light palette. Selected text is `--surface` on `--accent` (7.63:1).

## Type

Inter, variable, self-hosted, `font-display: swap`, with an Arial fallback whose metrics are adjusted so the swap does not jump. Weights in use are 400 (text), 500 (labels), and 600 (the title and the number).

| Role | Size | Tracking |
| --- | --- | --- |
| Eyebrow | 0.6875rem, uppercase | 0.14em |
| Title | 2.5rem, down to 2rem on a narrow screen | −0.03em |
| Lede | 1.125rem | 0 |
| Distance | 4.5rem, 3.25rem on a narrow screen | −0.04em |
| Reading | 1.5rem | −0.02em |
| Body | 1rem / 1.5 | 0 |

Numbers are tabular.

## Space

An 8px module: 4, 8, 12, 16, 24, 32, 48, 64. The page is at most 72rem wide. Below 800px the two columns stack and the toolbar wraps. Inputs and buttons are at least 44px tall, and form text is 16px so a phone does not zoom the field.

## Motion

The contributor bars are the only motion. They are drawn in most-frequent-word order and move to contribution order over 720ms with a cubic ease-out (`1 - (1 - t)³`). The animation writes `transform` only, from one `requestAnimationFrame` loop, so it can hold 60 frames per second. `prefers-reduced-motion: reduce` skips the loop and paints the final rank.

## Marks

A 2px accent rule under the title. Reference sentence bars are ink. Draft sentence bars are accent. Nothing else is coloured.
