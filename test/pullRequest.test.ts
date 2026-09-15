import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { evaluatePullRequest } from "../src/handlers/pullRequest";
import { buildPullRequestMessage, escapeMrkdwn, headlineFor } from "../src/slack/blocks";
import { prEvent } from "./helpers";

const secrets = { SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/x", GITHUB_WEBHOOK_SECRET: "s" };

describe("evaluatePullRequest", () => {
  it("notifies for an opened PR on a watched repo", () => {
    const d = evaluatePullRequest(prEvent(), loadConfig({ ...secrets, WATCHED_REPOS: "onamfc/gavel" }));
    expect(d.notify).toBe(true);
  });

  it("skips actions outside PR_ACTIONS", () => {
    const d = evaluatePullRequest(prEvent({ action: "labeled" }), loadConfig(secrets));
    expect(d).toMatchObject({ notify: false, reason: expect.stringContaining("labeled") });
  });

  it("skips repos outside WATCHED_REPOS", () => {
    const d = evaluatePullRequest(prEvent(), loadConfig({ ...secrets, WATCHED_REPOS: "onamfc/other" }));
    expect(d).toMatchObject({ notify: false, reason: expect.stringContaining("WATCHED_REPOS") });
  });

  it("skips ignored authors regardless of case", () => {
    const d = evaluatePullRequest(prEvent(), loadConfig({ ...secrets, IGNORED_AUTHORS: "ABHISHAKENP" }));
    expect(d).toMatchObject({ notify: false, reason: expect.stringContaining("ignored") });
  });

  it("stays quiet for drafts until they are ready for review", () => {
    const quiet = evaluatePullRequest(prEvent({}, { draft: true }), loadConfig(secrets));
    expect(quiet.notify).toBe(false);
    const ready = evaluatePullRequest(prEvent({ action: "ready_for_review" }, { draft: false }), loadConfig(secrets));
    expect(ready.notify).toBe(true);
    const loud = evaluatePullRequest(prEvent({}, { draft: true }), loadConfig({ ...secrets, NOTIFY_DRAFTS: "true" }));
    expect(loud.notify).toBe(true);
  });
});

describe("buildPullRequestMessage", () => {
  it("produces a fallback text and Block Kit blocks with escaped content", () => {
    const m = buildPullRequestMessage(prEvent());
    expect(m.text).toContain("New pull request in onamfc/gavel: #36");
    expect(m.text).toContain("https://github.com/onamfc/gavel/pull/36");
    expect(m.unfurl_links).toBe(false);

    const [section, context, actions] = m.blocks;
    expect(section).toMatchObject({ type: "section" });
    const sectionText = section?.type === "section" ? section.text.text : "";
    expect(sectionText).toContain("*New pull request* in <https://github.com/onamfc/gavel|onamfc/gavel>");
    expect(sectionText).toContain("reward &amp; abuse guards");

    const contextText = context?.type === "context" ? context.elements.map((e) => ("text" in e ? e.text : "")).join(" ") : "";
    expect(contextText).toContain("<https://github.com/abhishakenp|abhishakenp>");
    expect(contextText).toContain("`abhishakenp/gavel:feat/invites` → `main`");
    expect(contextText).toContain("+412 −18 in 9 files");
    expect(contextText).toContain("`enhancement`");
    expect(contextText).not.toContain("Draft");

    expect(actions?.type === "actions" ? actions.elements.map((b) => b.url) : []).toEqual([
      "https://github.com/onamfc/gavel/pull/36",
      "https://github.com/onamfc/gavel/pull/36/files",
    ]);
  });

  it("omits the fork prefix for same-repo branches and flags drafts", () => {
    const m = buildPullRequestMessage(prEvent({}, { draft: true, head: { ref: "fix/x", repo: { full_name: "onamfc/gavel" } }, labels: [] }));
    const context = m.blocks[1];
    const text = context?.type === "context" ? context.elements.map((e) => ("text" in e ? e.text : "")).join(" ") : "";
    expect(text).toContain("`fix/x` → `main`");
    expect(text).toContain("*Draft*");
  });

  it("chooses headlines by action", () => {
    expect(headlineFor("opened", false)).toBe("New pull request");
    expect(headlineFor("closed", true)).toBe("Pull request merged");
    expect(headlineFor("closed", false)).toBe("Pull request closed");
    expect(headlineFor("review_requested", false)).toBe("Pull request review requested");
  });

  it("escapes mrkdwn control characters", () => {
    expect(escapeMrkdwn("<a> & b")).toBe("&lt;a&gt; &amp; b");
  });
});
