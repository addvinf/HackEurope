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
