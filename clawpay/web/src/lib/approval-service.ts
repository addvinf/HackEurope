import { stripeMock } from "@/lib/stripe-mock";
import { getAdminClient } from "@/lib/supabase-admin";
import type { ApproveResult } from "@/lib/types";

export type ResolveApprovalOutcome =
  | { ok: true; result: ApproveResult }
  | { ok: false; status: number; error: string };

type ResolveApprovalInput = {
  approved: boolean;
  userId?: string;
  sourceTelegramChatId?: string;
};

function fail(status: number, error: string): ResolveApprovalOutcome {
  return { ok: false, status, error };
}

export async function resolveApproval(input: ResolveApprovalInput): Promise<ResolveApprovalOutcome> {
  const supabase = getAdminClient();

  // Resolve the user ID — either directly provided or via Telegram chat ID
  let resolvedUserId = input.userId;

  if (!resolvedUserId && input.sourceTelegramChatId) {
    const { data: config, error: configError } = await supabase
      .from("configs")
      .select("user_id")
      .eq("telegram_chat_id", String(input.sourceTelegramChatId))
      .single();

    if (configError || !config) {
      return fail(403, "Telegram chat is not linked to any ClawPay account");
    }
    resolvedUserId = config.user_id;
  }

  if (!resolvedUserId) {
    return fail(400, "Unable to identify user");
  }

  // Find the most recent pending approval for this user
  const { data: approval, error: approvalFetchError } = await supabase
    .from("approvals")
    .select("*")
    .eq("user_id", resolvedUserId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (approvalFetchError || !approval) {
    return fail(404, "No pending approval found");
  }

  if (new Date(approval.expires_at) < new Date()) {
    const { error: expireError } = await supabase
      .from("approvals")
      .update({ status: "expired", resolved_at: new Date().toISOString() })
      .eq("id", approval.id);
    if (expireError) {
      return fail(500, "Failed to mark approval as expired");
    }

    return fail(410, "Approval has expired");
  }

  if (!input.approved) {
    const { error: rejectError } = await supabase
      .from("approvals")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("id", approval.id);
    if (rejectError) {
      return fail(500, "Failed to mark approval as rejected");
    }

    const { error: rejectedTxnError } = await supabase.from("transactions").insert({
      user_id: approval.user_id,
      item: approval.item,
      amount: approval.amount,
      currency: approval.currency,
      merchant: approval.merchant,
      category: approval.category,
      status: "rejected",
      rejection_reason: "Rejected by user",
    });
    if (rejectedTxnError) {
      return fail(500, "Failed to record rejected transaction");
    }

    return { ok: true, result: { status: "rejected" } };
  }

  const { data: walletRow, error: walletFetchError } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", approval.user_id)
    .eq("status", "active")
    .single();

  if (walletFetchError || !walletRow) {
    return fail(400, "No wallet provisioned");
  }

  const walletBalance = Number(walletRow.balance);
  const approvalAmount = Number(approval.amount);
  if (walletBalance < approvalAmount) {
    return fail(
      400,
      `Insufficient wallet balance. Current balance: $${walletBalance.toFixed(2)}, required: $${approvalAmount.toFixed(2)}`,
    );
  }

  const topUpResult = await stripeMock.topUp({
    user_id: approval.user_id,
    amount: approvalAmount,
    transaction_id: "",
    timeout_seconds: 300,
  });

  const { data: txn, error: txnError } = await supabase
    .from("transactions")
    .insert({
      user_id: approval.user_id,
      item: approval.item,
      amount: approval.amount,
      currency: approval.currency,
      merchant: approval.merchant,
      category: approval.category,
      charge_id: walletRow.card_id,
      status: "authorized",
    })
    .select()
    .single();
  if (txnError || !txn) {
    await stripeMock.drain({ user_id: approval.user_id, reason: "approval_rollback_txn" });
    return fail(500, "Failed to record approved transaction");
  }

  const { error: topupInsertError } = await supabase.from("topup_sessions").insert({
    user_id: approval.user_id,
    wallet_id: walletRow.id,
    transaction_id: txn.id,
    topup_id: topUpResult.topup_id,
    amount: approvalAmount,
    status: "active",
    expires_at: new Date(topUpResult.expires_at * 1000).toISOString(),
  });
  if (topupInsertError) {
    await stripeMock.drain({ user_id: approval.user_id, reason: "approval_rollback_topup" });
    return fail(500, "Failed to create top-up session");
  }

  const newBalance = walletBalance - approvalAmount;
  const { error: walletUpdateError } = await supabase
    .from("wallets")
    .update({ balance: newBalance })
    .eq("id", walletRow.id);
  if (walletUpdateError) {
    await stripeMock.drain({ user_id: approval.user_id, reason: "approval_rollback_wallet" });
    return fail(500, "Failed to update wallet balance");
  }

  const { error: ledgerError } = await supabase.from("wallet_ledger").insert({
    user_id: approval.user_id,
    wallet_id: walletRow.id,
    type: "purchase_debit",
    amount: approvalAmount,
    balance_after: newBalance,
    reference_id: txn.id,
    description: `Authorized purchase: ${approval.item} from ${approval.merchant}`,
  });
  if (ledgerError) {
    await stripeMock.drain({ user_id: approval.user_id, reason: "approval_rollback_ledger" });
    return fail(500, "Failed to record wallet ledger entry");
  }

  const { error: merchantUpsertError } = await supabase
    .from("known_merchants")
    .upsert(
      { user_id: approval.user_id, merchant: approval.merchant },
      { onConflict: "user_id,merchant" },
    );
  if (merchantUpsertError) {
    await stripeMock.drain({ user_id: approval.user_id, reason: "approval_rollback_merchant" });
    return fail(500, "Failed to upsert known merchant");
  }

  const { error: approvalUpdateError } = await supabase
    .from("approvals")
    .update({ status: "approved", resolved_at: new Date().toISOString() })
    .eq("id", approval.id);
  if (approvalUpdateError) {
    await stripeMock.drain({ user_id: approval.user_id, reason: "approval_rollback_approval" });
    return fail(500, "Failed to finalize approval status");
  }

  // Fetch full card details to return inline
  const card = await stripeMock.getCard(approval.user_id);
  if (!card) {
    return fail(500, "Card not found after approval");
  }

  return {
    ok: true,
    result: {
      status: "approved",
      transaction_id: txn.id,
      topup_id: topUpResult.topup_id,
      card_last4: walletRow.card_last4,
      card: {
        card_id: card.id,
        number: card.number,
        exp_month: String(card.exp_month).padStart(2, "0"),
        exp_year: String(card.exp_year),
        cvc: card.cvc,
        brand: card.brand,
        spending_limit: card.spending_limit,
        currency: card.currency,
      },
    },
  };
}

