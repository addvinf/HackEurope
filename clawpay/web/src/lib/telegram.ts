type TelegramSendResult = {
  ok: boolean;
  description?: string;
};

type TelegramApprovalReply = {
  approved: boolean;
};

function getTelegramBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return token;
}

function getTelegramApiBase(): string {
  return process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
}

export function verifyTelegramWebhookSecret(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (!expected) {
    return false;
  }
  const got = request.headers.get("x-telegram-bot-api-secret-token") || "";
  return got === expected;
}

export function parseTelegramApprovalReply(text: string): TelegramApprovalReply | null {
  const match = /^\s*(yes|no)\s*$/i.exec(text || "");
  if (!match) {
    return null;
  }
  return {
    approved: match[1].toLowerCase() === "yes",
  };
}

export function formatApprovalMessage(params: {
  item: string;
  amount: number;
  currency: string;
  merchant: string;
  expiresAt: string;
}): string {
  return [
    "ClawPay approval request",
    `Item: ${params.item}`,
    `Amount: ${params.amount} ${params.currency}`,
    `Merchant: ${params.merchant}`,
    `Reply YES to approve`,
    `Reply NO to reject`,
    `Expires: ${params.expiresAt}`,
  ].join("\n");
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<TelegramSendResult> {
  const token = getTelegramBotToken();
  const base = getTelegramApiBase().replace(/\/$/, "");
  const url = `${base}/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      description: body || `HTTP ${response.status}`,
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;
  if (!payload?.ok) {
    return {
      ok: false,
      description: payload?.description || "Telegram send failed",
    };
  }

  return { ok: true };
}

