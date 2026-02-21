import { stripeMock } from "@/lib/stripe-mock";
import { getAdminClient } from "@/lib/supabase-admin";
import type { ApproveResult } from "@/lib/types";

export type ResolveApprovalOutcome =
  | { ok: true; result: ApproveResult }
  | { ok: false; status: number; error: string };

type ResolveApprovalInput = {
  approvalToken: string;
  approved: boolean;
  expectedUserId?: string;
  sourceTelegramChatId?: string;
};

export async function resolveApproval(input: ResolveApprovalInput): Promise<ResolveApprovalOutcome> {
  const supabase = getAdminClient();

  const { data: approval } = await supabase
    .from("approvals")
    .select("*")
    .eq("token", input.approvalToken)
    .eq("status", "pending")
    .single();

  if (!approval) {
    return {
      ok: false,
      status: 404,
      error: "Approval not found or already resolved",
    };
  }

  if (input.expectedUserId && approval.user_id !== input.expectedUserId) {
    return {
      ok: false,
      status: 403,
      error: "Approval does not belong to this user",
    };
  }

  if (input.sourceTelegramChatId) {
    const { data: config } = await supabase
      .from("configs")
      .select("telegram_chat_id")
      .eq("user_id", approval.user_id)
      .single();

    const expectedChatId = String(config?.telegram_chat_id || "").trim();
    if (!expectedChatId || expectedChatId !== String(input.sourceTelegramChatId)) {
      return {
        ok: false,
        status: 403,
        error: "Telegram chat is not authorized for this approval",
      };
    }
  }

  if (new Date(approval.expires_at) < new Date()) {
    await supabase
      .from("approvals")
      .update({ status: "expired", resolved_at: new Date().toISOString() })
      .eq("id", approval.id);

    return {
      ok: false,
      status: 410,
      error: "Approval has expired",
    };
  }

  if (!input.approved) {
    await supabase
      .from("approvals")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("id", approval.id);

    await supabase.from("transactions").insert({
      user_id: approval.user_id,
      item: approval.item,
      amount: approval.amount,
      currency: approval.currency,
      merchant: approval.merchant,
      category: approval.category,
      status: "rejected",
      rejection_reason: "Rejected by user",
    });

    return { ok: true, result: { status: "rejected" } };
  }

  const { data: walletRow } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", approval.user_id)
    .eq("status", "active")
    .single();

  if (!walletRow) {
    return {
      ok: false,
      status: 400,
      error: "No wallet provisioned",
    };
  }

  const topUpResult = await stripeMock.topUp({
    user_id: approval.user_id,
    amount: approval.amount,
    transaction_id: "",
    timeout_seconds: 120,
  });

  await supabase
    .from("approvals")
    .update({ status: "approved", resolved_at: new Date().toISOString() })
    .eq("id", approval.id);

  const { data: txn } = await supabase
    .from("transactions")
    .insert({
      user_id: approval.user_id,
      item: approval.item,
      amount: approval.amount,
      currency: approval.currency,
      merchant: approval.merchant,
      category: approval.category,
      charge_id: walletRow.card_id,
      status: "completed",
    })
    .select()
    .single();

  await supabase.from("topup_sessions").insert({
    user_id: approval.user_id,
    wallet_id: walletRow.id,
    transaction_id: txn!.id,
    topup_id: topUpResult.topup_id,
    amount: approval.amount,
    status: "active",
    expires_at: new Date(topUpResult.expires_at * 1000).toISOString(),
  });

  await supabase
    .from("wallets")
    .update({ balance: approval.amount })
    .eq("id", walletRow.id);

  await supabase
    .from("known_merchants")
    .upsert(
      { user_id: approval.user_id, merchant: approval.merchant },
      { onConflict: "user_id,merchant" },
    );

  return {
    ok: true,
    result: {
      status: "approved",
      transaction_id: txn!.id,
      topup_id: topUpResult.topup_id,
      card_last4: walletRow.card_last4,
    },
  };
}

