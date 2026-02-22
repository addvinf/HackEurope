import { Type } from "@sinclair/typebox";
import type { ClawPayClient } from "./supabase-client.js";

export function createCompleteTool(client: ClawPayClient) {
  return {
    name: "clawpay_complete",
    description:
      "Complete a ClawPay purchase session by draining the virtual card back to $0. " +
      "This is the required second step of ClawPay purchase orchestration. " +
      "MUST be called after every approved clawpay_purchase, whether checkout succeeded or failed. " +
      "Pass success=true if the checkout was submitted successfully, or success=false if it failed. " +
      "This ensures the card is never left funded.",
    parameters: Type.Object({
      topup_id: Type.String({
        description: "The topup_id returned from clawpay_purchase",
      }),
      success: Type.Boolean({
        description: "true if checkout succeeded, false otherwise",
      }),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const { topup_id, success } = params as {
        topup_id: string;
        success: boolean;
      };

      if (!client.isPaired) {
        return {
          content: [
            { type: "text" as const, text: "ClawPay is not paired." },
          ],
        };
      }

      const result = await client.complete(topup_id, success);

      if (result.error) {
        return {
          content: [
            { type: "text" as const, text: `Drain failed: ${result.error}` },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: success
              ? `Checkout complete. Card drained — $${(result.drained_amount || 0).toFixed(2)} refunded to wallet.`
              : "Checkout cancelled. Full amount refunded to wallet.",
          },
        ],
        details: {
          status: result.status,
          drained_amount: result.drained_amount,
        },
      };
    },
  };
}
