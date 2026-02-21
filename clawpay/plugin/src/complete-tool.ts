import { Type } from "@sinclair/typebox";
import type { ClawPayClient } from "./supabase-client.js";

/**
 * clawpay_complete — the agent calls this after every approved purchase
 * (whether checkout succeeded or failed). It drains the persistent card
 * back to $0 and closes the top-up session.
 */
export function createCompleteTool(client: ClawPayClient) {
  return {
    name: "clawpay_complete",
    label: "ClawPay Complete",
    description:
      "Complete a ClawPay purchase session by draining the virtual card back to $0. " +
      "MUST be called after every approved clawpay_purchase, whether checkout succeeded or failed. " +
      "Pass success=true if the checkout was submitted successfully, or success=false if it failed. " +
      "This ensures the card is never left funded.",
    parameters: Type.Object({
      topup_id: Type.String({
        description: "The topup_id returned by clawpay_purchase",
      }),
      success: Type.Boolean({
        description: "Whether the checkout completed successfully",
      }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      if (!client.isPaired) {
        return {
          content: [
            {
              type: "text" as const,
              text: "ClawPay is not paired.",
            },
          ],
        };
      }

      const topup_id = String(params.topup_id || "");
      const success = params.success === true;

      if (!topup_id) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Missing required field: topup_id",
            },
          ],
        };
      }

      try {
        const result = await client.drain({ topup_id, success });

        if (result.status === "already_drained") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Session already completed (reason: ${result.drain_reason}). Card is at $0.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: [
                success
                  ? `Checkout completed successfully. Card drained to $0.`
                  : `Checkout failed. Card drained to $0 and transaction marked as cancelled.`,
                `Drained amount: $${result.drained_amount}`,
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: `ClawPay drain failed: ${message}. The card will auto-drain after the timeout.`,
            },
          ],
        };
      }
    },
  };
}
