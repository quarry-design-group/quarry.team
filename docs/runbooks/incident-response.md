# Runbook: Incident response (brief)

A concise path for handling production incidents on `quarry.team`.

## Severity

| Sev       | Meaning                   | Examples                                                                                   |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| **SEV-1** | Site down or data at risk | Site unreachable; form-submission data loss/corruption; suspected breach or exposed secret |
| **SEV-2** | Major function broken     | Contact/careers or grievance forms failing; large SEO regression (redirects broken)        |
| **SEV-3** | Degraded / minor          | Single page broken; slow but up; cosmetic regression                                       |

## Roles

- **Incident lead** — coordinates, decides, owns comms. First responder until handed off.
- **Responders** — investigate and remediate.
- Keep a running timeline (what was seen, what was done, when).

## Flow

1. **Detect & declare.** Note time, symptom, severity. Declare in the team incident channel.
2. **Assess blast radius.** Prerendered pages/assets vs the on-demand form routes and D1 data tier (all on the one Cloudflare Worker) vs infra (Terraform/DNS/WAF). Static delivery and the dynamic form routes can fail independently.
3. **Stabilize.** Prefer the fastest safe mitigation:
   - Bad site build → roll back to the previous Worker version (from `apps/web/`: `wrangler rollback`; `--env staging` for staging). If the build came through the deploy workflow, its post-deploy smoke has usually done this already and opened an `incident` issue — check the issue first; the rollback target and run link are in it.
   - Failing forms → roll back the Worker; verify Turnstile, secrets, CSP, and the D1 binding. A 503 from `/api/contact` or `/api/careers` with `{"ok":false,"error":"unavailable"}` means `WORKER_TURNSTILE_SECRET` is missing on that Worker or Turnstile's verifier is unreachable; the Worker log says which (`[form-submissions] WORKER_TURNSTILE_SECRET is not set`, or `[form-submissions] turnstile verify ERROR`).
   - Infra/DNS/WAF/redirect issue → revert the infra change and `terraform apply`.
   - Data corruption → roll forward a corrective migration, or restore the database to a point before the incident with D1 Time Travel ([Restoring D1 data](#restoring-d1-data-time-travel), below; treat as SEV-1). Grievance data is sensitive personal data: keep the responder set to the grievance owner/backup where possible. What each table holds and for how long is in [data retention](data-retention.md); grievance records are purged by its quarterly procedure, by hand, because closure is recorded only in the Notion log.
   - Worker and infrastructure rollback: [`deploy.md` → Rollback](deploy.md#rollback).
4. **Verify.** Re-run the post-deploy verification checklist (`deploy.md`).
5. **Communicate.** Update stakeholders on status and ETA; confirm resolution.
6. **Post-incident review.** For SEV-1/SEV-2, write a blameless review: timeline, root cause, what went well, action items (with owners). File follow-ups.

## Restoring D1 data (Time Travel)

Time Travel restores the **whole database** to a point in time: every table in it — `form_submissions` and the grievance tables (`grievances`, `grievance_events`, `grievance_throttle`) alike — returns to that moment, and every write after it is discarded. Before restoring, export anything written after the target time that must survive (`wrangler d1 execute … --remote --command "SELECT …"`), and re-insert it afterwards.

Run from `apps/web/`, which carries the database bindings in `wrangler.toml`. Production is shown; for staging use `marketing-site-form-submissions-staging` and add `--env staging` to each command.

```sh
cd apps/web

# 1. Confirm the restore point: the bookmark for a time just before the incident.
wrangler d1 time-travel info marketing-site-form-submissions --timestamp=2026-09-27T14:05:00Z

# 2. Restore to it (prompts for confirmation, then prints the bookmark to undo the restore).
wrangler d1 time-travel restore marketing-site-form-submissions --timestamp=2026-09-27T14:05:00Z

# 3. Verify.
wrangler d1 execute marketing-site-form-submissions --remote --command "SELECT count(*) FROM form_submissions"
wrangler d1 execute marketing-site-form-submissions --remote --command "SELECT count(*) FROM grievances"
```

The timestamp is RFC 3339 (UTC) or Unix seconds and must fall inside Time Travel's history, which lasts 30 days on the Workers Paid plan. Rows the daily retention job has deleted are recoverable only inside that window ([data retention](data-retention.md) gives each table's term). The restore prints a bookmark for the pre-restore state; record it in the incident timeline, since `wrangler d1 time-travel restore marketing-site-form-submissions --bookmark=<that bookmark>` reverses the restore. The schema restores with the data, including wrangler's `d1_migrations` tracking table, so a migration applied after the restore point is applied again by the next deploy; when that migration caused the incident, ship its corrective migration (`apps/web/migrations/`) before redeploying.

## Security incidents

- Suspected breach or **exposed secret**: treat as SEV-1. **Rotate the affected credential immediately** (provider secret stores / GitHub Actions secrets — never the repo), then assess exposure.
- Report/coordinate per `SECURITY.md`; external disclosures go to **security@quarry.team**.

## Key levers

- **Cloudflare:** Worker versions (`wrangler rollback`), WAF, DNS, cache purge, Web Analytics, Worker logs.
- **Cloudflare D1:** Time Travel point-in-time restore (`wrangler d1 time-travel`), migrations.
- **GitHub Actions:** re-run/redeploy, secret rotation.
- **Terraform:** revert + `apply` to reconcile infrastructure (single Cloudflare provider).
