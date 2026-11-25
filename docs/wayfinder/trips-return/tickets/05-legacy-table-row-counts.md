---
type: task
status: closed
assignee:
blocked-by: []
---

# Check the legacy trip tables in the live database before dropping them

## Question

Count rows in trip_messages and trip_snapshots on the production database (and local) so migration 0022 is dropped with eyes open. Needs database access, so hand the human the exact queries. Record counts and whether anything unexpected is in them.

## Resolution

Superseded: the legacy tables are no longer being dropped (the AI trip planner returns and uses them). No action.
