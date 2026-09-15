import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signPayload } from "../src/github/verify";
import worker from "../src/index";
import { prEvent } from "./helpers";

const SECRET = "test-webhook-secret";
const SLACK = "https://hooks.slack.com/services/T000/B000/XXXX";
// Pin every setting so results never depend on a developer's local .dev.vars.
const testEnv: Env = {
  ...env,
  SLACK_WEBHOOK_URL: SLACK,
  GITHUB_WEBHOOK_SECRET: SECRET,
  WATCHED_REPOS: "",
  IGNORED_AUTHORS: "",
  NOTIFY_DRAFTS: "false",
  PR_ACTIONS: "opened,reopened,ready_for_review",
};

let slackCalls: { url: string; body: unknown }[];

beforeEach(() => {
  slackCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      slackCalls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return new Response("ok");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function deliver(event: string, payload: unknown, opts: { secret?: string; env?: Env } = {}): Promise<Response> {
  const body = JSON.stringify(payload);
  const request = new Request<unknown, IncomingRequestCfProperties>("https://repowatch.example/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-github-delivery": "00000000-0000-0000-0000-000000000000",
      "x-hub-signature-256": await signPayload(opts.secret ?? SECRET, body),
    },
    body,
  });
  return worker.fetch(request, opts.env ?? testEnv);
}

describe("worker", () => {
  it("answers health checks", async () => {
    const res = await worker.fetch(new Request<unknown, IncomingRequestCfProperties>("https://repowatch.example/health"), testEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("404s unknown routes", async () => {
    const res = await worker.fetch(new Request<unknown, IncomingRequestCfProperties>("https://repowatch.example/nope"), testEnv);
    expect(res.status).toBe(404);
  });

  it("rejects webhooks with a bad signature and never calls Slack", async () => {
    const res = await deliver("pull_request", prEvent(), { secret: "wrong" });
    expect(res.status).toBe(401);
    expect(slackCalls).toHaveLength(0);
  });

  it("acknowledges GitHub's ping", async () => {
    const res = await deliver("ping", { zen: "Keep it logically awesome.", hook_id: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, zen: "Keep it logically awesome." });
  });

  it("posts a watched PR to Slack", async () => {
    const res = await deliver("pull_request", prEvent());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, notified: true });
    expect(slackCalls).toHaveLength(1);
    expect(slackCalls[0]?.url).toBe(SLACK);
    expect(slackCalls[0]?.body).toMatchObject({ text: expect.stringContaining("#36") });
  });

  it("skips PRs on repos outside the watch list", async () => {
    const event = prEvent({ repository: { full_name: "acme/not-watched", html_url: "https://github.com/acme/not-watched", private: true } });
    const res = await deliver("pull_request", event, { env: { ...testEnv, WATCHED_REPOS: "acme/widgets" } });
    expect(await res.json()).toMatchObject({ ok: true, notified: false, reason: "acme/not-watched not in WATCHED_REPOS" });
    expect(slackCalls).toHaveLength(0);
  });

  it("returns 502 when Slack rejects the message so GitHub records a failed delivery", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid_payload", { status: 400 })));
    const res = await deliver("pull_request", prEvent());
    expect(res.status).toBe(502);
  });

  it("ignores other event types", async () => {
    const res = await deliver("issues", { action: "opened" });
    expect(await res.json()).toMatchObject({ ok: true, ignored: "issues" });
  });

  it("reports missing configuration", async () => {
    const res = await deliver("ping", { zen: "x", hook_id: 1 }, { env: { ...testEnv, SLACK_WEBHOOK_URL: "" } });
    expect(res.status).toBe(500);
  });
});
