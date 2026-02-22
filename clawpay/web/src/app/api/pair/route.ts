import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// In-memory rate limiting (resets on deploy — acceptable for hackathon)
const failedAttempts = new Map<string, { count: number; firstAttempt: number }>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FAILED_ATTEMPTS = 5;

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const entry = failedAttempts.get(ip);
  if (!entry) return false;

  // Window expired — clear and allow
  if (Date.now() - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    failedAttempts.delete(ip);
    return false;
  }

  return entry.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(ip: string): void {
  const entry = failedAttempts.get(ip);
  const now = Date.now();

  if (!entry || now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    failedAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    entry.count++;
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many failed attempts. Try again later." },
        { status: 429 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body — expected JSON with { code: \"XXXXXX\" }" },
        { status: 400 },
      );
    }
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
      recordFailedAttempt(ip);
      return NextResponse.json(
        { error: "Invalid or expired pairing code" },
        { status: 404 },
      );
    }

    // Check expiry
    if (new Date(pairing.expires_at) < new Date()) {
      recordFailedAttempt(ip);
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
