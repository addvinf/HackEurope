"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setSubmitted(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] flex flex-col items-center justify-center px-4">
      <Link href="/" className="mb-10">
        <img src="/clawbotlogo.png" alt="ClawPay" className="h-10" />
      </Link>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.08)] p-8">
        <h2 className="text-xl font-semibold mb-2 text-center">
          Reset your password
        </h2>
        <p className="text-[#86868b] text-sm text-center mb-6">
          Enter your email and we&apos;ll send you a reset link.
        </p>

        {submitted ? (
          <div className="text-center">
            <p className="text-[#34c759] text-sm mb-4">
              Check your email for a password reset link.
            </p>
            <Link
              href="/login"
              className="text-[#0071e3] hover:text-[#0077ed] text-sm font-medium"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-[#f5f5f7] border border-transparent rounded-xl text-[#1d1d1f] placeholder-[#aeaeb2] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all"
              />

              {error && (
                <p className="text-[#ff3b30] text-sm">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>

            <p className="text-center text-[#86868b] text-sm mt-6">
              <Link
                href="/login"
                className="text-[#0071e3] hover:text-[#0077ed] font-medium"
              >
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
