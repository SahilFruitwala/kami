---
type: research
status: closed
assignee:
blocked-by: []
---

# Does the phone bottom tab bar fit a fifth item?

## Question

Read src/components/site-header.tsx (the lg:hidden bar) and find how many tabs the phone bottom bar holds, how Shelves and the others render there, and whether adding Trips breaks width, labels or the safe area. Report concrete findings and a recommended layout.

## Resolution

Research (code read, `src/components/site-header.tsx`):

- The phone bar already scrolls horizontally: 7 tabs (Home, Library, Vault, plus Movies, Series, Books, Wishlist as separate tabs; there is no Shelves tab on phone), each `min-w-[4.25rem]`, 476px against a 375-430px screen. About 5.7 tabs show on a 390px phone.
- Adding Trips makes 8 tabs (544px). The new tab would sit off-screen if placed after Library or last, with no scroll hint.
- Safe-area padding is already handled; the spacer under the bar is only `h-2`, so pages may sit under the fixed bar (worth checking).
- Options: (a) fixed 5-slot bar (Home, Library, Trips, Vault, Shelves) where Shelves opens a sheet of the four shelves, mirroring desktop; (b) minimal: keep the scroller, shrink `min-w` to about 3.75rem, add an edge fade.
- Side finding: PANES order puts Trips after Shelves on desktop, as already decided.

Open question raised: which phone layout. See the phone-bar-layout ticket.
