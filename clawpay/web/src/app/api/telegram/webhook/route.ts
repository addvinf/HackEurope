import { NextRequest, NextResponse } from "next/server";
import { resolveApproval } from "@/lib/approval-service";
import {
  parseTelegramApprovalReply,
  sendTelegramMessage,
  verifyTelegramWebhookSecret,
} from "@/lib/telegram";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: {
      id?: number;
    };
  };
};

export async function POST(request: NextRequest) {
  try {
    if (!verifyTelegramWebhookSecret(request)) {
      return NextResponse.json({ error: "Unauthorized webhook secret" }, { status: 401 });
    }

    const update = (await request.json()) as TelegramUpdate;
    const text = String(update.message?.text || "");
    const chatIdRaw = update.message?.chat?.id;
    const chatId = chatIdRaw == null ? "" : String(chatIdRaw);

    if (!text || !chatId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const parsed = parseTelegramApprovalReply(text);
    if (!parsed) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const outcome = await resolveApproval({
      approvalToken: parsed.token,
      approved: parsed.approved,
      sourceTelegramChatId: chatId,
    });

    if (!outcome.ok) {
      await sendTelegramMessage(chatId, `ClawPay: ${outcome.error}`);
      return NextResponse.json({ ok: true, resolved: false });
    }

    if (outcome.result.status === "approved") {
      await sendTelegramMessage(
        chatId,
        `ClawPay approved. Transaction ${outcome.result.transaction_id}, top-up ${outcome.result.topup_id}.`,
      );
    } else {
      await sendTelegramMessage(chatId, "ClawPay rejected. Purchase was not approved.");
    }

    return NextResponse.json({ ok: true, resolved: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

