---
type: grilling
status: closed
assignee: sahil
blocked-by: []
---

# Do archived trips count toward the 50-trip limit?

## Question

The service caps a user at 50 trips and tells them to delete an old one. With an archived status, should archived trips still count, be exempt, or have their own cap? Consider the 'Delete an old one first' message and the list query.

## Resolution

Archived trips are exempt from the 50-trip limit (the user's call). The rest was delegated ("go with what's best"):

- Two separate caps: 50 active trips (planning, booked, done) and 200 archived trips. Archived trips cost storage, so they stay bounded.
- Creating a trip is always `planning`, so it checks the active cap. Message: "You can keep up to 50 trips. Archive or delete an old one first."
- Changing status checks the target group's cap when it crosses the boundary: archiving checks 200 ("Delete an old archived trip first."), unarchiving into a full active group is refused ("You already have 50 active trips. Archive or delete one first."). Moving among planning, booked and done never checks a cap.
- Both caps are constants beside `MAX_TRIPS` in `src/server/services/trips.ts`, covered by tests.
