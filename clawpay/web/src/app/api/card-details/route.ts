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
 * GET /api/card-details
 *
 * Returns the persistent virtual card details for CDP injection,
 * but ONLY if the user has an active top-up session (card is funded).
 *
 * SECURITY: This endpoint returns sensitive card data. It is ONLY called by
 * the ClawPay plugin process. The card details go directly to the browser
 * via CDP — they NEVER pass through the LLM context window.
 */
export async function GET(request: NextRequest) {
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

    // Check for active top-up — card details only available while funded
    if (!stripeMock.hasActiveTopUp(userId)) {
      return NextResponse.json(
        { error: "No active top-up session. Card is at $0." },
        { status: 403 },
      );
    }

    const card = stripeMock.getCard(userId);
    if (!card) {
      return NextResponse.json(
        { error: "No wallet provisioned" },
        { status: 404 },
      );
    }

    // Return full card details for CDP injection
    return NextResponse.json({
      card_id: card.id,
      number: card.number,
      exp_month: String(card.exp_month).padStart(2, "0"),
      exp_year: String(card.exp_year),
      cvc: card.cvc,
      brand: card.brand,
      spending_limit: card.spending_limit,
      currency: card.currency,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
