import type { ClawPayClient } from "./supabase-client.js";

const APPROVE_WORDS = ["yes", "approve", "ok", "confirm", "y"];
const REJECT_WORDS = ["no", "reject", "deny", "cancel", "n"];

/**
 * Parse a user message to see if it's an approval reply.
 * Returns `{ approved: true/false }` or `null` if not a match.
 */
export function parseApprovalReply(
  content: string,
): { approved: boolean } | null {
  const text = content.trim().toLowerCase();

  if (APPROVE_WORDS.includes(text)) return { approved: true };
  if (REJECT_WORDS.includes(text)) return { approved: false };

  return null;
}

/**
 * Resolve a pending approval via the ClawPay API.
 * Returns a human-readable status string.
 */
export async function resolveApproval(
  client: ClawPayClient,
  approved: boolean,
): Promise<string> {
  const result = await client.approve(approved);

  if ("error" in result) {
    return `Error: ${result.error}`;
  }

  if (result.status === "approved") {
    return "Purchase approved — card funded.";
  }

  return "Purchase rejected.";
}
