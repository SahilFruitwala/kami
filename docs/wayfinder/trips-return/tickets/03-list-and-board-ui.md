---
type: prototype
status: closed
assignee: sahil
blocked-by: [02-status-effects.md]
---

# How do the list grouping and the board's status control look and behave?

## Question

Prototype the grouped trips list (Planning/Booked, Done, 'Show archived' toggle) and the status control on the trip board, on desktop and phone, using the app's existing kami-sheet look. Decide control type (segmented, menu), where it sits in TripDetails, and the empty/each-group states.

## Resolution

Winner: variant B, refined. Prototype: `src/components/trips/prototype-trip-status.tsx` (variants A, B, C; `?variant=` on `/trips`). Not yet committed to a throwaway branch.

The list (`/trips`):

- One toolbar row: tabs **Planning, Booked, Done** (each with a count), a quiet **Archived N** text link, and a primary **+ New trip** button on the right. Planning is the default tab, since that is where the work is.
- **+ New trip** opens an inline form above the list (destination required, optional start date, days). Creating a trip makes it `planning`, switches to the Planning tab and opens the new trip's board. The old left sidebar form goes away.
- Cards keep the current content (title, destination, dates, hotel, plan count) plus a small status menu at the bottom to change status without opening the trip. On the Archived tab the menu is replaced by **Unarchive** (back to `planning`) and **Delete**.
- Each tab has its own empty-state line.
- Phone: tabs share the full width in an equal grid; the Archived link and New trip button wrap onto the next row.

The board: a **Status** control beside the destination in the trip header (a menu with all four statuses), plus the existing board unchanged. The AI chat placement is the agent chat UI ticket.

Rules from earlier tickets apply: unarchiving into a full active group is refused with a message; caps are 50 active and 200 archived.
