import type { ClawPayClient } from "./supabase-client.js";

/**
 * Parse an incoming message for approval responses.
 * Matches patterns like: "yes", "approve", "no", "reject", "cancel"
 */
export function parseApprovalReply(content: string): {
  approved: boolean;
} | null {
  const match = content.match(
    /^\s*(yes|approve|no|reject|cancel)\s*$/i,
  );
  if (!match) return null;

  const [, response] = match;
  const approved = ["yes", "approve"].includes(response.toLowerCase());
  return { approved };
}

/**
 * Format an approval request message to send to the user.
 */
export function formatApprovalMessage(params: {
  item: string;
  amount: number;
  currency: string;
  merchant: string;
  expiresAt: string;
}): string {
  const expiresDate = new Date(params.expiresAt);
  const minutes = Math.max(
    0,
    Math.round((expiresDate.getTime() - Date.now()) / 60000),
  );

  return [
    `🔔 **ClawPay Approval Request**`,
    ``,
    `Item: ${params.item}`,
    `Amount: $${params.amount} ${params.currency}`,
    `Merchant: ${params.merchant}`,
    ``,
    `Reply with **yes** or **no**`,
    ``,
    `Expires in ${minutes} minutes.`,
  ].join("\n");
}

/**
 * Handle resolving an approval via the ClawPay API.
 */
export async function resolveApproval(
  client: ClawPayClient,
  approved: boolean,
): Promise<string> {
  try {
    const result = await client.resolveApproval({
      approved,
    });

    if (result.status === "approved") {
      return `Purchase approved! Transaction: ${result.transaction_id}, Top-up: ${result.topup_id}`;
    }
    return "Purchase rejected.";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return `Failed to resolve approval: ${message}`;
  }
}
