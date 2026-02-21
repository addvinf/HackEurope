import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { stripeMock } from "@/lib/stripe-mock";

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * POST /api/deposit
 *
 * Deposits funds into the user's wallet (mock Stripe Checkout).
 * Body: { user_id: string, amount: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, amount } = body;

    if (!user_id || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, amount" },
        { status: 400 },
      );
    }

    if (typeof amount !== "number" || amount <= 0 || amount > 10000) {
      return NextResponse.json(
        { error: "Amount must be a positive number up to $10,000" },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    // Verify wallet exists and is active
    const { data: walletRow } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", user_id)
      .eq("status", "active")
      .single();

    if (!walletRow) {
      return NextResponse.json(
        { error: "No active wallet found. Provision a wallet first." },
        { status: 400 },
      );
    }

    // Call mock/real Stripe deposit
    const depositResult = await stripeMock.deposit({ user_id, amount });

    // Update wallet balance (atomic increment)
    const newBalance = Number(walletRow.balance) + amount;
    await supabase
      .from("wallets")
      .update({ balance: newBalance })
      .eq("id", walletRow.id);

    // Insert ledger entry
    await supabase.from("wallet_ledger").insert({
      user_id,
      wallet_id: walletRow.id,
      type: "deposit",
      amount,
      balance_after: newBalance,
      reference_id: depositResult.checkout_session_id,
      description: `Deposit of $${amount.toFixed(2)}`,
    });

    return NextResponse.json({
      checkout_session_id: depositResult.checkout_session_id,
      amount,
      new_balance: newBalance,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
