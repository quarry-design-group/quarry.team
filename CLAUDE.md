# CLAUDE.md

**Read [`AGENTS.md`](AGENTS.md) first — it is the canonical operating guide for
this repo.** Everything below is directional only; the rules themselves live in
`AGENTS.md` (or the guide/runbook it routes to), never here.

`AGENTS.md` covers, in order:

1. **Prime directives** (§1) — the ways of working that are never optional.
2. **Repo map** (§2) — what lives where, and the canonical doc for each area.
3. **The sidecar-maintenance contract** ⭐ (§3) — the when-you-change-X-update-Y
   table, including the Notion artifact registry (§3.1).
4. **The gate** (§4) — the pre-push checks and the PR → CI → maintainer
   smoke test → merge flow.
5. **Generated artifacts** (§5) — the files that are build outputs, and what
   regenerates each.
6. **Conventions** (§6) — commit format, attribution, repo hygiene.
7. **Non-negotiables** (§7) — the product qualities every change must preserve.

Human contributors: see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch/PR
workflow.

> Reminder: the single most-missed step is **§3 — ship the sidecar update in the
> same unit of work as the change.**
