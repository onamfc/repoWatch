import type { SlackMessage } from "./blocks";

export class SlackError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** Posts a message to a Slack incoming webhook. Throws `SlackError` when Slack rejects it. */
export async function postToSlack(webhookUrl: string, message: SlackMessage): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    // Slack webhook error bodies are a short string such as "invalid_payload".
    const detail = (await res.text()).slice(0, 200);
    throw new SlackError(`Slack webhook responded ${res.status}: ${detail}`, res.status);
  }
}
