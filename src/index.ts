import { ConfigError, loadConfig } from "./config";
import type { PingEvent, PullRequestEvent } from "./github/types";
import { verifySignature } from "./github/verify";
import { evaluatePullRequest } from "./handlers/pullRequest";
import { log } from "./log";
import { postToSlack } from "./slack/post";

/** GitHub PR payloads are tens of kilobytes; anything near this is not a webhook we want. */
const MAX_BODY_BYTES = 1_000_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const delivery = request.headers.get("x-github-delivery") ?? "unknown";
  const eventName = request.headers.get("x-github-event") ?? "unknown";

  let config;
  try {
    config = loadConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) {
      log.error("configuration error", { delivery, error: err.message });
      return json({ error: err.message }, 500);
    }
    throw err;
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);

  // The signature covers the raw bytes, so read the body before parsing it.
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);

  const valid = await verifySignature(config.githubWebhookSecret, body, request.headers.get("x-hub-signature-256"));
  if (!valid) {
    log.warn("rejected webhook with bad signature", { delivery, event: eventName });
    return json({ error: "invalid signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return json({ error: "body is not JSON" }, 400);
  }

  switch (eventName) {
    case "ping": {
      const ping = payload as PingEvent;
      log.info("ping received", { delivery, hook_id: ping.hook_id });
      return json({ ok: true, zen: ping.zen });
    }
    case "pull_request": {
      const event = payload as PullRequestEvent;
      const decision = evaluatePullRequest(event, config);
      const context = { delivery, repo: event.repository.full_name, number: event.number, action: event.action };
      if (!decision.notify) {
        log.info("skipped pull_request", { ...context, reason: decision.reason });
        return json({ ok: true, notified: false, reason: decision.reason });
      }
      // Await the Slack call so a failure surfaces as a failed delivery in GitHub,
      // where it can be inspected and redelivered from the App's settings page.
      try {
        await postToSlack(config.slackWebhookUrl, decision.message);
      } catch (err) {
        log.error("slack post failed", { ...context, error: err instanceof Error ? err.message : String(err) });
        return json({ error: "failed to post to Slack" }, 502);
      }
      log.info("notified slack", context);
      return json({ ok: true, notified: true });
    }
    default:
      log.info("ignored event", { delivery, event: eventName });
      return json({ ok: true, ignored: eventName });
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({ ok: true, service: "repowatch" });
    }
    if (request.method === "POST" && url.pathname === "/webhook") {
      return handleWebhook(request, env);
    }
    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
