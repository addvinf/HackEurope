import { Type } from "@sinclair/typebox";
import type { ClawPayClient } from "./supabase-client.js";

export function createCompleteTool(client: ClawPayClient) {
  return {
    name: "clawpay_complete",
    description:
      "Call after checkout is done (success or failure). " +
      "Drains the virtual card back to $0 and refunds any unused balance to the wallet.",
    parameters: Type.Object({
      topup_id: Type.String({
        description: "The topup_id returned from clawpay_purchase",
      }),
      success: Type.Boolean({
        description: "true if checkout succeeded, false otherwise",
      }),
    }),

    async handler(params: { topup_id: string; success: boolean }) {
      if (!client.isPaired) {
        return { error: "ClawPay is not paired." };
      }

      const result = await client.complete(params.topup_id, params.success);

      if (result.error) {
        return { error: result.error };
      }

      return {
        status: result.status,
        drained_amount: result.drained_amount,
        message: params.success
          ? `Checkout complete. Card drained — $${(result.drained_amount || 0).toFixed(2)} refunded to wallet.`
          : "Checkout cancelled. Full amount refunded to wallet.",
      };
    },
  };
}
