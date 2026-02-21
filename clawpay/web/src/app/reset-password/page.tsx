"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 2000);
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
          Set new password
        </h2>
        <p className="text-[#86868b] text-sm text-center mb-6">
          Enter your new password below.
        </p>

        {success ? (
          <div className="text-center">
            <p className="text-[#34c759] text-sm">
              Password updated! Redirecting to dashboard...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 bg-[#f5f5f7] border border-transparent rounded-xl text-[#1d1d1f] placeholder-[#aeaeb2] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
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
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
