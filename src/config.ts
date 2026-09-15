export interface Config {
  slackWebhookUrl: string;
  githubWebhookSecret: string;
  /** pull_request actions that produce a notification. */
  prActions: ReadonlySet<string>;
  /** When false, draft PRs stay silent until they are marked ready for review. */
  notifyDrafts: boolean;
  /** Lower-cased GitHub logins whose PRs never notify. */
  ignoredAuthors: ReadonlySet<string>;
  /** Lower-cased "owner/repo" or "owner/*" patterns. Empty means watch everything. */
  watchedRepos: readonly string[];
}

const DEFAULT_ACTIONS = ["opened", "reopened", "ready_for_review"];

/** Accepts a comma/newline separated string or a JSON array and returns trimmed, lower-cased entries. */
export function toList(value: unknown): string[] {
  const raw: unknown[] = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [];
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

export class ConfigError extends Error {}

/** The subset of `Env` that configuration is read from. `Env` is assignable to it. */
export interface RawConfigEnv {
  SLACK_WEBHOOK_URL?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  PR_ACTIONS?: unknown;
  NOTIFY_DRAFTS?: unknown;
  IGNORED_AUTHORS?: unknown;
  WATCHED_REPOS?: unknown;
}

export function loadConfig(env: RawConfigEnv): Config {
  if (!env.SLACK_WEBHOOK_URL) throw new ConfigError("SLACK_WEBHOOK_URL secret is not set");
  if (!env.GITHUB_WEBHOOK_SECRET) throw new ConfigError("GITHUB_WEBHOOK_SECRET secret is not set");

  const actions = toList(env.PR_ACTIONS);
  return {
    slackWebhookUrl: env.SLACK_WEBHOOK_URL,
    githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET,
    prActions: new Set(actions.length > 0 ? actions : DEFAULT_ACTIONS),
    notifyDrafts: toBool(env.NOTIFY_DRAFTS, false),
    ignoredAuthors: new Set(toList(env.IGNORED_AUTHORS)),
    watchedRepos: toList(env.WATCHED_REPOS),
  };
}

/** True when `fullName` ("owner/repo") matches the watch list, or the list is empty. */
export function isWatched(fullName: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return true;
  const name = fullName.toLowerCase();
  const owner = name.split("/")[0] ?? "";
  return patterns.some((p) => p === name || (p.endsWith("/*") && p.slice(0, -2) === owner));
}
