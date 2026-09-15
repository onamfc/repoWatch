import { isWatched, type Config } from "../config";
import type { PullRequestEvent } from "../github/types";
import { buildPullRequestMessage, type SlackMessage } from "../slack/blocks";

export type Decision = { notify: true; message: SlackMessage } | { notify: false; reason: string };

/** Decides whether a pull_request event should reach Slack and, if so, what to send. */
export function evaluatePullRequest(event: PullRequestEvent, config: Config): Decision {
  const { action, pull_request: pr, repository: repo } = event;

  if (!config.prActions.has(action)) return { notify: false, reason: `action "${action}" not in PR_ACTIONS` };
  if (!isWatched(repo.full_name, config.watchedRepos)) return { notify: false, reason: `${repo.full_name} not in WATCHED_REPOS` };
  if (config.ignoredAuthors.has(pr.user.login.toLowerCase())) return { notify: false, reason: `author ${pr.user.login} is ignored` };
  if (pr.draft && !config.notifyDrafts && action !== "ready_for_review") return { notify: false, reason: "draft PR (NOTIFY_DRAFTS is false)" };

  return { notify: true, message: buildPullRequestMessage(event) };
}
