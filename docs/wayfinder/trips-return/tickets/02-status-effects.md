---
type: grilling
status: closed
assignee: sahil
blocked-by: []
---

# What does a trip status change besides grouping?

## Question

Does status gate or alter anything: should booked require a chosen hotel or a start date; does archived hide the trip's .ics export or map locate; does moving to done warn about empty days? Or is status purely a label that groups the list? Probe edge cases (booked with no hotel, archived with future dates).

## Resolution

Status is a plain label for now. It gates and changes nothing: `booked` needs no chosen hotel or start date, `.ics` export and "Pin places" work the same in every status, and moving to `done` raises no warning about empty days. Its only effect is how the list groups trips. Revisit only if a real need appears.
