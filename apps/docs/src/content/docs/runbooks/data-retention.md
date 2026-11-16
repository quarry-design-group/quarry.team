---
title: "Runbook: Data retention"
description: "The personal data the site collects, where it lives, how long it is kept, and"
sidebar:
  order: 500
---

<!-- GENERATED from docs/runbooks/data-retention.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/runbooks/data-retention.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/runbooks/data-retention.md). Edit there; this page is generated.
:::

The personal data the site collects, where it lives, how long it is kept, and
how it is deleted. The periods are the ones the
[privacy policy](https://quarry.team/policies/privacy) publishes and the
[NFR](/requirements/non-functional-requirements/) (§4) records; this runbook is how
they are kept true. Date-based terms are enforced by a daily scheduled job;
the terms that depend on a person's judgment, or on stores the Worker cannot
reach, are a quarterly procedure.

## What is stored, and for how long

| Store                                                                                   | What it holds                                                                                                                                                                                                                                                         | Retention                                        | Deleted by              |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------- |
| D1 `form_submissions` ([ADR 0014](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/)) | Contact and careers submissions: name, email, organization or role and links (including the Loom intro), message, the network prefix of the request (`ip`: IPv4 /24, IPv6 /48), and an HMAC of its address keyed by `WORKER_FORM_SUBMISSIONS_IP_HASH_KEY` (`ip_hash`) | 36 months after receipt (`created_at`)           | The daily job           |
| D1 `grievance_events`                                                                   | The intake's audit trail: every rejection and outcome with its reason                                                                                                                                                                                                 | Thirteen months (`at`)                           | The daily job           |
| D1 `grievance_throttle`                                                                 | One row per hashed source for the sustained rate limit                                                                                                                                                                                                                | Thirteen months since last update (`updated_at`) | The daily job           |
| Notification copies in `hello@quarry.team` and `careers@quarry.team`                    | The email Resend delivers for each contact or careers submission                                                                                                                                                                                                      | 36 months after receipt                          | The quarterly procedure |
| D1 `grievances` ([ADR 0017](/architecture/0017-stakeholder-grievance-intake/))               | Grievance submissions, accepted and quarantined; `ip_hash` keyed by `WORKER_GRIEVANCE_SIGNING_KEY`, absent on anonymous rows                                                                                                                                          | Three years after the concern is closed          | The quarterly procedure |
| Notion _Stakeholder Grievance Log_                                                      | The working mirror of each grievance and its handling                                                                                                                                                                                                                 | Three years after the concern is closed, with D1 | The quarterly procedure |

A concern is **closed** when its Status in the log is `Closed`, `Withdrawn`,
or `Abuse`. Its three years run from `Date resolved`; a page in one of those
states without that date runs from `Date received`. Closure is recorded only
in the log, so grievance deletion waits for the owner's confirmation.

D1 Time Travel keeps point-in-time history of each database for its window
(30 days on the Workers Paid plan), so a deleted row stays restorable for that
window and is gone after it. Aggregate analytics carry no personal
identifiers and are out of scope.

## The daily job

The Worker's cron trigger (`[triggers]` in `apps/web/wrangler.toml`, 03:17
UTC) runs the `scheduled` handler in `apps/web/src/worker.ts`, which calls
`purgeExpired` (`apps/web/src/lib/retention.ts`): one `DELETE` per table in
the "daily job" rows above, each against its own term. Staging runs the same
job against its own database.

Each run logs one line with the rows deleted per table:

```text
[retention] purged {"form_submissions":0,"grievance_events":2,"grievance_throttle":1}
```

The line is in the Worker's logs (Cloudflare dashboard → Workers → `quarry-web`
→ Logs, or `wrangler tail` from `apps/web/` while a run is due). A failing
statement throws, so the invocation shows as an error there and the next day's
run retries it.

To run the purge by hand — a failed job, or a check — execute the same
statements from `apps/web/`:

```sh
cd apps/web
DB=marketing-site-form-submissions   # staging: marketing-site-form-submissions-staging with --env staging

wrangler d1 execute $DB --remote --command "DELETE FROM form_submissions WHERE created_at < datetime('now','-36 months')"
wrangler d1 execute $DB --remote --command "DELETE FROM grievance_events WHERE at < datetime('now','-13 months')"
wrangler d1 execute $DB --remote --command "DELETE FROM grievance_throttle WHERE updated_at < datetime('now','-13 months')"
```

## The quarterly procedure

**When:** the first week of January, April, July, and October.
**Who:** the grievance owner (the Principal), or the backup when the owner is
unavailable; the grievance steps need access to the restricted log.
**Where:** production. Staging holds test data only.

Run the commands from `apps/web/`, authenticated with `wrangler login` or a
`CLOUDFLARE_API_TOKEN` that can edit D1.

```sh
cd apps/web
DB=marketing-site-form-submissions
```

### 1. Confirm the daily job is keeping up

Every count must be 0. A non-zero count means the job has stopped: check the
Worker's logs for `[retention]` errors and run the purge by hand (above).

```sh
wrangler d1 execute $DB --remote --command "SELECT (SELECT count(*) FROM form_submissions WHERE created_at < datetime('now','-36 months')) AS submissions_due, (SELECT count(*) FROM grievance_events WHERE at < datetime('now','-13 months')) AS events_due, (SELECT count(*) FROM grievance_throttle WHERE updated_at < datetime('now','-13 months')) AS throttle_due"
```

### 2. Notification copies (36 months)

Delete the notification emails older than 36 months from the
`hello@quarry.team` and `careers@quarry.team` mailboxes (subjects
`New inquiry:` and `New application:`), including from the mailboxes' trash.

### 3. Grievances (three years after closure)

1. In the _Stakeholder Grievance Log_, filter to Status `Closed`, `Withdrawn`,
   or `Abuse` with `Date resolved` (or, where it is empty, `Date received`) on
   or before today's date three years ago. Note each page's Reference ID.
2. Confirm the rows in D1, then delete them:

   ```sh
   wrangler d1 execute $DB --remote --command "SELECT ref, outcome, received_at FROM grievances WHERE ref IN ('GRV-YYYY-XXXXX', 'GRV-YYYY-XXXXX')"
   wrangler d1 execute $DB --remote --command "DELETE FROM grievances WHERE ref IN ('GRV-YYYY-XXXXX', 'GRV-YYYY-XXXXX')"
   ```

3. Delete the same pages from the log, then from the Notion workspace trash.
4. Rows the log never received (`notion_page_id` is null) are closed by the
   D1 record alone. List those received more than three years ago and delete
   the ones the owner confirms are closed:

   ```sh
   wrangler d1 execute $DB --remote --command "SELECT ref, outcome, received_at FROM grievances WHERE notion_page_id IS NULL AND received_at < datetime('now','-3 years')"
   ```

### 4. Record the run

Add a row to the log below, in a pull request of its own: the date, who ran
it, the step 1 result, and the counts deleted in steps 2 and 3. A quarter with
nothing due is still recorded, with zeros.

## Log

| Date | Run by | Daily job keeping up | Mailbox copies | `grievances` + log pages |
| ---- | ------ | -------------------- | -------------- | ------------------------ |

