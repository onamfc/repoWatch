import type { PullRequestEvent } from "../src/github/types";
import fixture from "./fixtures/pull_request.opened.json";

/** Deep-clones the opened-PR fixture and applies overrides. */
export function prEvent(overrides: Partial<PullRequestEvent> = {}, pr: Partial<PullRequestEvent["pull_request"]> = {}): PullRequestEvent {
  const base = structuredClone(fixture) as PullRequestEvent;
  return { ...base, ...overrides, pull_request: { ...base.pull_request, ...pr } };
}
