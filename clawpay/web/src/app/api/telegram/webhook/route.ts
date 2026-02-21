import { NextRequest, NextResponse } from "next/server";
import { resolveApproval } from "@/lib/approval-service";
import { getAdminClient } from "@/lib/supabase-admin";
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

    // ── Handle /start <code> deep-link for Telegram onboarding ──
    const startMatch = /^\/start\s+([a-zA-Z0-9]+)$/.exec(text);
    if (startMatch) {
      const code = startMatch[1];
      const admin = getAdminClient();

      // Look up unused, unexpired code
      const { data: linkCode, error: lookupErr } = await admin
        .from("telegram_link_codes")
        .select("id, user_id")
        .eq("code", code)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (lookupErr || !linkCode) {
        await sendTelegramMessage(chatId, "This link code is invalid or has expired. Please generate a new one from ClawPay.");
        return NextResponse.json({ ok: true, linked: false });
      }

      // Upsert config with the chat ID and set channel to telegram
      await admin.from("configs").upsert(
        {
          user_id: linkCode.user_id,
          telegram_chat_id: chatId,
          approval_channel: "telegram",
        },
        { onConflict: "user_id" },
      );

      // Mark code as used
      await admin
        .from("telegram_link_codes")
        .update({ used: true })
        .eq("id", linkCode.id);

      await sendTelegramMessage(chatId, "Connected! ClawPay will send approval requests here.");
      return NextResponse.json({ ok: true, linked: true });
    }

    // ── Handle approval replies (YES/NO <token>) ──
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
