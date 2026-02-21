import type { ClawPayClient } from "./supabase-client.js";

export function createSpendingCommand(client: ClawPayClient) {
  return {
    name: "spending",
    description: "Show your ClawPay spending summary",
    acceptsArgs: false,
    requireAuth: true,
    handler: async () => {
      if (!client.isPaired) {
        return {
          text: "ClawPay is not paired. Generate a pairing code at your ClawPay dashboard and use /clawpay-pair <code> to connect.",
        };
      }

      try {
        const config = await client.getConfig();
        return {
          text: [
            "**ClawPay Spending Rules**",
            `Per-purchase limit: $${config.per_purchase_limit}`,
            `Daily limit: $${config.daily_limit}`,
            `Monthly limit: $${config.monthly_limit}`,
            `Always require approval: ${config.always_ask ? "Yes" : "No"}`,
            `Max purchases per week: ${config.num_purchase_limit}`,
            `Blocked categories: ${config.blocked_categories.length > 0 ? config.blocked_categories.join(", ") : "None"}`,
            `Block new merchants: ${config.block_new_merchants ? "Yes" : "No"}`,
            `Block international: ${config.block_international ? "Yes" : "No"}`,
            `Night pause: ${config.night_pause ? "Yes" : "No"}`,
            `Approval channel: ${config.approval_channel}`,
            `Approval timeout: ${Math.floor(config.approval_timeout_seconds / 60)} min`,
          ].join("\n"),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { text: `Failed to fetch spending info: ${message}` };
      }
    },
  };
}

function parseTestBuyArgs(rawArgs?: string): {
  amount: number;
  currency: string;
  merchant: string;
  item: string;
} | null {
  const raw = (rawArgs ?? "").trim();
  if (!raw) {
    return {
      amount: 20,
      currency: "USD",
      merchant: "TestMart",
      item: "Test notebook",
    };
  }

  const match = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s+([A-Za-z]{3})\s+(\S+)\s+(.+)$/);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const currency = String(match[2]).toUpperCase();
  const merchant = String(match[3]);
  const item = String(match[4]).trim();

  if (!Number.isFinite(amount) || amount <= 0 || !item) {
    return null;
  }

  return { amount, currency, merchant, item };
}

export function createPairCommand(
  client: ClawPayClient,
  onPaired: (token: string) => void | Promise<void>,
) {
  return {
    name: "clawpay-pair",
    description: "Pair with ClawPay website using a 6-digit code",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: { args?: string }) => {
      const code = ctx.args?.trim();
      if (!code || !/^\d{6}$/.test(code)) {
        return {
          text: "Please provide a valid 6-digit pairing code. Usage: /clawpay-pair 483291",
        };
      }

      try {
        const result = await client.pair(code);
        client.setToken(result.api_token);
        await onPaired(result.api_token);
        return {
          text: "Successfully paired with ClawPay! Your agent can now make purchases on your behalf.",
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          text: `Pairing failed: ${message}`,
        };
      }
    },
  };
}

export function createDebugCommand(client: ClawPayClient, apiUrl: string) {
  return {
    name: "clawpay-debug",
    description: "Show ClawPay pairing/auth status and run a quick API probe",
    acceptsArgs: false,
    requireAuth: true,
    handler: async () => {
      const lines: string[] = [
        "**ClawPay Debug**",
        `API URL: ${apiUrl}`,
        `Paired in-memory: ${client.isPaired ? "yes" : "no"}`,
        `Token present: ${client.isPaired ? "set" : "empty"}`,
      ];

      if (!client.isPaired) {
        lines.push("API auth probe: skipped (no token)");
        return { text: lines.join("\n") };
      }

      try {
        await client.getConfig();
        lines.push("API auth probe: OK");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        lines.push(`API auth probe: failed (${message})`);
      }

      return { text: lines.join("\n") };
    },
  };
}

export function createTestBuyCommand(client: ClawPayClient) {
  return {
    name: "clawpay-testbuy",
    description:
      "Submit a deterministic test purchase directly via plugin (bypasses LLM tool selection). Usage: /clawpay-testbuy <amount> <currency> <merchant> <item...>",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: { args?: string }) => {
      if (!client.isPaired) {
        return {
          text: "ClawPay is not paired. Use /clawpay-pair <code> first.",
        };
      }

      const parsed = parseTestBuyArgs(ctx.args);
      if (!parsed) {
        return {
          text: "Invalid args. Usage: /clawpay-testbuy <amount> <currency> <merchant> <item...>. Example: /clawpay-testbuy 20 USD TestMart Test notebook",
        };
      }

      try {
        const result = await client.purchase({
          item: parsed.item,
          amount: parsed.amount,
          currency: parsed.currency,
          merchant: parsed.merchant,
        });

        if (result.status === "approved") {
          return {
            text: [
              "Test purchase authorized (checkout not yet completed).",
              `Transaction: ${result.transaction_id}`,
              `Top-up ID: ${result.topup_id}`,
              `Card: ending ${result.card_last4}`,
            ].join("\n"),
          };
        }

        if (result.status === "pending_approval") {
          return {
            text: [
              "Test purchase pending approval.",
              `Approval ID: ${result.approval_id}`,
              `Expires at: ${result.expires_at}`,
              `Reply with **yes** or **no** to resolve.`,
            ].join("\n"),
          };
        }

        return {
          text: `Test purchase rejected: ${result.reason}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          text: `Test purchase failed: ${message}`,
        };
      }
    },
  };
}
