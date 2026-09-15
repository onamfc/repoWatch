# repoWatch

Slack notifications for pull requests across **all** of your GitHub repositories, including ones spread over several organizations. One GitHub App, one Cloudflare Worker, one Slack channel. No polling, no per-repo webhooks, no servers.

Built for the [52-for-52](https://github.com/onamfc/52-for-52) challenge, where 52 open source projects live across three GitHub owners and PRs from contributors were getting lost in the noise.

```
GitHub App (installed on your accounts/orgs)
   │  pull_request webhook, HMAC-signed
   ▼
Cloudflare Worker  ──verify signature──▶ filter (repos, actions, authors, drafts) ──▶ Slack incoming webhook
```

## What you get

A message like this in Slack the moment a PR is opened, reopened, or marked ready for review:

> **New pull request** in [onamfc/gavel](https://github.com/onamfc/gavel)
> [#36 feat: add invite system with payment-gated reward & abuse guards](#)
> 🧑 abhishakenp  ·  `abhishakenp/gavel:feat/invites` → `main`  ·  +412 −18 in 9 files  ·  `enhancement`
> [ View pull request ]  [ Files changed ]

- Works for every repo the App is installed on, including repos you create later.
- Filter by repository (`owner/repo` or `owner/*`), PR action, author, and draft status.
- Verifies GitHub's `X-Hub-Signature-256` in constant time before doing anything.
- Failed Slack posts return a 502 so GitHub records a failed delivery you can inspect and redeliver.
- Runs comfortably inside Cloudflare's free tier.

## Setup

You will create three things: a Slack incoming webhook, the Worker, and a GitHub App. About 15 minutes.

### 1. Slack incoming webhook

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**. Name it `repoWatch`, pick your workspace.
2. Open **Incoming Webhooks**, switch it on, click **Add New Webhook to Workspace**, and choose the channel (for example `#pull-requests`).
3. Copy the webhook URL. It starts with `https://hooks.slack.com/services/`.

### 2. Deploy the Worker

```bash
git clone https://github.com/onamfc/repoWatch.git
cd repoWatch
npm install
npx wrangler login          # opens a browser to authorize Wrangler
npm run deploy              # prints your Worker URL, e.g. https://repowatch.<you>.workers.dev
```

Generate a webhook secret and store both secrets in Cloudflare (they are never written to disk or to this repo):

```bash
openssl rand -hex 32                          # keep this; you will paste it into GitHub in step 3
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put SLACK_WEBHOOK_URL
```

Then edit `WATCHED_REPOS` in `wrangler.jsonc` (see [Configuration](#configuration)) and run `npm run deploy` again.

### 3. GitHub App

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App** (<https://github.com/settings/apps/new>).
2. Fill in:
   - **GitHub App name**: anything globally unique, for example `repowatch-<your-handle>`.
   - **Homepage URL**: this repository's URL is fine.
   - **Webhook**: Active. **Webhook URL**: `https://repowatch.<you>.workers.dev/webhook`. **Webhook secret**: the value from `openssl rand -hex 32`.
   - **Repository permissions**: **Pull requests → Read-only**. (Metadata read is added automatically.)
   - **Subscribe to events**: **Pull request**.
   - **Where can this GitHub App be installed?**: **Any account** if you want to install it on organizations you administer, otherwise **Only on this account**.
3. Click **Create GitHub App**. GitHub sends a `ping` to the Worker; check **Advanced → Recent Deliveries** on the App page for a green 200.
4. In the App's left sidebar click **Install App**, then install it on each account or organization. Choosing **All repositories** is fine: `WATCHED_REPOS` decides what actually reaches Slack, and new repos are covered without touching GitHub again.

Open a pull request on any watched repo and it should appear in Slack within a second or two.

## Configuration

Non-secret settings live in `wrangler.jsonc` under `vars`. Redeploy after changing them.

| Variable | Default | Meaning |
|---|---|---|
| `WATCHED_REPOS` | `[]` (everything) | Array of `owner/repo` or `owner/*`. Case-insensitive. Empty means every repo the App is installed on. |
| `PR_ACTIONS` | `opened,reopened,ready_for_review` | Which `pull_request` actions notify. Add `closed` for merge/close messages, `synchronize` for every push. |
| `NOTIFY_DRAFTS` | `false` | When false, draft PRs are silent until marked ready for review. |
| `IGNORED_AUTHORS` | empty | GitHub logins to ignore, for example `yourname,dependabot[bot]`. |

Secrets are set with `wrangler secret put` and read from `.dev.vars` during local development:

| Secret | Meaning |
|---|---|
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL. |
| `GITHUB_WEBHOOK_SECRET` | The webhook secret entered in the GitHub App. |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/webhook` | GitHub webhook receiver. Handles `ping` and `pull_request`; other events are acknowledged and ignored. |
| `GET` | `/health` | Returns `{"ok":true}` for uptime checks. |

Responses are JSON. A `401` means the signature did not verify, `500` means a secret is missing, and `502` means Slack rejected the message.

## Local development

```bash
cp .dev.vars.example .dev.vars   # then paste real values
npm run dev                      # http://127.0.0.1:8787
```

Send yourself a signed test delivery using the bundled fixture:

```bash
SECRET=$(grep GITHUB_WEBHOOK_SECRET .dev.vars | cut -d= -f2-)
BODY=$(cat test/fixtures/pull_request.opened.json)
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')"
curl -X POST http://127.0.0.1:8787/webhook \
  -H 'content-type: application/json' \
  -H 'x-github-event: pull_request' \
  -H "x-hub-signature-256: $SIG" \
  --data-binary "$BODY"
```

Other useful commands:

```bash
npm test             # unit + integration tests, run inside the Workers runtime
npm run typecheck    # tsc
npm run types        # regenerate worker-configuration.d.ts after editing wrangler.jsonc
npm run tail         # live logs from the deployed Worker
```

## Project layout

```
src/
  index.ts              routing, signature check, event dispatch
  config.ts             env parsing and repo matching
  github/verify.ts      HMAC-SHA256 verification (constant time)
  github/types.ts       the slice of GitHub's payloads we read
  handlers/pullRequest.ts  notify / skip decision
  slack/blocks.ts       Block Kit message builder
  slack/post.ts         incoming-webhook client
test/                   vitest, run in workerd via @cloudflare/vitest-plugin
```

## Roadmap

repoWatch is the first step toward a self-governing collection of repositories. The GitHub App identity created above is the foundation: later stages add write permissions to it, and the Worker grows from a notifier into a coordinator.

1. **Notify** (this release): PR opened → Slack.
2. **More signals**: reviews, review comments, CI status, new issues, stale PR reminders on a cron trigger.
3. **Triage**: an agent summarizes each PR (intent, risk, touched areas) in a Slack thread and applies labels.
4. **Review**: the agent leaves a real review on GitHub. Slack gets a one-line verdict with approve / request-changes buttons for a human.
5. **Gated merge**: auto-merge when CI is green, the agent approved, and a per-repo policy file allows it.
6. **Planning**: the agent files follow-up issues from review findings, keeping each repo's backlog alive.

Stages 3 and later move long-running work onto Cloudflare Queues and Workflows so the webhook handler stays fast, and hold state in D1 or Durable Objects.

## Contributing

Issues and pull requests are welcome. Run `npm test` and `npm run typecheck` before opening a PR.

## License

[MIT](LICENSE)
