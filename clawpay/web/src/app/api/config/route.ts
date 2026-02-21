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

    const supabase = getAdminClient();

    const { data: config } = await supabase
      .from("configs")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!config) {
      // Return defaults if no config exists
      return NextResponse.json({
        always_ask: true,
        per_purchase_limit: 50,
        daily_limit: 150,
        monthly_limit: 500,
        num_purchase_limit: 25,
        blocked_categories: [],
        allowed_categories: [],
        approval_channel: "whatsapp",
        telegram_chat_id: null,
        approval_timeout_seconds: 300,
        block_new_merchants: true,
        block_international: false,
        night_pause: false,
        send_receipts: true,
        weekly_summary: true,
      });
    }

    return NextResponse.json(config);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
