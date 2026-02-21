import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

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
    const {
      item,
      amount,
      currency = "USD",
      merchant,
      merchant_url,
      category,
      charge_id,
      status = "completed",
    } = body;

    if (!item || !amount || !merchant) {
      return NextResponse.json(
        { error: "Missing required fields: item, amount, merchant" },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    const { data: txn, error } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        item,
        amount,
        currency,
        merchant,
        merchant_url,
        category,
        charge_id,
        status,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to record transaction" },
        { status: 500 },
      );
    }

    return NextResponse.json({ transaction: txn });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
