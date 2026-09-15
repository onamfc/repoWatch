# repoWatch

Get a Slack message the moment someone opens a pull request on any of your GitHub repositories, even when those repositories are spread across several accounts and organizations.

One GitHub App, one Cloudflare Worker, one Slack channel. No polling, no per-repo webhooks, no servers to keep running, and it fits inside Cloudflare's free tier.

Built for the [52-for-52](https://github.com/onamfc/52-for-52) challenge, where 52 open source projects live across three GitHub owners and contributor PRs were getting lost.

## How it works

```
GitHub App (installed on your accounts and orgs)
   │  sends a signed "pull_request" webhook
   ▼
Cloudflare Worker
   1. verifies the signature
   2. checks your filters (which repos, which actions, which authors, drafts)
   3. posts a formatted message to Slack
```

The Worker only runs for the few milliseconds it takes to handle each webhook. Nothing runs on your computer after setup.

## What a notification looks like

> **New pull request** in [acme/widgets](https://github.com/acme/widgets)
> [#36 feat: add invite system with payment-gated reward & abuse guards](#)
> 🧑 octocat  ·  `octocat/widgets:feat/invites` → `main`  ·  +412 −18 in 9 files  ·  `enhancement`
> [ View pull request ]  [ Files changed ]

By default you are notified when a PR is **opened**, **reopened**, or **marked ready for review**. Drafts stay quiet until they are ready. All of this is configurable.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free plan is enough)
- A Slack workspace where you can add apps
- Node.js 22 or newer
- Admin access to the GitHub accounts or organizations you want to watch

## Setup

Four steps, about 15 minutes. Run every command from inside the cloned project folder.

### Step 1: Create a Slack incoming webhook

1. Open <https://api.slack.com/apps> and click **Create New App** → **From scratch**. Name it `repoWatch` and pick your workspace.
2. In the left sidebar open **Incoming Webhooks** and switch it **On**.
3. Click **Add New Webhook to Workspace** and choose the channel that should receive notifications (for example `#pull-requests`).
4. Copy the webhook URL. It starts with `https://hooks.slack.com/services/`. You will need it in Step 3.

### Step 2: Deploy the Worker

```bash
git clone https://github.com/onamfc/repoWatch.git
cd repoWatch
npm install
npx wrangler login      # opens a browser so Wrangler can access your Cloudflare account
npm run deploy
```

The last command prints your Worker URL, something like `https://repowatch.<your-subdomain>.workers.dev`. Copy it; you will need it in Step 4.

### Step 3: Add the secrets

Generate a random string to use as the webhook secret. GitHub uses it to sign every delivery, and the Worker uses it to verify them.

```bash
openssl rand -hex 32
```

Keep that output somewhere for a moment; you will paste it into GitHub in Step 4. Now store both secrets in Cloudflare. Each command prompts you to paste a value.

```bash
npx wrangler secret put GITHUB_WEBHOOK_SECRET   # paste the openssl output
npx wrangler secret put SLACK_WEBHOOK_URL       # paste the Slack URL from Step 1
```

Secrets live only in Cloudflare. They are never written to this repository.

### Step 4: Create and install the GitHub App

1. Open <https://github.com/settings/apps/new>. (To create the App under an organization instead, go to the org's **Settings → Developer settings → GitHub Apps → New GitHub App**.)
2. Fill in the form:

   | Field | Value |
   |---|---|
   | **GitHub App name** | Anything globally unique, for example `repowatch-yourname` |
   | **Homepage URL** | This repository's URL is fine |
   | **Webhook → Active** | Checked |
   | **Webhook URL** | Your Worker URL from Step 2 with `/webhook` on the end, e.g. `https://repowatch.<your-subdomain>.workers.dev/webhook` |
   | **Webhook secret** | The `openssl` output from Step 3 |
   | **Repository permissions → Pull requests** | **Read-only** (Metadata is added automatically) |
   | **Subscribe to events** | **Pull request** |
   | **Where can this GitHub App be installed?** | **Any account** if you want to install it on organizations too; otherwise **Only on this account** |

3. Click **Create GitHub App**. GitHub immediately sends a test `ping` to your Worker. On the App's page open **Advanced → Recent Deliveries** and confirm the ping shows a green **200**. If it shows an error, see [Troubleshooting](#troubleshooting).
4. In the App's left sidebar click **Install App** and install it on each account or organization you want to watch. Choose **All repositories** unless you have a reason not to; you can narrow the list in the next section without touching GitHub again.

That's it. Open a pull request on any installed repo and it should appear in Slack within a second or two.

## Choosing which repos to watch

Out of the box, every repository the App is installed on triggers a notification. There are two ways to narrow that down, and they stack.

**On the GitHub side**, install the App on **Only select repositories** instead of **All repositories**. GitHub then never sends events for anything else. You will need to revisit the installation whenever you create a new repo.

**On the Worker side**, set `WATCHED_REPOS`. Each entry is either a full repo name like `acme/widgets` or an owner wildcard like `acme-labs/*` that matches everything under that owner. Matching is case-insensitive. Anything not on the list is acknowledged and dropped.

You can set `WATCHED_REPOS` in one of two places. Pick one; a var and a secret cannot share a name.

**Option A: in `wrangler.jsonc`.** Good if you are running a private fork and don't mind the list being in git.

```jsonc
"vars": {
  // ...
  "WATCHED_REPOS": ["acme/widgets", "acme/api", "acme-labs/*"]
}
```

Run `npm run deploy` after editing.

**Option B: as a secret.** Good if you are working from this public repo and want your list kept out of version control. Put one entry per line in `watched-repos.txt` (already gitignored) and upload it:

```bash
printf 'acme/widgets\nacme/api\nacme-labs/*\n' > watched-repos.txt
npx wrangler secret put WATCHED_REPOS < watched-repos.txt
```

Secrets survive redeploys, so you only run that again when the list changes.

## Configuration

Non-secret settings live in `wrangler.jsonc` under `vars`. Run `npm run deploy` after changing them.

| Variable | Default | What it does |
|---|---|---|
| `PR_ACTIONS` | `opened,reopened,ready_for_review` | Which `pull_request` actions send a message. Add `closed` to hear about merges and closes, or `synchronize` to hear about every push to an open PR. |
| `NOTIFY_DRAFTS` | `false` | When `false`, draft PRs are silent until they are marked ready for review. |
| `IGNORED_AUTHORS` | empty | Comma-separated GitHub logins to ignore, for example `yourname,dependabot[bot]`. |
| `WATCHED_REPOS` | unset (watch everything) | See [Choosing which repos to watch](#choosing-which-repos-to-watch). |

Secrets are set with `npx wrangler secret put <NAME>`:

| Secret | What it is |
|---|---|
| `SLACK_WEBHOOK_URL` | The Slack incoming webhook URL from Step 1. |
| `GITHUB_WEBHOOK_SECRET` | The random string you entered as the GitHub App's webhook secret. |
| `WATCHED_REPOS` | Optional. The repo list, if you chose Option B above. |

## Troubleshooting

Start with **Advanced → Recent Deliveries** on your GitHub App's settings page. Every delivery shows the response the Worker sent, and the **Redeliver** button lets you retry after fixing something. For live logs from the Worker, run `npm run tail`.

| Symptom | Cause | Fix |
|---|---|---|
| Delivery shows **500** with `SLACK_WEBHOOK_URL secret is not set` (or `GITHUB_WEBHOOK_SECRET`) | The Worker is deployed but a secret is missing. | Run the `wrangler secret put` commands from Step 3, then click **Redeliver**. |
| Delivery shows **401** `invalid signature` | The webhook secret in GitHub doesn't match the one in Cloudflare. | Generate a fresh value with `openssl rand -hex 32`, save it in the App's **Webhook secret** field *and* via `npx wrangler secret put GITHUB_WEBHOOK_SECRET`, then redeliver. |
| Delivery shows **502** `failed to post to Slack` | Slack refused the message, usually a wrong or revoked webhook URL. | Re-copy the URL from the Slack app's **Incoming Webhooks** page and run `npx wrangler secret put SLACK_WEBHOOK_URL`. |
| Delivery shows **200** but `"notified": false` | The Worker received the PR and chose not to send it. The `reason` field in the response body says why (not in `WATCHED_REPOS`, ignored author, draft, or an action not in `PR_ACTIONS`). | Adjust the relevant setting. |
| `wrangler secret put WATCHED_REPOS` fails with `Binding name 'WATCHED_REPOS' already in use` | `WATCHED_REPOS` is also defined under `vars` in `wrangler.jsonc`. | Remove it from `wrangler.jsonc`, run `npm run deploy`, then run the secret command again. |
| No delivery appears in GitHub at all | The App isn't installed on that repository, or the event isn't subscribed. | Check **Install App** in the App's sidebar and confirm **Pull request** is ticked under **Subscribe to events**. |
| `npx wrangler login` says the browser can't be opened | Headless or remote machine. | Copy the printed URL into a browser on any device, then paste the resulting code back. |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/webhook` | GitHub webhook receiver. Handles `ping` and `pull_request`; other events return 200 and are ignored. |
| `GET` | `/health` | Returns `{"ok":true,"service":"repowatch"}`. Useful for uptime checks. |

All responses are JSON.

## Local development

```bash
cp .dev.vars.example .dev.vars   # then fill in real values
npm run dev                      # serves the Worker at http://127.0.0.1:8787
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
npm test             # unit and integration tests, run inside the real Workers runtime
npm run typecheck    # TypeScript check
npm run types        # regenerate worker-configuration.d.ts after editing wrangler.jsonc
npm run tail         # stream live logs from the deployed Worker
```

## Project layout

```
src/
  index.ts                 routing, signature check, event dispatch
  config.ts                env parsing and repo matching
  github/verify.ts         HMAC-SHA256 verification (constant time)
  github/types.ts          the slice of GitHub's payloads we read
  handlers/pullRequest.ts  notify / skip decision
  slack/blocks.ts          Block Kit message builder
  slack/post.ts            incoming-webhook client
test/                      vitest, run in workerd via @cloudflare/vitest-plugin
```

## Roadmap

repoWatch is the first step toward a self-governing collection of repositories. The GitHub App you created above is the foundation: later stages add write permissions to it, and the Worker grows from a notifier into a coordinator.

1. **Notify** (this release): PR opened → Slack.
2. **More signals**: reviews, review comments, CI status, new issues, stale PR reminders on a schedule.
3. **Triage**: an agent summarizes each PR (intent, risk, touched areas) in a Slack thread and applies labels.
4. **Review**: the agent leaves a real review on GitHub. Slack gets a one-line verdict with approve / request-changes buttons for a human.
5. **Gated merge**: auto-merge when CI is green, the agent approved, and a per-repo policy file allows it.
6. **Planning**: the agent files follow-up issues from review findings, keeping each repo's backlog alive.

Stages 3 and later move long-running work onto Cloudflare Queues and Workflows so the webhook handler stays fast, and hold state in D1 or Durable Objects.

## Contributing

Issues and pull requests are welcome. Run `npm test` and `npm run typecheck` before opening a PR.

## License

[MIT](LICENSE)
