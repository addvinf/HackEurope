import { NextRequest, NextResponse } from "next/server";
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

/**
 * POST /api/drain
 *
 * Drains the user's persistent card back to $0 after checkout.
 * Called by the plugin's clawpay_complete tool.
 *
 * Body: { topup_id: string, success: boolean }
 */
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

    const userId = await getUserFromToken(token);
    if (!userId) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { topup_id, success } = body;

    if (!topup_id || typeof success !== "boolean") {
      return NextResponse.json(
        { error: "Missing topup_id or success (boolean)" },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    // Expire any stale topup_sessions for this user (safety cleanup)
    await supabase
      .from("topup_sessions")
      .update({
        status: "drained",
        drain_reason: "stale_cleanup",
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString());

    // Find the active topup session
    const { data: session } = await supabase
      .from("topup_sessions")
      .select("*")
      .eq("topup_id", topup_id)
      .eq("user_id", userId)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: "Top-up session not found" },
        { status: 404 },
      );
    }

    if (session.status !== "active") {
      return NextResponse.json({
        status: "already_drained",
        drain_reason: session.drain_reason,
      });
    }

    // Drain the card
    const drainResult = await stripeMock.drain({
      user_id: userId,
      reason: success ? "checkout_success" : "checkout_failed",
    });

    // Update the topup session
    const { error: topupUpdateError } = await supabase
      .from("topup_sessions")
      .update({
        status: success ? "completed" : "drained",
        drain_reason: success ? "checkout_success" : "checkout_failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", session.id);
    if (topupUpdateError) {
      return NextResponse.json(
        { error: "Failed to finalize top-up session" },
        { status: 500 },
      );
    }

    // Settlement status is finalized by drain outcome.
    if (session.transaction_id) {
      const { error: txUpdateError } = await supabase
        .from("transactions")
        .update({ status: success ? "completed" : "cancelled" })
        .eq("id", session.transaction_id)
        .eq("user_id", userId);
      if (txUpdateError) {
        return NextResponse.json(
          { error: "Failed to finalize transaction status" },
          { status: 500 },
        );
      }
    }

    // Refund leftover balance back to the wallet
    const refundAmount = success
      ? drainResult.drained_amount                 // leftover on card after checkout
      : Number(session.amount);                     // full amount if checkout failed

    if (refundAmount > 0 && session.transaction_id) {
      const { data: walletRow } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (walletRow) {
        const newBalance = Number(walletRow.balance) + refundAmount;

        await supabase
          .from("wallets")
          .update({ balance: newBalance })
          .eq("id", walletRow.id);

        await supabase.from("wallet_ledger").insert({
          user_id: userId,
          wallet_id: walletRow.id,
          type: "refund",
          amount: refundAmount,
          balance_after: newBalance,
          reference_id: session.transaction_id,
          description: success
            ? `Refund — unused card balance ($${refundAmount.toFixed(2)} of $${Number(session.amount).toFixed(2)} top-up)`
            : "Refund — checkout failed",
        });
      }
    }

    return NextResponse.json({
      status: "drained",
      drained_amount: drainResult.drained_amount,
      reason: drainResult.reason,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
