# KAMI Mobile docs

| File | Purpose |
|---|---|
| [`DESIGN.md`](./DESIGN.md) | Tech choices, information architecture, visual language, screen wireframes, components, offline model, reader architecture |
| [`SPEC.md`](./SPEC.md) | Requirements with IDs and acceptance criteria, API contract, backend changes (M0), storage, testing, milestones, open decisions |

## Starter prompt for Claude Code

```
Read docs/mobile/DESIGN.md and docs/mobile/SPEC.md in full, then docs/ARCHITECTURE.md and src/lib/api/*.ts.
Start with Milestone M0 (SPEC §4): verify whether Bearer-token auth already works against the
existing API, fix only what is needed, and record outcomes in docs/mobile/NOTES.md. Open that as its
own PR. Then proceed milestone by milestone (SPEC §12), one PR per milestone. Ask me only for the
items listed in SPEC §15.
```
