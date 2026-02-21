import { Type } from "@sinclair/typebox";
import type { ClawPayClient } from "./supabase-client.js";
import { buildCdpInjectionPayload } from "./cdp-inject.js";

export function createPurchaseTool(client: ClawPayClient) {
  return {
    name: "clawpay_purchase",
    label: "ClawPay Purchase",
    description:
      "Execute a purchase through ClawPay. Evaluates spending rules, obtains approval if needed, " +
      "and tops up the persistent virtual card. On success, returns a CDP injection payload that fills " +
      "the card details directly into the checkout form — the card number never enters the LLM context. " +
      "IMPORTANT: Only call this when the user has explicitly confirmed item + price + merchant. " +
      "The browser should already be on the checkout/payment page. " +
      "After checkout completes (success or failure), you MUST call clawpay_complete.",
    parameters: Type.Object({
      item: Type.String({ description: "Name/description of the item being purchased" }),
      amount: Type.Number({ description: "Price in the specified currency (e.g. 49.99)" }),
      currency: Type.Optional(
        Type.String({ description: "ISO currency code (default: USD)" }),
      ),
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
              text: "ClawPay is not paired. Ask the user to generate a pairing code at their ClawPay dashboard and use /clawpay-pair <code> to connect.",
            },
          ],
        };
      }

      const item = String(params.item || "");
      const amount = Number(params.amount);
      const currency = String(params.currency || "USD");
      const merchant = String(params.merchant || "");
      const merchant_url = params.merchant_url
        ? String(params.merchant_url)
        : undefined;
      const category = params.category
        ? String(params.category)
        : undefined;
      const international = params.international === true;

      if (!item || !amount || !merchant) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Missing required fields: item, amount, and merchant are all required.",
            },
          ],
        };
      }

      try {
        const result = await client.purchase({
          item,
          amount,
          currency,
          merchant,
          merchant_url,
          category,
          international,
        });

        if (result.status === "approved") {
          // Purchase approved — fetch persistent card details and prepare CDP injection.
          // The card details NEVER appear in this text response to the LLM.
          let cdpSummary = "Virtual card topped up.";

          try {
            const cardDetails = await client.getCardDetails();
            const cdpPayload = buildCdpInjectionPayload(cardDetails);
            cdpSummary = cdpPayload.summary;

            return {
              content: [
                {
                  type: "text" as const,
                  text: [
                    `Purchase approved!`,
                    `Item: ${item}`,
                    `Amount: $${amount} ${currency}`,
                    `Merchant: ${merchant}`,
                    `Transaction: ${result.transaction_id}`,
                    `Top-up ID: ${result.topup_id}`,
                    ``,
                    `${cdpSummary}`,
                    `Use the browser tool to submit the checkout form now.`,
                    ``,
                    `IMPORTANT: After checkout, call clawpay_complete with topup_id="${result.topup_id}" and success=true/false.`,
                  ].join("\n"),
                },
              ],
              details: {
                ...result,
                cdp_injection: cdpPayload,
              },
            };
          } catch {
            // Card details fetch failed — still approved, but can't inject
            return {
              content: [
                {
                  type: "text" as const,
                  text: [
                    `Purchase approved!`,
                    `Item: ${item}`,
                    `Amount: $${amount} ${currency}`,
                    `Merchant: ${merchant}`,
                    `Transaction: ${result.transaction_id}`,
                    `Top-up ID: ${result.topup_id}`,
                    `Card: ending ${result.card_last4}`,
                    ``,
                    `${cdpSummary}`,
                    `Note: Could not prepare automatic form fill. The user may need to enter card details manually.`,
                    ``,
                    `IMPORTANT: After checkout, call clawpay_complete with topup_id="${result.topup_id}" and success=true/false.`,
                  ].join("\n"),
                },
              ],
              details: result,
            };
          }
        }

        if (result.status === "pending_approval") {
          return {
            content: [
              {
                type: "text" as const,
                text: [
                  `Purchase requires approval.`,
                  `Item: ${item}`,
                  `Amount: $${amount} ${currency}`,
                  `Merchant: ${merchant}`,
                  ``,
                  `An approval request has been sent. The user can approve via:`,
                  `- Their ClawPay dashboard (Approvals page)`,
                  `- Replying to the approval message on their messaging channel`,
                  ``,
                  `Approval expires: ${result.expires_at}`,
                ].join("\n"),
              },
            ],
            details: result,
          };
        }

        // rejected
        return {
          content: [
            {
              type: "text" as const,
              text: [
                `Purchase rejected by ClawPay rules.`,
                `Reason: ${result.reason}`,
                ``,
                `The user can adjust their spending rules in the ClawPay dashboard.`,
              ].join("\n"),
            },
          ],
          details: result,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: `ClawPay purchase failed: ${message}`,
            },
          ],
        };
      }
    },
  };
}
