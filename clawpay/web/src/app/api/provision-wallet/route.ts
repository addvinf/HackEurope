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
 * POST /api/provision-wallet
 *
 * Provisions a persistent virtual card for the authenticated user.
 * Called once during setup — idempotent (returns existing wallet if already provisioned).
 *
 * Body: { user_id: string } (from authenticated session)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient();

    // Authenticate via Supabase session cookie
    const authHeader = request.headers.get("authorization");
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      // Plugin-style auth via pairing token
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabase
        .from("pairing_codes")
        .select("user_id")
        .eq("api_token", token)
        .eq("used", true)
        .single();
      userId = data?.user_id ?? null;
    } else {
      // Dashboard-style auth: expect user_id in body
      const body = await request.json().catch(() => ({}));
      userId = body.user_id ?? null;
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Missing or invalid authentication" },
        { status: 401 },
      );
    }

    // Check if wallet already exists
    const { data: existingWallet } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (existingWallet) {
      return NextResponse.json({
        wallet_id: existingWallet.id,
        card_id: existingWallet.card_id,
        card_last4: existingWallet.card_last4,
        card_brand: existingWallet.card_brand,
        status: existingWallet.status,
        already_existed: true,
      });
    }

    // Provision a new persistent card via mock wallet
    const card = await stripeMock.provisionCard({ user_id: userId });

    // Store wallet in database
    const { data: walletRow, error } = await supabase
      .from("wallets")
      .insert({
        user_id: userId,
        card_id: card.id,
        card_last4: card.last4,
        card_brand: card.brand,
        balance: 0,
        currency: card.currency,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to create wallet" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      wallet_id: walletRow!.id,
      card_id: card.id,
      card_last4: card.last4,
      card_brand: card.brand,
      status: "active",
      already_existed: false,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
