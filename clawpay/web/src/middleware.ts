import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const ALLOWED_ORIGINS = [
  "https://clawpay.tech",
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

export async function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");

  // Handle CORS preflight directly — return before any other processing
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  // API routes use Bearer token auth, not session cookies.
  // Skip Supabase session handling so middleware doesn't interfere with
  // server-to-server calls (e.g. OpenClaw's Python plugin installer).
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const response = NextResponse.next({ request });
    // Attach CORS headers so browser and non-browser clients both work
    const cors = corsHeaders(origin);
    for (const [key, value] of Object.entries(cors)) {
      response.headers.set(key, value);
    }
    return response;
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
