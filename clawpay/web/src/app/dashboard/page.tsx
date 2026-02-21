"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Transaction, Config, Wallet, TopUpSession } from "@/lib/types";
import { SpendingChart } from "@/components/spending-chart";

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [activeTopUp, setActiveTopUp] = useState<TopUpSession | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [txRes, cfgRes, walletRes, topupRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("configs")
          .select("*")
          .eq("user_id", user.id)
          .single(),
        supabase
          .from("wallets")
          .select("*")
          .eq("user_id", user.id)
          .single(),
        supabase
          .from("topup_sessions")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),
      ]);

      if (txRes.data) setTransactions(txRes.data);
      if (cfgRes.data) setConfig(cfgRes.data);
      if (walletRes.data) setWallet(walletRes.data);
      if (topupRes.data) setActiveTopUp(topupRes.data);
      setLoading(false);
    }
    load();

    // Real-time subscription for new transactions
    const channel = supabase
      .channel("transactions-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          setTransactions((prev) => [payload.new as Transaction, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totalSpent = transactions
    .filter((t) => t.status === "completed")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const todaySpent = transactions
    .filter((t) => {
      if (t.status !== "completed") return false;
      const today = new Date().toISOString().slice(0, 10);
      return t.created_at.slice(0, 10) === today;
    })
    .reduce((sum, t) => sum + Number(t.amount), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#86868b]">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Spending Overview</h1>

      {/* Wallet status widget */}
      {wallet && (
        <div
          className={`rounded-2xl p-6 transition-all ${
            activeTopUp
              ? "bg-[#fff8e1] shadow-[0_2px_12px_rgba(255,159,10,0.12)]"
              : "bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#86868b]">Virtual Card</p>
              <p className="font-mono text-lg mt-1 font-medium">
                {wallet.card_brand.toUpperCase()} &bull;&bull;&bull;&bull; {wallet.card_last4}
              </p>
            </div>
            <div className="text-right">
              {activeTopUp ? (
                <>
                  <p className="text-[#ff9f0a] font-semibold">
                    FUNDED &mdash; ${Number(activeTopUp.amount).toFixed(2)}
                  </p>
                  <p className="text-xs text-[#86868b] mt-1">
                    Auto-drains {new Date(activeTopUp.expires_at).toLocaleTimeString()}
                  </p>
                </>
              ) : (
                <p className="text-[#34c759] font-semibold">IDLE &mdash; $0.00</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6">
          <p className="text-sm text-[#86868b]">Today</p>
          <p className="text-3xl font-semibold mt-2 tracking-tight">${todaySpent.toFixed(2)}</p>
          {config && (
            <p className="text-sm text-[#aeaeb2] mt-1">
              of ${Number(config.daily_limit).toFixed(2)} daily limit
            </p>
          )}
        </div>
        <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6">
          <p className="text-sm text-[#86868b]">All Time</p>
          <p className="text-3xl font-semibold mt-2 tracking-tight">${totalSpent.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6">
          <p className="text-sm text-[#86868b]">Transactions</p>
          <p className="text-3xl font-semibold mt-2 tracking-tight">{transactions.length}</p>
        </div>
      </div>

      <SpendingChart transactions={transactions} />

      <div>
        <h2 className="text-xl font-semibold mb-4 tracking-tight">Recent Transactions</h2>
        {transactions.length === 0 ? (
          <p className="text-[#86868b]">
            No transactions yet. Your purchases will appear here.
          </p>
        ) : (
          <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] divide-y divide-black/[0.06]">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-5">
                <div>
                  <p className="font-medium">{tx.item}</p>
                  <p className="text-sm text-[#86868b]">
                    {tx.merchant} &middot;{" "}
                    {new Date(tx.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`font-semibold ${
                      tx.status === "completed"
                        ? "text-[#1d1d1f]"
                        : tx.status === "rejected"
                          ? "text-[#ff3b30]"
                          : "text-[#aeaeb2]"
                    }`}
                  >
                    ${Number(tx.amount).toFixed(2)}
                  </p>
                  <p className="text-xs text-[#aeaeb2] capitalize">{tx.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
