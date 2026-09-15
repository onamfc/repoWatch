import type { PullRequestEvent } from "../github/types";

/** A Slack incoming-webhook payload. https://api.slack.com/messaging/webhooks */
export interface SlackMessage {
  /** Plain-text fallback used for push notifications and clients without Block Kit. */
  text: string;
  blocks: SlackBlock[];
  unfurl_links: false;
  unfurl_media: false;
}

export type SlackBlock =
  | { type: "section"; text: { type: "mrkdwn"; text: string } }
  | { type: "context"; elements: ({ type: "mrkdwn"; text: string } | { type: "image"; image_url: string; alt_text: string })[] }
  | { type: "actions"; elements: { type: "button"; text: { type: "plain_text"; text: string; emoji?: boolean }; url: string; style?: "primary" }[] };

/** Escapes the three characters Slack mrkdwn treats specially. */
export function escapeMrkdwn(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function headlineFor(action: string, merged: boolean): string {
  switch (action) {
    case "opened":
      return "New pull request";
    case "reopened":
      return "Pull request reopened";
    case "ready_for_review":
      return "Pull request ready for review";
    case "synchronize":
      return "Pull request updated";
    case "closed":
      return merged ? "Pull request merged" : "Pull request closed";
    default:
      return `Pull request ${action.replace(/_/g, " ")}`;
  }
}

function truncate(input: string, max: number): string {
  return input.length <= max ? input : `${input.slice(0, max - 1)}…`;
}

export function buildPullRequestMessage(event: PullRequestEvent): SlackMessage {
  const { pull_request: pr, repository: repo, action } = event;
  const headline = headlineFor(action, pr.merged === true);
  const title = escapeMrkdwn(truncate(pr.title.trim(), 200));
  const repoLink = `<${repo.html_url}|${escapeMrkdwn(repo.full_name)}>`;
  const prLink = `<${pr.html_url}|#${pr.number} ${title}>`;

  const meta: string[] = [`<${pr.user.html_url}|${escapeMrkdwn(pr.user.login)}>`];
  const headRepo = pr.head.repo?.full_name;
  const isFork = headRepo !== undefined && headRepo !== null && headRepo.toLowerCase() !== repo.full_name.toLowerCase();
  const headLabel = isFork ? `${headRepo}:${pr.head.ref}` : pr.head.ref;
  meta.push(`\`${escapeMrkdwn(headLabel)}\` → \`${escapeMrkdwn(pr.base.ref)}\``);
  if (typeof pr.additions === "number" && typeof pr.deletions === "number") {
    const files = typeof pr.changed_files === "number" ? ` in ${pr.changed_files} file${pr.changed_files === 1 ? "" : "s"}` : "";
    meta.push(`+${pr.additions} −${pr.deletions}${files}`);
  }
  if (pr.draft) meta.push("*Draft*");
  if (pr.labels.length > 0) meta.push(pr.labels.map((l) => `\`${escapeMrkdwn(l.name)}\``).join(" "));
  if (repo.private) meta.push("🔒 private");

  const blocks: SlackBlock[] = [
    { type: "section", text: { type: "mrkdwn", text: `*${headline}* in ${repoLink}\n${prLink}` } },
    {
      type: "context",
      elements: [
        { type: "image", image_url: pr.user.avatar_url, alt_text: pr.user.login },
        { type: "mrkdwn", text: meta.join("  ·  ") },
      ],
    },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "View pull request", emoji: true }, url: pr.html_url, style: "primary" },
        { type: "button", text: { type: "plain_text", text: "Files changed", emoji: true }, url: `${pr.html_url}/files` },
      ],
    },
  ];

  return {
    text: `${headline} in ${repo.full_name}: #${pr.number} ${pr.title.trim()} by ${pr.user.login} — ${pr.html_url}`,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
}
