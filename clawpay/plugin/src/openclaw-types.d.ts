/**
 * Minimal type declarations for OpenClaw Plugin SDK.
 * These mirror the types from openclaw/plugin-sdk needed by ClawPay.
 * When OpenClaw is installed, these are provided by the actual SDK.
 */

declare module "openclaw/plugin-sdk" {
  export interface OpenClawPluginToolContext {
    config?: unknown;
    workspaceDir?: string;
    agentDir?: string;
    agentId?: string;
    sessionKey?: string;
    messageChannel?: string;
    sandboxed?: boolean;
  }

  export type OpenClawPluginToolFactory = (
    ctx: OpenClawPluginToolContext,
  ) => AnyAgentTool | AnyAgentTool[] | null | undefined;

  export type OpenClawPluginToolOptions = {
    name?: string;
    names?: string[];
    optional?: boolean;
  };

  export type AnyAgentTool = {
    name: string;
    label?: string;
    description: string;
    parameters: unknown;
    execute: (id: string, params: Record<string, unknown>) => Promise<{
      content: Array<{ type: string; text: string }>;
      details?: unknown;
    }>;
    ownerOnly?: boolean;
  };

  export interface PluginCommandContext {
    senderId?: string;
    channel: string;
    isAuthorizedSender: boolean;
    args?: string;
    commandBody: string;
    config: unknown;
  }

  export type PluginCommandResult = { text?: string; [key: string]: unknown };

  export interface OpenClawPluginCommandDefinition {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (ctx: PluginCommandContext) => PluginCommandResult | Promise<PluginCommandResult>;
  }

  export interface PluginHookMessageReceivedEvent {
    from: string;
    content: string;
    timestamp?: number;
    metadata?: Record<string, unknown>;
  }

  export interface PluginHookMessageContext {
    channelId: string;
    accountId?: string;
    conversationId?: string;
  }

  export type PluginHookName =
    | "message_received"
    | "message_sending"
    | "message_sent"
    | string;

  export interface PluginLogger {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  }

  export interface OpenClawPluginApi {
    id: string;
    name: string;
    version?: string;
    description?: string;
    source: string;
    config: unknown;
    pluginConfig?: Record<string, unknown>;
    runtime: unknown;
    logger: PluginLogger;
    registerTool: (
      tool: AnyAgentTool | OpenClawPluginToolFactory,
      opts?: OpenClawPluginToolOptions,
    ) => void;
    registerHook: (
      events: string | string[],
      handler: (...args: unknown[]) => unknown,
      opts?: unknown,
    ) => void;
    registerCommand: (command: OpenClawPluginCommandDefinition) => void;
    registerChannel: (registration: unknown) => void;
    registerGatewayMethod: (method: string, handler: unknown) => void;
    registerCli: (registrar: unknown, opts?: unknown) => void;
    registerService: (service: unknown) => void;
    registerProvider: (provider: unknown) => void;
    registerHttpHandler: (handler: unknown) => void;
    registerHttpRoute: (params: unknown) => void;
    resolvePath: (input: string) => string;
    on: <K extends PluginHookName>(
      hookName: K,
      handler: (...args: unknown[]) => unknown,
      opts?: { priority?: number },
    ) => void;
  }

  export function emptyPluginConfigSchema(): unknown;
}

declare module "@sinclair/typebox" {
  export const Type: {
    Object: (properties: Record<string, unknown>) => unknown;
    String: (opts?: Record<string, unknown>) => unknown;
    Number: (opts?: Record<string, unknown>) => unknown;
    Boolean: (opts?: Record<string, unknown>) => unknown;
    Optional: (schema: unknown) => unknown;
    Array: (schema: unknown, opts?: Record<string, unknown>) => unknown;
    Unsafe: <T>(opts: Record<string, unknown>) => unknown;
  };
}
