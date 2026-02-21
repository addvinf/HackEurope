import { NextRequest, NextResponse } from "next/server";
import { resolveApproval } from "@/lib/approval-service";
import { getUserFromApiToken } from "@/lib/supabase-admin";

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

    const userId = await getUserFromApiToken(token);
    if (!userId) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { approved } = body;

    if (typeof approved !== "boolean") {
      return NextResponse.json(
        { error: "Missing approved (boolean)" },
        { status: 400 },
      );
    }

    const outcome = await resolveApproval({
      approved,
      userId,
    });

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }

    return NextResponse.json(outcome.result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[clawpay] /api/approve failed: ${message}`);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
