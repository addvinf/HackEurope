import type { ClawPayClient } from "./supabase-client.js";

// ── /spending ───────────────────────────────────────────────────────────────

export function createSpendingCommand(client: ClawPayClient) {
  return {
    name: "/spending",
    description: "Show your current ClawPay spending rules",
    async handler() {
      if (!client.isPaired) {
        return "ClawPay is not paired. Run /clawpay-pair <code> first.";
      }

      const cfg = await client.getConfig();
      if (cfg.error) return `Error: ${cfg.error}`;

      const lines = [
        "**ClawPay Spending Rules**",
        "",
        `Per-purchase limit: $${cfg.per_purchase_limit}`,
        `Daily limit:        $${cfg.daily_limit}`,
        `Monthly limit:      $${cfg.monthly_limit}`,
        `Weekly max purchases: ${cfg.num_purchase_limit}`,
        "",
        `Always ask:          ${cfg.always_ask ? "Yes" : "No"}`,
        `Block new merchants: ${cfg.block_new_merchants ? "Yes" : "No"}`,
        `Block international: ${cfg.block_international ? "Yes" : "No"}`,
        `Night pause:         ${cfg.night_pause ? "Yes" : "No"}`,
        `Approval channel:    ${cfg.approval_channel}`,
        `Approval timeout:    ${cfg.approval_timeout_seconds}s`,
      ];

      if (cfg.blocked_categories && cfg.blocked_categories.length > 0) {
        lines.push(`Blocked categories:  ${cfg.blocked_categories.join(", ")}`);
      }

      return lines.join("\n");
    },
  };
}

// ── /clawpay-pair ───────────────────────────────────────────────────────────

export function createPairCommand(
  client: ClawPayClient,
  onPaired: (token: string) => Promise<void>,
) {
  return {
    name: "/clawpay-pair",
    description: "Pair ClawPay with a 6-digit code from your dashboard",
    async handler(args: string) {
      const code = (args || "").trim();
      if (!/^\d{6}$/.test(code)) {
        return "Usage: /clawpay-pair <6-digit code>\nGenerate a code at your ClawPay dashboard → Pair.";
      }

      try {
        const { api_token, user_id } = await client.pair(code);
        await onPaired(api_token);
        return `Paired successfully! User: ${user_id}`;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return `Pairing failed: ${message}`;
      }
    },
  };
}

// ── /clawpay-debug ──────────────────────────────────────────────────────────

export function createDebugCommand(client: ClawPayClient, apiUrl: string) {
  return {
    name: "/clawpay-debug",
    description: "Show ClawPay pairing and connection status",
    async handler() {
      const lines = [
        "**ClawPay Debug Info**",
        "",
        `API base:  ${apiUrl}`,
        `Paired:    ${client.isPaired ? "Yes" : "No"}`,
      ];

      if (client.isPaired) {
        try {
          const config = await client.getConfig();
          lines.push(
            "",
            config.error
              ? `API probe: FAIL — ${config.error}`
              : "API probe: OK",
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          lines.push("", `API probe: FAIL — ${message}`);
        }
      }

      return lines.join("\n");
    },
  };
}

// ── /clawpay-testbuy ────────────────────────────────────────────────────────

export function createTestBuyCommand(client: ClawPayClient) {
  return {
    name: "/clawpay-testbuy",
    description:
      "Test a purchase: /clawpay-testbuy <amount> <currency> <merchant> <item>",
    async handler(args: string) {
      const parts = (args || "").trim().split(/\s+/);
      if (parts.length < 4) {
        return "Usage: /clawpay-testbuy <amount> <currency> <merchant> <item...>\nExample: /clawpay-testbuy 9.99 USD Amazon Kindle-Book";
      }

      const [amountStr, currency, merchant, ...itemParts] = parts;
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) return "Invalid amount.";

      if (!client.isPaired) {
        return "ClawPay is not paired. Run /clawpay-pair <code> first.";
      }

      const result = await client.purchase({
        item: itemParts.join(" "),
        amount,
        currency,
        merchant,
        userConfirmed: true,
      });

      return "```json\n" + JSON.stringify(result, null, 2) + "\n```";
    },
  };
}
