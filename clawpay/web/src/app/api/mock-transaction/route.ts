import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

const MOCK_TOKEN = "test_1234";

const ALLOWED_ORIGINS = [
  "https://clawpay.tech",
  "https://www.clawpay.tech",
  "https://webshop.clawpay.tech",
];

function corsHeaders(origin: string | null) {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (token !== MOCK_TOKEN) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders(origin) },
      );
    }

    const body = await request.json();
    const { card_details, purchase_details } = body;

    if (!card_details || !purchase_details) {
      return NextResponse.json(
        { error: "Missing required fields: card_details, purchase_details" },
        { status: 400, headers: corsHeaders(origin) },
      );
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("mock_transactions")
      .insert({ card_details, purchase_details })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to insert mock transaction" },
        { status: 500, headers: corsHeaders(origin) },
      );
    }

    return NextResponse.json(data, { headers: corsHeaders(origin) });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}
