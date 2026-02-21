import { NextRequest, NextResponse } from "next/server";
<<<<<<< HEAD
import { resolveApproval } from "@/lib/approval-service";
import { getUserFromApiToken } from "@/lib/supabase-admin";
=======
import { createClient as createServerClient } from "@supabase/supabase-js";
import { stripeMock } from "@/lib/stripe-mock";

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function getUserFromToken(token: string) {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("pairing_codes")
    .select("user_id")
    .eq("api_token", token)
    .eq("used", true)
    .single();
  return data?.user_id ?? null;
}
>>>>>>> 5430eb8 (ux changes)

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 },
      );
    }

    const userId = await getUserFromApiToken(token);
    if (!userId) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { approval_token, approved } = body;

    if (!approval_token || typeof approved !== "boolean") {
      return NextResponse.json(
        { error: "Missing approval_token or approved (boolean)" },
        { status: 400 },
      );
    }

<<<<<<< HEAD
    const outcome = await resolveApproval({
      approvalToken: approval_token,
      approved,
      expectedUserId: userId,
=======
    const supabase = getAdminClient();

    // Fetch the approval
    const { data: approval } = await supabase
      .from("approvals")
      .select("*")
      .eq("token", approval_token)
      .eq("user_id", userId)
      .eq("status", "pending")
      .single();

    if (!approval) {
      return NextResponse.json(
        { error: "Approval not found or already resolved" },
        { status: 404 },
      );
    }

    // Check expiry
    if (new Date(approval.expires_at) < new Date()) {
      await supabase
        .from("approvals")
        .update({ status: "expired", resolved_at: new Date().toISOString() })
        .eq("id", approval.id);

      return NextResponse.json(
        { error: "Approval has expired" },
        { status: 410 },
      );
    }

    if (!approved) {
      // Rejected by user
      await supabase
        .from("approvals")
        .update({ status: "rejected", resolved_at: new Date().toISOString() })
        .eq("id", approval.id);

      await supabase.from("transactions").insert({
        user_id: userId,
        item: approval.item,
        amount: approval.amount,
        currency: approval.currency,
        merchant: approval.merchant,
        category: approval.category,
        status: "rejected",
        rejection_reason: "Rejected by user",
      });

      return NextResponse.json({ status: "rejected" });
    }

    // Approved: top up the persistent card
    const { data: walletRow } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (!walletRow) {
      return NextResponse.json(
        { error: "No wallet provisioned" },
        { status: 400 },
      );
    }

    // Check wallet balance
    if (Number(walletRow.balance) < approval.amount) {
      return NextResponse.json(
        {
          error: `Insufficient wallet balance. Current balance: $${Number(walletRow.balance).toFixed(2)}, purchase amount: $${Number(approval.amount).toFixed(2)}. Add funds first.`,
        },
        { status: 400 },
      );
    }

    const topUpResult = await stripeMock.topUp({
      user_id: userId,
      amount: approval.amount,
      transaction_id: "",
      timeout_seconds: 120,
>>>>>>> 5430eb8 (ux changes)
    });

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }

<<<<<<< HEAD
    return NextResponse.json(outcome.result);
=======
    // Record transaction
    const { data: txn } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
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

    // Create topup session
    await supabase.from("topup_sessions").insert({
      user_id: userId,
      wallet_id: walletRow.id,
      transaction_id: txn!.id,
      topup_id: topUpResult.topup_id,
      amount: approval.amount,
      status: "active",
      expires_at: new Date(topUpResult.expires_at * 1000).toISOString(),
    });

    // Deduct from wallet balance
    const newBalance = Number(walletRow.balance) - Number(approval.amount);
    await supabase
      .from("wallets")
      .update({ balance: newBalance })
      .eq("id", walletRow.id);

    // Record ledger entry
    await supabase.from("wallet_ledger").insert({
      user_id: userId,
      wallet_id: walletRow.id,
      type: "purchase_debit",
      amount: approval.amount,
      balance_after: newBalance,
      reference_id: txn!.id,
      description: `Purchase: ${approval.item} from ${approval.merchant}`,
    });

    // Track merchant as known
    await supabase
      .from("known_merchants")
      .upsert(
        { user_id: userId, merchant: approval.merchant },
        { onConflict: "user_id,merchant" },
      );

    return NextResponse.json({
      status: "approved",
      transaction_id: txn!.id,
      topup_id: topUpResult.topup_id,
      card_last4: walletRow.card_last4,
    });
>>>>>>> 5430eb8 (ux changes)
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

