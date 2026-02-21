"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Transaction, Config, Wallet, TopUpSession, WalletLedgerEntry } from "@/lib/types";
import { SpendingChart } from "@/components/spending-chart";

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [activeTopUp, setActiveTopUp] = useState<TopUpSession | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Deposit modal state
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState<number | "">("");
  const [depositing, setDepositing] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);

  // Wallet provisioning state
  const [provisioning, setProvisioning] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [txRes, cfgRes, walletRes, topupRes, ledgerRes] = await Promise.all([
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
        supabase
          .from("wallet_ledger")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      if (txRes.data) setTransactions(txRes.data);
      if (cfgRes.data) setConfig(cfgRes.data);
      if (walletRes.data) setWallet(walletRes.data);
      if (topupRes.data) setActiveTopUp(topupRes.data);
      if (ledgerRes.data) setLedger(ledgerRes.data);
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

  async function handleDeposit() {
    if (!depositAmount || depositAmount <= 0 || !wallet) return;

    setDepositing(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const res = await fetch("/api/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, amount: depositAmount }),
      });

      if (res.ok) {
        const data = await res.json();
        setWallet((prev) => prev ? { ...prev, balance: data.new_balance } : prev);
        setDepositSuccess(true);

        // Refresh ledger
        const ledgerRes = await supabase
          .from("wallet_ledger")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (ledgerRes.data) setLedger(ledgerRes.data);

        // Auto-close after 1.5s
        setTimeout(() => {
          setShowDepositModal(false);
          setDepositSuccess(false);
          setDepositAmount("");
        }, 1500);
      }
    } finally {
      setDepositing(false);
    }
  }

  async function handleProvisionWallet() {
    setProvisioning(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const res = await fetch("/api/provision-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });

      if (res.ok) {
        // Refetch wallet from DB to get the full row
        const { data: walletRow } = await supabase
          .from("wallets")
          .select("*")
          .eq("user_id", user.id)
          .single();
        if (walletRow) setWallet(walletRow);
      }
    } finally {
      setProvisioning(false);
    }
  }

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
    return <div className="h-64" />;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Spending Overview</h1>

      {/* Wallet + Card balance widgets */}
      {wallet ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left card — Wallet Balance */}
          <div className="rounded-2xl p-6 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="flex flex-col justify-between h-full">
              <div>
                <p className="text-sm text-[#86868b]">Wallet Balance</p>
                <p className="text-4xl font-semibold mt-1 tracking-tight">
                  ${Number(wallet.balance).toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setShowDepositModal(true)}
                className="mt-4 px-5 py-2.5 bg-[#0071e3] text-white rounded-xl text-sm font-medium hover:bg-[#0077ED] transition-colors self-start"
              >
                Add funds
              </button>
            </div>
          </div>

          {/* Right card — Virtual Card */}
          <div
            className={`rounded-2xl p-6 transition-all ${
              activeTopUp
                ? "bg-[#fff8e1] shadow-[0_2px_12px_rgba(255,159,10,0.12)]"
                : "bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
            }`}
          >
            <div className="flex flex-col justify-between h-full">
              <div>
                <p className="text-sm text-[#86868b]">Virtual Card</p>
                <p className="text-4xl font-semibold mt-1 tracking-tight">
                  ${activeTopUp ? Number(activeTopUp.amount).toFixed(2) : "0.00"}
                </p>
                <div className="flex items-center gap-1.5 font-mono text-sm mt-2 text-[#86868b]">
                  {wallet.card_brand === "visa" ? (
                    <img src="/visa-logo.png" alt="Visa" className="h-4 opacity-50" />
                  ) : (
                    <span>{wallet.card_brand.toUpperCase()}</span>
                  )}
                  <span>&bull;&bull;&bull;&bull; {wallet.card_last4}</span>
                </div>
              </div>
              <div className="mt-4">
                {activeTopUp ? (
                  <div>
                    <p className="text-[#ff9f0a] font-semibold text-sm">
                      PURCHASE IN PROGRESS
                    </p>
                    <p className="text-xs text-[#86868b] mt-1">
                      Drains {new Date(activeTopUp.expires_at).toLocaleTimeString()}
                    </p>
                  </div>
                ) : (
                  <p className="text-[#34c759] font-semibold text-sm">IDLE</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-6 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#86868b]">Wallet</p>
              <p className="text-lg font-medium mt-1">No wallet yet</p>
              <p className="text-sm text-[#86868b] mt-1">
                Provision a virtual card to start adding funds.
              </p>
            </div>
            <button
              onClick={handleProvisionWallet}
              disabled={provisioning}
              className="px-5 py-2.5 bg-[#0071e3] text-white rounded-xl text-sm font-medium hover:bg-[#0077ED] transition-colors disabled:opacity-50"
            >
              {provisioning ? "Setting up..." : "Set up wallet"}
            </button>
          </div>
        </div>
      )}

      {/* Stripe Checkout modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => { setShowDepositModal(false); setDepositAmount(""); }}
          />

          <div className="relative w-full max-w-[820px] mx-4 rounded-xl overflow-hidden shadow-[0_30px_60px_-12px_rgba(50,50,93,0.25),0_18px_36px_-18px_rgba(0,0,0,0.3)] flex flex-col sm:flex-row min-h-[480px]">
            {depositSuccess ? (
              <div className="flex-1 bg-white flex flex-col items-center justify-center py-16 px-8">
                <div className="w-16 h-16 bg-[#635bff]/10 rounded-full flex items-center justify-center mb-5">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="#635bff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-xl font-semibold text-[#1a1f36]">Payment successful!</p>
                <p className="text-sm text-[#697386] mt-2">Your wallet has been funded.</p>
              </div>
            ) : (
              <>
                {/* Left panel — order summary (dark) */}
                <div className="sm:w-[320px] bg-[#1a1f36] text-white px-8 py-8 flex flex-col justify-between">
                  <div>
                    {/* Back / close */}
                    <button
                      onClick={() => { setShowDepositModal(false); setDepositAmount(""); }}
                      className="flex items-center gap-1.5 text-[#a3acb9] hover:text-white text-sm mb-8 transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Back
                    </button>

                    {/* Merchant */}
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-full bg-[#635bff] flex items-center justify-center text-white font-bold text-sm">
                        CP
                      </div>
                      <div>
                        <p className="font-semibold text-[15px]">ClawPay</p>
                        <p className="text-xs text-[#a3acb9]">Wallet top-up</p>
                      </div>
                    </div>

                    {/* Amount display */}
                    <p className="text-4xl font-semibold tracking-tight mb-1">
                      {depositAmount ? `$${Number(depositAmount).toFixed(2)}` : "$0.00"}
                    </p>
                    <p className="text-sm text-[#a3acb9] mb-8">One-time payment</p>

                    {/* Line items */}
                    <div className="border-t border-white/10 pt-4 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-[#a3acb9]">Wallet deposit</span>
                        <span>{depositAmount ? `$${Number(depositAmount).toFixed(2)}` : "--"}</span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-white/10 pt-3">
                        <span className="font-medium">Total due</span>
                        <span className="font-medium">{depositAmount ? `$${Number(depositAmount).toFixed(2)}` : "$0.00"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Powered by Stripe */}
                  <div className="flex items-center gap-1.5 mt-8">
                    <span className="text-xs text-[#697386]">Powered by</span>
                    <img src="/stripe-logo.png" alt="Stripe" className="h-4 brightness-0 invert opacity-30" />
                  </div>
                </div>

                {/* Right panel — payment form (light) */}
                <div className="flex-1 bg-[#f6f9fc] px-8 py-8 flex flex-col">
                  {/* Test mode badge */}
                  <div className="flex justify-end mb-4">
                    <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#ff7b00]/10 text-[#c26200] px-2 py-0.5 rounded">
                      Test mode
                    </span>
                  </div>

                  <div className="flex-1">
                    {/* Amount selection */}
                    <div className="mb-5">
                      <label className="text-[13px] font-medium text-[#1a1f36] block mb-2">Select amount</label>
                      <div className="grid grid-cols-4 gap-2">
                        {[25, 50, 100, 250].map((preset) => (
                          <button
                            key={preset}
                            onClick={() => setDepositAmount(preset)}
                            className={`py-2.5 rounded-md text-sm font-medium transition-all border ${
                              depositAmount === preset
                                ? "bg-[#635bff] text-white border-[#635bff] shadow-[0_1px_3px_rgba(99,91,255,0.3)]"
                                : "bg-white text-[#1a1f36] border-[#e3e8ee] hover:border-[#b4b4c7] shadow-[0_1px_1px_rgba(0,0,0,0.03)]"
                            }`}
                          >
                            ${preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom amount */}
                    <div className="mb-6">
                      <label className="text-[13px] font-medium text-[#1a1f36] block mb-2">Or enter custom amount</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#697386] text-sm">$</span>
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          step="0.01"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value ? Number(e.target.value) : "")}
                          placeholder="0.00"
                          className="w-full pl-7 pr-4 py-2.5 rounded-md border border-[#e3e8ee] bg-white focus:outline-none focus:border-[#635bff] focus:ring-2 focus:ring-[#635bff]/20 text-[15px] text-[#1a1f36] placeholder-[#a3acb9] transition-all shadow-[0_1px_1px_rgba(0,0,0,0.03)]"
                        />
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-[#e3e8ee] my-5" />

                    {/* Simulated card info (read-only, looks like Stripe) */}
                    {wallet && (
                      <div className="mb-6">
                        <label className="text-[13px] font-medium text-[#1a1f36] block mb-2">Payment method</label>
                        <div className="bg-white border border-[#e3e8ee] rounded-md px-3 py-3 flex items-center gap-3 shadow-[0_1px_1px_rgba(0,0,0,0.03)]">
                          {wallet.card_brand === "visa" ? (
                            <div className="w-8 h-5 bg-white border border-[#e3e8ee] rounded-sm flex items-center justify-center">
                              <img src="/visa-logo.png" alt="Visa" className="h-3" />
                            </div>
                          ) : (
                            <div className="w-8 h-5 bg-[#1a1f36] rounded-sm flex items-center justify-center">
                              <span className="text-[8px] text-white font-bold">{wallet.card_brand.toUpperCase()}</span>
                            </div>
                          )}
                          <span className="text-sm text-[#1a1f36]">
                            &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; {wallet.card_last4}
                          </span>
                          <span className="text-xs text-[#697386] ml-auto">Default</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pay button */}
                  <button
                    onClick={handleDeposit}
                    disabled={!depositAmount || depositAmount <= 0 || depositing}
                    className="w-full py-3 bg-[#635bff] text-white rounded-md font-semibold text-sm hover:bg-[#5851ea] active:bg-[#4f46e5] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_1px_3px_rgba(99,91,255,0.4),0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-center gap-2"
                  >
                    {depositing ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Processing...
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
                          <path d="M8 11V7a4 4 0 118 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        {depositAmount
                          ? `Pay $${Number(depositAmount).toFixed(2)}`
                          : "Enter an amount"}
                      </>
                    )}
                  </button>

                  {/* Footer links like real Stripe */}
                  <div className="flex items-center justify-center gap-3 mt-4 text-[11px] text-[#697386]">
                    <span>Terms</span>
                    <span>&middot;</span>
                    <span>Privacy</span>
                  </div>
                </div>
              </>
            )}
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

      {/* Wallet Activity */}
      {ledger.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4 tracking-tight">Wallet Activity</h2>
          <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] divide-y divide-black/[0.06]">
            {ledger.map((entry) => {
              const isCredit = entry.type === "deposit" || entry.type === "refund";
              return (
                <div key={entry.id} className="flex items-center justify-between p-5">
                  <div>
                    <p className="font-medium">
                      {entry.type === "deposit"
                        ? "Deposit"
                        : entry.type === "refund"
                          ? "Refund"
                          : "Purchase"}
                    </p>
                    <p className="text-sm text-[#86868b]">
                      {entry.description || entry.type} &middot;{" "}
                      {new Date(entry.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-semibold ${
                        isCredit ? "text-[#34c759]" : "text-[#1d1d1f]"
                      }`}
                    >
                      {isCredit ? "+" : "-"}${Number(entry.amount).toFixed(2)}
                    </p>
                    <p className="text-xs text-[#aeaeb2]">
                      bal ${Number(entry.balance_after).toFixed(2)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                        : tx.status === "authorized"
                          ? "text-[#ff9f0a]"
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
