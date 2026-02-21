import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { wallet } from "@/lib/stripe";

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
    const drainResult = await wallet.drain({
      user_id: userId,
      reason: success ? "checkout_success" : "checkout_failed",
    });

    // Update the topup session
    await supabase
      .from("topup_sessions")
      .update({
        status: success ? "completed" : "drained",
        drain_reason: success ? "checkout_success" : "checkout_failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    // Update wallet balance
    await supabase
      .from("wallets")
      .update({ balance: 0 })
      .eq("user_id", userId);

    // If checkout failed, mark the transaction as cancelled
    if (!success && session.transaction_id) {
      await supabase
        .from("transactions")
        .update({ status: "cancelled" })
        .eq("id", session.transaction_id)
        .eq("user_id", userId);
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
