"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PairingCodeDisplay } from "@/components/pairing-code";

export default function PairPage() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function generateCode() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const newCode = String(Math.floor(100000 + Math.random() * 900000));
    const apiToken = crypto.randomUUID().replace(/-/g, "");
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await supabase.from("pairing_codes").insert({
      user_id: user.id,
      code: newCode,
      api_token: apiToken,
      expires_at: expires,
    });

    if (!error) {
      setCode(newCode);
      setExpiresAt(expires);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-md mx-auto space-y-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Pair with OpenClaw</h1>
      <p className="text-[#86868b] leading-relaxed">
        Generate a 6-digit code, then tell your OpenClaw agent:
        <br />
        <span className="text-[#1d1d1f] font-mono font-medium">
          &ldquo;set up clawpay with code XXXXXX&rdquo;
        </span>
      </p>

      {code && expiresAt ? (
        <PairingCodeDisplay code={code} expiresAt={expiresAt} />
      ) : (
        <button
          onClick={generateCode}
          disabled={loading}
          className="bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white font-medium px-8 py-3 rounded-full transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          {loading ? "Generating..." : "Generate pairing code"}
        </button>
      )}

      {code && (
        <button
          onClick={() => {
            setCode(null);
            setExpiresAt(null);
          }}
          className="text-[#0071e3] hover:text-[#0077ed] font-medium text-sm"
        >
          Generate a new code
        </button>
      )}
    </div>
  );
}
