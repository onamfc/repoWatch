import { describe, expect, it } from "vitest";
import { ConfigError, isWatched, loadConfig, toList } from "../src/config";

const secrets = { SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/x", GITHUB_WEBHOOK_SECRET: "s" };

describe("toList", () => {
  it("splits strings on commas and newlines, trims, lower-cases, and drops blanks", () => {
    expect(toList(" A/b, c/D \n\n e/f ,")).toEqual(["a/b", "c/d", "e/f"]);
  });
  it("accepts arrays and ignores non-strings", () => {
    expect(toList(["X/y", 3, null, ""])).toEqual(["x/y"]);
    expect(toList(undefined)).toEqual([]);
  });
});

describe("loadConfig", () => {
  it("throws a ConfigError when a secret is missing", () => {
    expect(() => loadConfig({ SLACK_WEBHOOK_URL: "x" })).toThrow(ConfigError);
    expect(() => loadConfig({ GITHUB_WEBHOOK_SECRET: "x" })).toThrow(/SLACK_WEBHOOK_URL/);
  });

  it("applies defaults", () => {
    const c = loadConfig(secrets);
    expect([...c.prActions]).toEqual(["opened", "reopened", "ready_for_review"]);
    expect(c.notifyDrafts).toBe(false);
    expect(c.ignoredAuthors.size).toBe(0);
    expect(c.watchedRepos).toEqual([]);
  });

  it("reads overrides", () => {
    const c = loadConfig({ ...secrets, PR_ACTIONS: "opened, closed", NOTIFY_DRAFTS: "true", IGNORED_AUTHORS: "Acme-Dev,dependabot[bot]", WATCHED_REPOS: ["A/b"] });
    expect([...c.prActions]).toEqual(["opened", "closed"]);
    expect(c.notifyDrafts).toBe(true);
    expect(c.ignoredAuthors.has("acme-dev")).toBe(true);
    expect(c.ignoredAuthors.has("dependabot[bot]")).toBe(true);
    expect(c.watchedRepos).toEqual(["a/b"]);
  });
});

describe("isWatched", () => {
  it("watches everything when the list is empty", () => {
    expect(isWatched("any/repo", [])).toBe(true);
  });
  it("matches exact names case-insensitively", () => {
    expect(isWatched("Acme/Widgets", ["acme/widgets"])).toBe(true);
    expect(isWatched("Acme/other", ["acme/widgets"])).toBe(false);
  });
  it("supports owner wildcards", () => {
    expect(isWatched("acme-labs/anything", ["acme-labs/*"])).toBe(true);
    expect(isWatched("other/anything", ["acme-labs/*"])).toBe(false);
  });
});
