/**
 * Minimal shapes for the parts of GitHub webhook payloads this project reads.
 * See https://docs.github.com/webhooks/webhook-events-and-payloads#pull_request
 */
export interface GitHubUser {
  login: string;
  html_url: string;
  avatar_url: string;
  type?: string;
}

export interface Repository {
  full_name: string;
  html_url: string;
  private: boolean;
}

export interface PullRequest {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  draft: boolean;
  merged?: boolean;
  user: GitHubUser;
  head: { ref: string; repo: { full_name: string } | null };
  base: { ref: string };
  labels: { name: string }[];
  additions?: number;
  deletions?: number;
  changed_files?: number;
  created_at: string;
}

export interface PullRequestEvent {
  action: string;
  number: number;
  pull_request: PullRequest;
  repository: Repository;
  sender: GitHubUser;
}

export interface PingEvent {
  zen: string;
  hook_id: number;
}
