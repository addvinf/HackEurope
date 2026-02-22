import { Type } from "@sinclair/typebox";
import type { ClawPayClient } from "./supabase-client.js";
import { buildCdpInjectionPayload } from "./cdp-inject.js";

export function createPurchaseTool(client: ClawPayClient) {
  return {
    name: "clawpay_purchase",
    description:
      "Execute a purchase through ClawPay. Evaluates spending rules, obtains approval if needed, " +
      "and tops up the persistent virtual card. On success, returns a CDP injection payload that fills " +
      "the card details directly into the checkout form; the card number never enters the LLM context. " +
      "IMPORTANT: This is the only allowed purchase orchestration path. " +
      "Call when user intent is explicit and item + amount + merchant are known. " +
      "The browser should already be on the checkout/payment page. " +
      "After checkout completes (success or failure), you MUST call clawpay_complete.",
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

    async execute(_id: string, params: Record<string, unknown>) {
      const input = params as {
        item: string;
        amount: number;
        currency?: string;
        merchant: string;
        merchant_url?: string;
        category?: string;
        international?: boolean;
        userConfirmed: boolean;
      };

      if (!client.isPaired) {
        return {
          content: [
            {
              type: "text" as const,
              text: "ClawPay is not paired. Run /clawpay-pair <code> first.",
            },
          ],
        };
      }

      const normalized = {
        item: input.item.trim(),
        amount: input.amount,
        currency: (input.currency || "USD").trim().toUpperCase(),
        userConfirmed: input.userConfirmed,
        merchant: input.merchant.trim(),
        merchant_url: input.merchant_url?.trim(),
        category: input.category?.trim().toLowerCase(),
        international: input.international,
      };

      const missing: string[] = [];
      if (!normalized.item) missing.push("item");
      if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) {
        missing.push("amount (> 0)");
      }
      if (!normalized.currency) missing.push("currency");
      if (!normalized.merchant) missing.push("merchant");

      if (missing.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Missing or invalid required fields: ${missing.join(", ")}.`,
            },
          ],
        };
      }

      if (!normalized.userConfirmed) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Purchase aborted — user has not confirmed. You must confirm with the user before calling this tool.",
            },
          ],
        };
      }

      try {
        const result = await client.purchase({
          item: normalized.item,
          amount: normalized.amount,
          currency: normalized.currency,
          merchant: normalized.merchant,
          merchant_url: normalized.merchant_url,
          category: normalized.category,
          international: normalized.international,
        });

        if ("error" in result) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Purchase failed: ${result.error}`,
              },
            ],
          };
        }

        if (result.status === "approved") {
          const cdpPayload = buildCdpInjectionPayload(result.card);
          const cdpSummary = cdpPayload.summary;

          return {
            content: [
              {
                type: "text" as const,
                text: [
                  "Purchase authorized (not yet completed)!",
                  `Item: ${normalized.item}`,
                  `Amount: $${normalized.amount} ${normalized.currency}`,
                  `Merchant: ${normalized.merchant}`,
                  `Transaction: ${result.transaction_id}`,
                  `Top-up ID: ${result.topup_id}`,
                  "",
                  cdpSummary,
                  "Use the browser tool to submit the checkout form now.",
                  "",
                  `IMPORTANT: After checkout, call clawpay_complete with topup_id="${result.topup_id}" and success=true/false.`,
                ].join("\n"),
              },
            ],
            details: {
              ...result,
              purchase_status: "approved",
              purchase_input: {
                item: normalized.item,
                amount: normalized.amount,
                currency: normalized.currency,
                merchant: normalized.merchant,
              },
              cdp_injection: cdpPayload,
            },
          };
        }

        if (result.status === "pending_approval") {
          return {
            content: [
              {
                type: "text" as const,
                text: [
                  "Purchase requires approval.",
                  `Item: ${normalized.item}`,
                  `Amount: $${normalized.amount} ${normalized.currency}`,
                  `Merchant: ${normalized.merchant}`,
                  "",
                  "An approval request has been sent. The user can approve via:",
                  "- Their ClawPay dashboard (Approvals page)",
                  "- Replying to the approval message on their messaging channel",
                  "",
                  `Approval expires: ${result.expires_at}`,
                ].join("\n"),
              },
            ],
            details: {
              ...result,
              purchase_status: "pending_approval",
              purchase_input: {
                item: normalized.item,
                amount: normalized.amount,
                currency: normalized.currency,
                merchant: normalized.merchant,
              },
            },
          };
        }

        // status === "rejected"
        return {
          content: [
            {
              type: "text" as const,
              text: [
                "Purchase rejected by ClawPay rules.",
                `Reason: ${result.reason}`,
                "",
                "The user can adjust their spending rules in the ClawPay dashboard.",
              ].join("\n"),
            },
          ],
          details: {
            ...result,
            purchase_status: "rejected",
            purchase_input: {
              item: normalized.item,
              amount: normalized.amount,
              currency: normalized.currency,
              merchant: normalized.merchant,
            },
          },
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Purchase failed: ${err instanceof Error ? err.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  };
}
