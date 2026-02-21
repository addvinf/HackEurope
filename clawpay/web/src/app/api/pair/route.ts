import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid pairing code" },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    // Look up the pairing code
    const { data: pairing, error } = await supabase
      .from("pairing_codes")
      .select("*")
      .eq("code", code.trim())
      .eq("used", false)
      .single();

    if (error || !pairing) {
      return NextResponse.json(
        { error: "Invalid or expired pairing code" },
        { status: 404 },
      );
    }

    // Check expiry
    if (new Date(pairing.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Pairing code has expired" },
        { status: 410 },
      );
    }

    // Mark as used
    await supabase
      .from("pairing_codes")
      .update({ used: true })
      .eq("id", pairing.id);

    return NextResponse.json({
      api_token: pairing.api_token,
      user_id: pairing.user_id,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
