import type {
  AnyAgentTool,
  OpenClawPluginApi,
} from "openclaw/plugin-sdk";
import { createClawPayClient } from "./src/supabase-client.js";
import { createPurchaseTool } from "./src/purchase-tool.js";
import { createCompleteTool } from "./src/complete-tool.js";
import {
  createSpendingCommand,
  createPairCommand,
  createDebugCommand,
  createTestBuyCommand,
} from "./src/commands.js";
import { parseApprovalReply, resolveApproval } from "./src/approval-flow.js";

export default function register(api: OpenClawPluginApi) {
  const config = api.pluginConfig ?? {};
  const apiUrl = (config.apiUrl as string) || "http://localhost:3000";
  const apiToken = (config.apiToken as string) || "";

  const client = createClawPayClient(apiUrl, apiToken);
  const runtime = api.runtime as {
    config: {
      loadConfig: () => unknown;
      writeConfigFile: (cfg: unknown) => Promise<void>;
    };
  };

  // Register the purchase tool (agent can call this)
  api.registerTool(createPurchaseTool(client) as AnyAgentTool);

  // Register the complete tool (agent calls after checkout to drain card)
  api.registerTool(createCompleteTool(client) as AnyAgentTool);

  // Command surface
  api.registerCommand(createSpendingCommand(client));
  api.registerCommand(createDebugCommand(client, apiUrl));
  api.registerCommand(createTestBuyCommand(client));

  // /clawpay-pair <code> command
  api.registerCommand(
    createPairCommand(client, async (token) => {
      api.logger.info("ClawPay paired successfully (in-memory token set).");

      // Persist token so pairing survives restarts.
      try {
        const cfg = runtime.config.loadConfig() as Record<string, unknown>;
        const existingPlugins = (cfg.plugins as Record<string, unknown> | undefined) ?? {};
        const existingEntries =
          (existingPlugins.entries as Record<string, unknown> | undefined) ?? {};
        const existingClawPay =
          (existingEntries.clawpay as Record<string, unknown> | undefined) ?? {};
        const existingPluginCfg =
          (existingClawPay.config as Record<string, unknown> | undefined) ?? {};

        const next = {
          ...cfg,
          plugins: {
            ...existingPlugins,
            entries: {
              ...existingEntries,
              clawpay: {
                ...existingClawPay,
                config: {
                  ...existingPluginCfg,
                  apiToken: token,
                  apiUrl,
                },
              },
            },
          },
        };

        await runtime.config.writeConfigFile(next);
        api.logger.info("ClawPay token persisted to openclaw.json");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        api.logger.warn(
          `ClawPay token NOT persisted; in-memory only. Set plugins.entries.clawpay.config.apiToken manually. (${message})`,
        );
      }
    }),
  );

  // Observability for tool invocation
  api.on("before_tool_call", (event: unknown) => {
    const toolName = (event as { toolName?: string }).toolName;
    if (toolName === "clawpay_purchase" || toolName === "clawpay_complete") {
      api.logger.info(`[clawpay] tool:start ${toolName}`);
    }
  });

  api.on("after_tool_call", (event: unknown) => {
    const typed = event as { toolName?: string; error?: string };
    if (typed.toolName === "clawpay_purchase" || typed.toolName === "clawpay_complete") {
      const status = typed.error ? `error=${typed.error}` : "ok";
      api.logger.info(`[clawpay] tool:end ${typed.toolName} ${status}`);
    }
  });

  // Listen for approval replies in messages
  api.on("message_received", async (event: unknown) => {
    if (!client.isPaired) return;
    const { content } = event as { content: string };

    const parsed = parseApprovalReply(content);
    if (!parsed) return;

    const resultText = await resolveApproval(client, parsed.token, parsed.approved);
    api.logger.info(`ClawPay approval resolved: ${resultText}`);
  });
}
