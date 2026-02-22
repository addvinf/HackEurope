import { Type } from "@sinclair/typebox";
import type { ClawPayClient } from "./supabase-client.js";

export function createPurchaseTool(client: ClawPayClient) {
  return {
    name: "clawpay_purchase",
    description:
      "Execute a purchase through ClawPay. The user must have already confirmed they want to buy. " +
      "Returns approved (with card details for checkout), pending_approval (needs user OK), or rejected.",
    parameters: Type.Object({
      item: Type.String({ description: "What is being purchased" }),
      amount: Type.Number({ description: "Total price" }),
      currency: Type.Optional(
        Type.String({ description: "ISO currency code", default: "USD" }),
      ),
      merchant: Type.String({ description: "Merchant / store name" }),
      merchant_url: Type.Optional(
        Type.String({ description: "Merchant URL" }),
      ),
      category: Type.Optional(
        Type.String({ description: "Spending category" }),
      ),
      international: Type.Optional(
        Type.Boolean({
          description: "Is this an international purchase?",
          default: false,
        }),
      ),
      userConfirmed: Type.Boolean({
        description:
          "Must be true — agent has confirmed with the user that they want to buy",
      }),
    }),

    async handler(params: {
      item: string;
      amount: number;
      currency?: string;
      merchant: string;
      merchant_url?: string;
      category?: string;
      international?: boolean;
      userConfirmed: boolean;
    }) {
      if (!params.userConfirmed) {
        return {
          error:
            "You must confirm with the user before making a purchase (userConfirmed must be true).",
        };
      }

      if (!client.isPaired) {
        return {
          error: "ClawPay is not paired. Run /clawpay-pair <code> first.",
        };
      }

      const result = await client.purchase(params);

      if ("error" in result) {
        return { error: result.error };
      }

      if (result.status === "approved") {
        return {
          status: "approved",
          transaction_id: result.transaction_id,
          topup_id: result.topup_id,
          message: `Purchase approved. Card ending in ${result.card_last4} is funded with ${params.currency || "USD"} ${params.amount.toFixed(2)}. Proceed to checkout — card details have been injected into the browser.`,
          // Card details stay in plugin context for CDP injection — never sent to LLM
          _card: result.card,
        };
      }

      if (result.status === "pending_approval") {
        return {
          status: "pending_approval",
          approval_id: result.approval_id,
          expires_at: result.expires_at,
          message:
            "Purchase requires user approval. Waiting for the user to approve or reject.",
        };
      }

      return {
        status: "rejected",
        reason: result.reason,
        message: `Purchase rejected: ${result.reason}`,
      };
    },
  };
}
