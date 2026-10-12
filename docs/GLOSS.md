# Gloss — the app's theme

Gloss is the warm-paper, serif, 3D-shelf look from the design spec ("App
UI/UX & Animation Design Spec"). It is the whole app's theme: `<html>`
carries the `gloss` class and the app-wide tokens hold Gloss values. The
older flat "Matrix Quiet" theme is gone.

## How it's built

- **App tokens** (`src/styles.css`): `--color-*`, `--font-*`, shadows and
  motion in `@theme`, dark values under `.dark`, and the shadcn tokens in
  `:root` / `.dark`. Light is paper `#F6F3EA` and ink `#211E17`; dark is the
  lamp-lit "reading room at night". Colour lives in the content (topic
  spines, covers, posters); chrome stays near-monochrome.
- **Gloss tokens and components** (`src/styles/gloss.css`): `--g-*` tokens
  (paper, ink, shelf, motion, elevation) and every `.g-*` class: segmented
  control, chips, search, buttons, shelves, spines, covers, the pull-out
  stage, reader reveal. `.gloss` still works as a nested scope; the pull-out
  stage re-declares it.
- **Fonts** are all self-hosted with Fontsource and bundled into the app:
  Newsreader (display and reading) and Inter (UI), plus the reader choices
  Literata, Source Serif 4, Atkinson Hyperlegible and Figtree. Nothing is
  fetched from Google Fonts; the CSP forbids font CDNs on purpose.
  `@font-face` is lazy, so a reader face downloads only once it is used.

## Conventions

- **Primary fill is ink.** `bg-hanko` is ink; pair it with `text-paper`
  (never `text-white`) so it inverts in the dark. Buttons are pills.
- **Accent red** (`--color-ink-accent`) is only for the drop cap, the
  bookmark ribbon and error icons. Links and secondary actions are muted ink.
- **Page header**: `GlossHeader` (`src/components/gloss/primitives.tsx`) —
  eyebrow with icon, huge serif H1, optional serif one-liner and stats.
  Content sits in a `max-w-[1200px]` column with `px-4 sm:px-8`.
- **Toggles**: `Segmented` / `.g-seg` for views (works with `aria-pressed`,
  `aria-selected` or `aria-current`), `GlossChip` / `.g-chip` for filters.
- **Cards**: `.kami-sheet` (raised paper, 16px radius, 1px line).
- **Small caps meta**: `.kami-label` (Inter 11px / 600, +12% tracking).

## Motion

One rule from the spec: **the object moves, the world fades.** Books, tapes
and discs get 3D transforms and a spring; everything else changes opacity.

- Page changes: the old page fades out (100 ms, ease-in), the new one rises
  12px as it fades in (250 ms, ease-out) — `::view-transition-*` in
  `styles.css`.
- Dialogs fade the page behind to paper instead of a dark scrim.
- Reader: `.g-reader-in` (blur 8px → 0, rise 12px) and `.g-bar-in` for the
  floating bar; loading reads "Bringing it in".
- `.g-stagger` rises a list of cards in with a 30 ms stagger.
- Under `prefers-reduced-motion`, every move collapses to an instant change.

## Pieces

| File | What |
| --- | --- |
| `src/components/gloss/pullout.tsx` | The signature move: spine → turn → fly → swing open; put back in reverse. Generic over faces. |
| `src/components/gloss/shelf.tsx` | Spines on planks, grouped with labels and bookends; tooltip, arrow-key navigation, slide-in ripple. |
| `src/components/gloss/book.tsx` | Library: book spine, cover, endpaper + Ex Libris plate, right page. |
| `src/components/gloss/media.tsx` | Movies (VHS sleeve + cassette) and Series (DVD keepcase + disc). |
| `src/components/gloss/topics.tsx` | Topics grid and topic page. |
| `src/lib/gloss/palette.ts` | Topic colour families, seeded spine variety, VHS/DVD looks. |

Motion follows one rule from the design spec: **the object moves, the world
fades.** Books, tapes and discs get 3D transforms and a spring; the page
behind only dims. Under `prefers-reduced-motion`, every move becomes a
150 ms cross-fade.
