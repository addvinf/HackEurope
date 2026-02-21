import { Type } from "@sinclair/typebox";
import type { ClawPayClient } from "./supabase-client.js";
import type { PurchaseToolInput } from "./types.js";
import { buildCdpInjectionPayload } from "./cdp-inject.js";

export function createPurchaseTool(client: ClawPayClient) {
  return {
    name: "clawpay_purchase",
    label: "ClawPay Purchase",
    description:
      "Execute a purchase through ClawPay. Evaluates spending rules, obtains approval if needed, " +
      "and tops up the persistent virtual card. On success, returns a CDP injection payload that fills " +
      "the card details directly into the checkout form; the card number never enters the LLM context. " +
      "IMPORTANT: This is the only allowed purchase orchestration path. " +
      "Call when user intent is explicit and item + amount + merchant are known. " +
      "The browser should already be on the checkout/payment page. " +
      "After checkout completes (success or failure), you MUST call clawpay_complete.",
    parameters: Type.Object({
      item: Type.String({ description: "Name/description of the item being purchased" }),
      amount: Type.Number({ description: "Price in the specified currency (e.g. 49.99)" }),
      currency: Type.String({
        description: "ISO currency code (for example: USD)",
      }),
      userConfirmed: Type.Boolean({
        description:
          "Must be true only after explicit user confirmation of item + amount + merchant",
      }),
      merchant: Type.String({ description: "Name of the merchant/store" }),
      merchant_url: Type.Optional(
        Type.String({ description: "URL of the product or merchant" }),
      ),
      category: Type.Optional(
        Type.String({
          description:
            "Product category (e.g. clothing, electronics, food, entertainment)",
        }),
      ),
      international: Type.Optional(
        Type.Boolean({
          description: "Whether the merchant is international (non-domestic)",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      if (!client.isPaired) {
        return {
          content: [
            {
              type: "text" as const,
              text: "ClawPay is not paired in this gateway instance. Ask the user to generate a pairing code in the ClawPay dashboard and run /clawpay-pair <code>.",
            },
          ],
        };
      }

      const input: PurchaseToolInput = {
        item: String(params.item || ""),
        amount: Number(params.amount),
        currency: String(params.currency || ""),
        userConfirmed: params.userConfirmed === true,
        merchant: String(params.merchant || ""),
        merchant_url: params.merchant_url ? String(params.merchant_url) : undefined,
        category: params.category ? String(params.category) : undefined,
        international: params.international === true,
      };

      const normalized = {
        item: input.item.trim(),
        amount: input.amount,
        currency: input.currency.trim().toUpperCase(),
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
              text: "Purchase blocked: userConfirmed must be true before calling clawpay_purchase.",
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

        if (result.status === "approved") {
          // Purchase authorized; card details are included inline in the response.
          // The card details never appear in text returned to the LLM.
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
                  `IMPORTANT: After checkout, call clawpay_complete with topup_id=\"${result.topup_id}\" and success=true/false.`,
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

        // rejected
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
        const message = err instanceof Error ? err.message : "Unknown error";
        const lower = message.toLowerCase();
        const authIssue =
          lower.includes("authentication failed") ||
          lower.includes("401") ||
          lower.includes("pair again") ||
          lower.includes("not paired");

        const text = authIssue
          ? [
              `ClawPay purchase failed: ${message}`,
              "",
              "Pairing may be expired or missing in this runtime.",
              "Recovery: generate a new 6-digit pairing code and run /clawpay-pair <code>, then retry.",
            ].join("\n")
          : `ClawPay purchase failed: ${message}`;

        return {
          content: [
            {
              type: "text" as const,
              text,
            },
          ],
        };
      }
    },
  };
}
