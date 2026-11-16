---
title: "Runbook: Bootstrap (from-zero rebuild)"
description: "How to stand up the entire quarry.team stack from nothing — a fresh Cloudflare"
sidebar:
  order: 1
---

<!-- GENERATED from docs/runbooks/bootstrap.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/runbooks/bootstrap.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/runbooks/bootstrap.md). Edit there; this page is generated.
:::

How to stand up the entire `quarry.team` stack from nothing — a fresh Cloudflare
account and a fresh GitHub repository — to a verified production cutover. Each step links to the document that owns its detail;
this runbook is the ordered recipe.

Related: [`infra/README.md`](https://github.com/quarry-design-group/quarry.team/blob/main/infra/README.md) (Terraform, token scopes,
CI secrets) · [deploy runbook](/runbooks/deploy/) (pipeline, environments, rollback) ·
[ADR 0013](/architecture/0013-pre-cutover-staging-and-pr-previews/) (staging-first
cutover model).

## 0. Prerequisites

- A **Cloudflare account** containing the `quarry.team` zone (the zone must
  already exist — Terraform looks it up by name, it does not create it).
- A **GitHub repository** with the default branch protected and GitHub Actions
  enabled. Mark the CI status checks required for merge — matching the job names
  in `.github/workflows/ci.yml`: **Lint · Typecheck · Build · Test**,
  **E2E (Playwright)**, and **Lighthouse CI (CWV budgets)** — the last two are
  gate jobs that pass only when every one of their shards passed; never mark the
  shard jobs (**E2E · shard i/n**, **Lighthouse CI · shard i/n**) required, or a
  change of shard count breaks protection
  ([ADR 0009, amendment](/architecture/0009-ci-cd-github-actions/#amendment-2026-11-14-e2e-and-lighthouse-run-sharded-against-one-build)) — plus the two
  PR-triggered security jobs from `.github/workflows/security.yml`:
  **Dependency audit (pnpm)** and **Secret scan (TruffleHog)** — and
  **Terraform plan** from `.github/workflows/infra.yml`. (Protection without
  required checks lets merges through with nothing gating them.) **Terraform
  plan** runs on every PR and decides in its first step whether to plan, so it
  always reports: a site-only PR passes it in seconds, and a Dependabot PR
  whose plan is not empty fails it, which is what holds an auto-merged provider
  bump ([ADR 0018](/architecture/0018-dependency-update-policy/), amendment). Add
  it only once the Dependabot secrets (below) exist, or every Dependabot infra
  PR fails it. **Analyze (JS/TS)** (CodeQL) deliberately stays advisory: it is gated at the _job_ level
  (`if: vars.ENABLE_CODEQL == 'true'`), so it does report, as
  `completed / skipped`, and a skipped required check passes. Requiring it would
  deadlock nothing — it would gate nothing, which is worse: the branch would look
  protected while `ENABLE_CODEQL` is unset and no analysis runs.
- **Node** and **pnpm** per the root `package.json` `engines` field
  (Node `>= 22.23.4`, pnpm `>= 9`; the pinned version in `packageManager` is
  installed via `corepack enable`).
- **wrangler** (run via `pnpm dlx wrangler` or installed globally) authenticated
  against the Cloudflare account for the one-time bucket/secret commands below.
- **Terraform** `>= 1.10.0` with the `cloudflare/cloudflare` provider `~> 5.0`
  (CI installs its own; only needed locally for ad-hoc plans). The `>= 1.10`
  floor matches `infra/versions.tf` — it is required for the native S3-backend
  lockfile locking (`use_lockfile`, `infra/backend.tf`) that the R2 state bucket
  relies on; 1.6–1.9 reject the argument and fail `terraform init`. See
  [`infra/README.md`](https://github.com/quarry-design-group/quarry.team/blob/main/infra/README.md).

## 1. Create the repository secrets

In GitHub → Settings → Secrets and variables → Actions, create the **secrets**:

- `CLOUDFLARE_API_TOKEN` — scoped exactly as listed in the
  [bootstrap section of `infra/README.md`](https://github.com/quarry-design-group/quarry.team/blob/main/infra/README.md#bootstrap-one-time-before-the-first-init):
  - **Zone (quarry.team only):** Zone Read, DNS Write, Workers Routes Write,
    Zone WAF Write, Access: Apps and Policies Write (staging
    ZTNA), Dynamic URL Redirects Write (www→apex canonical-host rule), Transform
    Rules Write, Zone Settings Write.
  - **Account:** Workers Scripts Write, D1 Write, Workers R2 Storage Write,
    Turnstile Sites Write, Access: Apps and Policies Write — the staging
    ZTNA's application is zone-scoped but its reusable
    policy is created at the account, so that one permission is granted at both
    scopes.
- `CLOUDFLARE_ACCOUNT_ID` — the account id (also used to build the R2 state
  endpoint).
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — an R2 S3 API token (Object
  Read & Write) for the Terraform state backend.
- `PUBLIC_TURNSTILE_SITE_KEY` — the Turnstile widget site key, baked into the
  form markup at build time (available from `terraform output turnstile_sitekey`
  after step 3; set it before the first site deploy).
- `PUBLIC_TURNSTILE_GRIEVANCES_SITE_KEY` — the invisible widget's site key for
  the grievance form (`terraform output turnstile_grievances_sitekey`;
  [ADR 0017](/architecture/0017-stakeholder-grievance-intake/)).
- `DEPENDABOT_NUDGE_TOKEN` — a fine-grained personal access token of the
  `quarry-ci-cd` machine account (credentials in Passbolt), used by the
  Dependabot auto-merge workflow to post `@dependabot rebase`
  ([ADR 0018](/architecture/0018-dependency-update-policy/)). Mint it signed in as
  that account: resource owner `quarry-design-group`, **only** this repository,
  permission **Pull requests: Read and write** (Metadata read-only is implied),
  the maximum expiry. An organization owner approves the token request. Record
  the token and its expiry date in Passbolt next to the account; the daily
  **Machine token expiry** workflow opens a `maintenance` issue 30 days before
  expiry.
- `TERRAFORM_GITHUB_APP_PEM` — the private key of the **Terraform GitHub
  App**, which Terraform's GitHub provider authenticates as to manage the
  Turnstile secrets in the `staging` and `production` environments
  (`infra/github.tf`; plans and the drift check read their metadata, applies
  write them; step 5). Create the App under the `quarry-design-group`
  organization (Settings → Developer settings → GitHub Apps): no webhook,
  repository permission **Environments: Read and write** (Metadata read-only is
  implied), installable only on this account. Install it on **only this
  repository**, generate a private key, and store the PEM contents as this
  secret and in Passbolt. Each run mints an installation token that lasts an
  hour; the key has no expiry.

Create the repository **variables** `TERRAFORM_GITHUB_APP_ID` (the App's id,
on its settings page) and `TERRAFORM_GITHUB_APP_INSTALLATION_ID` (the number at
the end of the installation's settings URL); neither is secret.

Then the **Dependabot secrets** (Settings → Secrets and variables →
Dependabot). A run Dependabot triggers sees only these, and the Infra workflow
plans every Dependabot infra PR with them before it may merge
([`infra/README.md`](https://github.com/quarry-design-group/quarry.team/blob/main/infra/README.md#dependabot-secrets)). Use the same
names as the Actions secrets, with **read-only** values:

- `CLOUDFLARE_API_TOKEN` — a **separate** token with the same zone and account
  scope as the one above and the Read counterpart of each permission: Zone
  Read, DNS Read, Workers Routes Read, Zone WAF Read, Access: Apps and Policies
  Read, Dynamic URL Redirects Read, Transform Rules Read, Zone Settings Read;
  Workers Scripts Read, D1 Read, Workers KV Storage Read, Workers R2 Storage
  Read, Turnstile Sites Read, Access: Apps and Policies Read (account).
- `CLOUDFLARE_ACCOUNT_ID` — the account id.
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — a **separate** R2 S3 API token,
  **Object Read only**, for the `quarry-tf-state` bucket only (PR plans take no
  state lock, so they never write).
- `TERRAFORM_GITHUB_APP_PEM`, `TERRAFORM_GITHUB_APP_ID`,
  `TERRAFORM_GITHUB_APP_INSTALLATION_ID` — a second GitHub App, the
  **Terraform Plan** App, created like the Terraform App above but with
  repository permission **Environments: Read-only**, installed on only this
  repository. Store its private key and its two ids; the ids are secrets here
  only because Dependabot runs cannot rely on repository variables. Keep the
  key in Passbolt beside the Terraform App's.

Store the read-only token values in Passbolt too, and rotate them with their
read-write counterparts.

Then create the two deployment **environments** the Worker's runtime secrets
live in (Settings → Environments, or `gh api -X PUT
repos/quarry-design-group/quarry.team/environments/<name>`): `staging`, and
`production` with a deployment branch policy of **selected branches: `main`**,
so nothing but `main` can deploy production.

Create the repository **variable** `ENABLE_CODEQL=true` once code scanning
is available on the repository (a public repository, or GitHub Advanced
Security); it gates the CodeQL job in `.github/workflows/codeql.yml`. Leave it
unset in clones and mirrors without code scanning. The job's skip-when-unset
behavior is why the CodeQL check stays advisory (§0).

Create the labels the workflows apply and query. The post-deploy smoke opens
its issue under `incident`, the machine-token expiry check opens its rotation
issue under `maintenance`, and the Dependabot auto-merge workflow tiers and
holds PRs by label; `gh pr edit --add-label` and `gh issue create --label` fail
on a label that does not exist.

```sh
gh label create maintenance          --color C5DEF5 --description "Repository upkeep — token rotation and the like"
gh label create incident             --color B60205 --description "Production incident — see docs/runbooks/incident-response.md"
gh label create automerge:immediate  --color 0E8A16 --description "Dependabot PR: auto-merge armed on open; required checks still gate"
gh label create automerge:baked      --color FBCA04 --description "Dependabot PR: auto-merge armed after the bake window (ADR-0018)"
gh label create automerge:review     --color D93F0B --description "Dependabot PR: human review required (major or platform minor)"
gh label create hold                 --color B60205 --description "Blocks Dependabot auto-merge at every tier"
```

`bug`, `enhancement` and `documentation` are GitHub's default labels (the issue
templates apply them), and Dependabot creates `dependencies` on its first PR.

The full secrets and variables tables live in
[`infra/README.md` → CI secrets & variables](https://github.com/quarry-design-group/quarry.team/blob/main/infra/README.md#ci-secrets--variables).

## 2. Bootstrap the Terraform state bucket (one-time)

Create the remote-state bucket before the first `terraform init`:

```sh
wrangler r2 bucket create quarry-tf-state
```

Detail (token creation, backend config): [`infra/README.md`](https://github.com/quarry-design-group/quarry.team/blob/main/infra/README.md).

## 3. Provision the infrastructure

Run the **Infra (Terraform)** workflow (`workflow_dispatch`) with `plan`, review
the output, then run it again with `apply`. This creates the config plane: D1
databases (production + staging), the two Turnstile widgets (managed for
contact/careers, invisible for grievances), and the WAF / rate-limit rulesets.
(The Terraform state R2 bucket is
bootstrapped out-of-band, not by this apply — see step 2.) The Worker itself
is deployed by wrangler, not Terraform. The apply also writes both Turnstile
secrets into the `staging` and `production` environments (step 5); applies
run only from `main`.

The same workflow runs a drift check every Monday
(`terraform plan -detailed-exitcode`); on a fresh repository it fails until
the step 1 secrets exist, so expect a red scheduled run in between. GitHub
disables scheduled workflows on forks, so a fork never runs it.

## 4. Copy the Terraform output ids into wrangler.toml

Step 3's **Infra (Terraform)** apply prints every output in its
**"Terraform outputs (post-apply)"** step log. Copy the two non-secret ids from
there into `apps/web/wrangler.toml`:

| Terraform output         | `apps/web/wrangler.toml` field |
| ------------------------ | ------------------------------ |
| `d1_database_id`         | `[[d1_databases]].database_id` |
| `d1_staging_database_id` | `[env.staging]` d1 binding     |

(Reading these with `terraform output -raw <name>` locally works only after you
initialize the R2 state backend — `terraform init` with the backend config in
[`infra/README.md`](https://github.com/quarry-design-group/quarry.team/blob/main/infra/README.md) — because step 3 provisions through
CI, which holds the state; there is no local state to read.)

Also fill the grievance-log identifiers in `[vars]` / `[env.staging.vars]`:
`NOTION_GRIEVANCE_DATA_SOURCE_ID` (each environment's Notion log; see the
internal procedure in the Org Wiki) and the owner/backup Notion user ids.

Commit the change. D1 schema migrations are applied automatically by the deploy
jobs (`wrangler d1 migrations apply` runs before every deploy — see the
[deploy runbook](/runbooks/deploy/)).

## 5. Set the Worker secrets (per environment)

The Worker's runtime secrets live in the `staging` and `production` GitHub
environments, and every Deploy Web run delivers them: the `worker-secrets` map
in `.github/workflows/deploy-web.yml` hands the deploy's secrets step exactly
the `WORKER_*` secrets, by name, and the step writes them to a file that
`wrangler deploy --secrets-file` attaches to the new Worker version. No other
repository or organization secret reaches that step. A Worker secret carries
the same `WORKER_*` name in GitHub, in the map, on the Worker, and in the code
that reads it. A secret the environment does not hold keeps its current value
on the Worker; nothing is deleted.

**Adding a Worker secret:** read it in code as `WORKER_<NAME>`, add one line
`WORKER_<NAME>: ${{ secrets.WORKER_<NAME> }}` to the map, add its row to the
[infra README table](https://github.com/quarry-design-group/quarry.team/blob/main/infra/README.md#worker-runtime-secrets), and set it
in both environments (below). `apps/web/src/lib/worker-secrets-map.test.ts`
fails CI when the code reads a name the map lacks, when a map entry reads a
secret of another name, or when the table and the map disagree.

Both Turnstile secrets are **managed by Terraform** (step 3):
`infra/github.tf` writes `WORKER_TURNSTILE_SECRET` and
`WORKER_TURNSTILE_GRIEVANCES_SECRET` into both environments from the widget
resources, and a rotated widget is rewritten on the next apply. Do not set
either by hand; the drift check flags one edited outside Terraform.

Set the rest once per environment. `gh secret set` prompts for the value, so
it never lands in shell history:

```sh
for env in staging production; do
  gh secret set WORKER_RESEND_API_KEY               --env $env   # submission-notification email
  gh secret set WORKER_FORM_SUBMISSIONS_IP_HASH_KEY --env $env   # any long random string, distinct from WORKER_GRIEVANCE_SIGNING_KEY
  gh secret set WORKER_GRIEVANCE_SIGNING_KEY        --env $env   # REQUIRED — any long random string (HMAC key for the form token + IP hashing); without it a production Worker serves the form as a 503
  gh secret set WORKER_NOTION_TOKEN                 --env $env   # internal-integration token shared with the grievance log
  gh secret set WORKER_GRIEVANCE_NOTIFY_BACKUP_TO   --env $env   # REQUIRED for routing — the backup's OWN inbox (never the shared alias); the only recipient for concerns that involve the owner
done

# Optional, per environment:
#   WORKER_FORM_SUBMISSIONS_NOTIFY_TO    (default hello@quarry.team)
#   WORKER_FORM_SUBMISSIONS_NOTIFY_FROM  (default "Quarry Site <noreply@quarry.team>")
#   WORKER_FORM_SUBMISSIONS_WEBHOOK_URL
#   WORKER_GRIEVANCE_NOTIFY_TO           (default concerns@quarry.team)
```

A changed secret goes live with the next deploy of that environment: a push
to `main`, or a manual Deploy Web run (`target: staging` from any branch,
`staging-and-production` from `main`). Confirm a secret's presence on the
deployed version with `wrangler versions view <id>` (from `apps/web/`, with
`--env staging` for staging; `wrangler deployments list` names the deployed
version).

D1 is bound to the Worker as `DB`; no connection-string secret exists.

## 6. Turn staging on

Set the repository **variable** `STAGING_DEPLOY_ENABLED=true`. From then on:

- every push to the default branch **that touches the site** deploys **staging**
  → `https://staging.quarry.team` (full production parity against the staging
  database; `X-Robots-Tag: noindex` enforced at the edge). What counts as
  "touches the site" is the Deploy Web workflow's `paths` filter — `apps/web/`,
  `packages/ui/`, the lockfile, and the workflow and post-deploy smoke files it
  names; read the `paths` block in `.github/workflows/deploy-web.yml` rather
  than a copy of it;
- a manual run of **Deploy Web** (`target: staging`, the default) deploys the
  branch it runs on to staging, migrations included — the way to exercise a
  branch on `staging.quarry.team` before it merges; production deploys only
  from `main`;
- every PR touching the site gets an **ephemeral preview URL** posted as a PR
  comment (Worker version upload — no traffic promotion). A preview version
  carries the staging Worker's current secrets.

## 7. Bring up the docs site

The Starlight docs site (`apps/docs` → `docs.quarry.team`) deploys on its own
track, independent of the web cutover. Set the repository **variable**
`DOCS_DEPLOY_ENABLED=true`, confirm the `CLOUDFLARE_API_TOKEN` may create the
`docs.quarry.team` custom domain, then run **Deploy Docs**
(`.github/workflows/deploy-docs.yml`, `workflow_dispatch`) — or push a change
under `docs/**`. Detail (mirror generation, PR previews, go-live): the "Docs
site" section of the [deploy runbook](/runbooks/deploy/).

## 8. Soak and verify

Use the staging period to verify the stack end to end before cutover:

- Contact and careers forms submit end to end (Turnstile passes, record lands
  in the staging D1, notification email sends).
- Edge rules behave (rate limiting on `/api/*`). Cache headers on hashed assets
  come from `apps/web/public/_headers`, not from a zone rule — zone cache
  configuration has no effect on Worker responses (ADR-0008) — but verify them
  here all the same.
- Canonical hosts hold: `workers_dev = false` on **both** environments in
  `apps/web/wrangler.toml`, so apex / `www` / `staging` are the only
  production and staging hostnames. PR previews are the one other surface:
  `preview_urls = true` on `[env.staging]` serves each version at a
  hash-prefixed `*.workers.dev` URL, posted in the PR's comment and reachable
  by anyone while the PR is open. A preview serves staging data, is noindexed
  twice over (Cloudflare marks every `workers.dev` preview response
  `X-Robots-Tag: noindex` at its edge, and the Worker entry
  `apps/web/src/worker.ts` sets `noindex, nofollow` on the same hosts, so the
  posture does not rest on the platform header), and sits outside the zone's
  WAF, rate limits and the staging Access policy. Confirm the header on a
  preview: `curl -sI <preview-url> | grep -i x-robots-tag` prints
  `x-robots-tag: noindex`, the edge value.
- Web Analytics: in the Cloudflare dashboard, enable **Web Analytics →
  automatic injection** for the `quarry.team` zone. It is the one
  dashboard-managed setting (see
  [`infra/README.md`](https://github.com/quarry-design-group/quarry.team/blob/main/infra/README.md#what-this-provisions)); the site's
  CSP already allows the injected beacon.
- The full checklists live in the [deploy runbook](/runbooks/deploy/) (pre-deploy and
  post-deploy verification).

## 9. Cutover

Set the repository **variable** `DEPLOY_ENABLED=true` and run the deploy
workflow (or push to the default branch). The production job deploys the same
Worker with the apex/`www` custom-domain routes — DNS attaches to the Worker on
deploy. Verify per the [deploy runbook](/runbooks/deploy/) checklist. Rollback: from
`apps/web/`, `wrangler rollback` (the source `wrangler.toml` carries the Worker
name), or re-point the two DNS records.

