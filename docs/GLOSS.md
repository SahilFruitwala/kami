# Gloss — the shelf theme

Gloss is the warm-paper, serif, 3D-shelf look used by **Library**, **Movies**
and **Series**. The rest of the app still uses the flat "Matrix Quiet" theme.
Gloss is built so it can take over the whole app later with a one-line change.

## How it's scoped

Everything lives under a `.gloss` class (`src/styles/gloss.css`):

- **Gloss tokens**: `--g-paper`, `--g-ink`, `--g-shelf`, motion (`--g-ease-*`,
  `--g-dur-*`), elevation (`--g-shadow-*`), with dark-mode values under
  `.dark .gloss`.
- **Remapped app tokens**: inside `.gloss` the app's own `--color-*`,
  `--font-sans` / `--font-display`, `--radius`, `--background`, `--primary`…
  are redefined. Existing utilities (`text-ink`, `bg-surface`, `font-display`,
  shadcn buttons) automatically render in Gloss inside the scope.
- **Fonts** are self-hosted (Fontsource: Newsreader + Inter). The CSP
  forbids font CDNs on purpose. Browsers only download them on pages that
  use them.

Pages opt in with `<GlossPage>` (`src/components/gloss/primitives.tsx`), which
is just `<div class="gloss">`.

## Switching the whole app to Gloss

1. Add `gloss` to the `<html>` class in `src/routes/__root.tsx`
   (`<html lang="en" className="antialiased gloss">`).
2. Remove the `kami-desk` grid background in `AppShell`, or redefine
   `.gloss .kami-desk` to plain paper.
3. Expect to touch components that hard-code Matrix Quiet values instead of
   tokens: `rounded-[0.25rem]`, `text-white` on filled buttons, and the
   `kami-sheet` border style.

`GlossPage` keeps working after that; the class is just redundant.

> The one prerequisite has already been done: `--font-sans` used to be
> hard-coded in the `@theme inline` block in `src/styles.css`, which baked
> the monospace stack into the `font-sans` utility. It now lives only in the
> main `@theme`, as a variable a scope can override.

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
