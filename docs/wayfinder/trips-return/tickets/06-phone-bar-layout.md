---
type: grilling
status: closed
assignee:
blocked-by: []
---

# Which phone bottom-bar layout carries Trips?

## Question

The phone bar already overflows with 7 tabs. Adding Trips: (a) restructure to a fixed 5-slot bar with Shelves as one sheet-opening tab, (b) keep the scroller with narrower tabs and an edge fade, or (c) something else. Option (a) changes existing navigation beyond Trips; decide whether that belongs in this effort. See the phone tab bar fit ticket.

## Resolution

Decided by the user's delegation ("go with what's best"): option (b), the minimal change.

- Keep the scrolling phone bar. Add Trips as a tab in third position (Home, Library, Trips, Vault, then the four shelves), so it is always visible on first paint.
- Narrow each tab (`min-w` about 3.75rem) and add a right-edge fade so the overflow is visible as scrollable.
- Do not restructure the phone bar into five slots with a Shelves sheet: that rewrites existing navigation beyond Trips and is out of scope. Fixed pages' bottom padding under the bar is checked during the build.
- Correction to the research report: Trips after Library lands in slot 3 on phone, not off-screen; only the later shelf tabs move further right, as they already do.
