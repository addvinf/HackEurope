import type {
  AnyAgentTool,
  OpenClawPluginApi,
  OpenClawPluginToolFactory,
} from "openclaw/plugin-sdk";
import { createClawPayClient } from "./src/supabase-client.js";
import { createPurchaseTool } from "./src/purchase-tool.js";
import { createCompleteTool } from "./src/complete-tool.js";
import { createSpendingCommand, createPairCommand } from "./src/commands.js";
import { parseApprovalReply, resolveApproval } from "./src/approval-flow.js";

export default function register(api: OpenClawPluginApi) {
  const config = api.pluginConfig ?? {};
  const apiUrl = (config.apiUrl as string) || "http://localhost:3000";
  const apiToken = (config.apiToken as string) || "";

  const client = createClawPayClient(apiUrl, apiToken);

  // Register the purchase tool (agent can call this)
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) return null;
      return createPurchaseTool(client) as AnyAgentTool;
    }) as OpenClawPluginToolFactory,
    { optional: true },
  );

  // Register the complete tool (agent calls after checkout to drain card)
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) return null;
      return createCompleteTool(client) as AnyAgentTool;
    }) as OpenClawPluginToolFactory,
    { optional: true },
  );

  // /spending command — show spending rules
  api.registerCommand(createSpendingCommand(client));

  // /clawpay-pair <code> command — pair with website
  api.registerCommand(
    createPairCommand(client, async (token) => {
      api.logger.info(`ClawPay paired successfully`);

      // Auto-persist the token so it survives restarts
      if (api.runtime?.setConfig) {
        try {
          await api.runtime.setConfig("plugins.entries.clawpay.config.apiToken", token);
          await api.runtime.setConfig("plugins.entries.clawpay.config.apiUrl", apiUrl);
          api.logger.info("API token saved to OpenClaw config.");
        } catch {
          api.logger.warn(
            "Could not auto-save token. Add it manually to openclaw.json: plugins.entries.clawpay.config.apiToken",
          );
        }
      } else {
        api.logger.info(
          "To persist the pairing, add the API token to your openclaw.json: plugins.entries.clawpay.config.apiToken",
        );
      }
    }),
  );

  // Listen for approval replies in messages
  api.on("message_received", async (event: unknown) => {
    if (!client.isPaired) return;
    const { content } = event as { content: string };

    const parsed = parseApprovalReply(content);
    if (!parsed) return;

    const resultText = await resolveApproval(
      client,
      parsed.token,
      parsed.approved,
    );
    api.logger.info(`ClawPay approval resolved: ${resultText}`);
  });
}
