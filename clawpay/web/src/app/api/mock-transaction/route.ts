import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

const MOCK_TOKEN = "test_1234";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (token !== MOCK_TOKEN) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { card_details, purchase_details } = body;

    if (!card_details || !purchase_details) {
      return NextResponse.json(
        { error: "Missing required fields: card_details, purchase_details" },
        { status: 400 },
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
        { status: 500 },
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
