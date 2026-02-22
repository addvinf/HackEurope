"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Config } from "@/lib/types";

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "ClawPayBot";

interface RulesFormProps {
  config: Config;
  onSave: (updated: Partial<Config>) => Promise<void>;
  saving: boolean;
}

const PER_PURCHASE_MAX = 500;
const DAILY_LIMIT_MAX = 1000;
const MONTHLY_LIMIT_MAX = 5000;
const WEEKLY_PURCHASE_MAX = 100;

function fallbackNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeLimitValue(
  value: number | null | undefined,
  fallback: number,
  noLimitValue: number,
) {
  if (value === null) return noLimitValue;
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

function formatCurrencyLimit(value: number, noLimitValue: number) {
  return value >= noLimitValue ? "No limit" : `$${value}`;
}

export function RulesForm({ config, onSave, saving }: RulesFormProps) {
  const [alwaysAsk, setAlwaysAsk] = useState(config.always_ask ?? true);
  const [perPurchaseLimit, setPerPurchaseLimit] = useState(
    normalizeLimitValue(config.per_purchase_limit, 50, PER_PURCHASE_MAX),
  );
  const [dailyLimit, setDailyLimit] = useState(
    normalizeLimitValue(config.daily_limit, 150, DAILY_LIMIT_MAX),
  );
  const [monthlyLimit, setMonthlyLimit] = useState(
    normalizeLimitValue(config.monthly_limit, 500, MONTHLY_LIMIT_MAX),
  );
  const [numPurchaseLimit, setNumPurchaseLimit] = useState(
    normalizeLimitValue(config.num_purchase_limit, 25, WEEKLY_PURCHASE_MAX),
  );
  const [blockedCategoriesText, setBlockedCategoriesText] = useState(
    (config.blocked_categories || []).join(", "),
  );
  const [blockNewMerchants, setBlockNewMerchants] = useState(config.block_new_merchants ?? true);
  const [blockInternational, setBlockInternational] = useState(config.block_international ?? false);
  const [nightPause, setNightPause] = useState(config.night_pause ?? false);
  const [approvalChannel, setApprovalChannel] = useState(
    config.approval_channel,
  );
  const [approvalTimeout, setApprovalTimeout] = useState(
    Number(config.approval_timeout_seconds ?? 300),
  );
  const [sendReceipts, setSendReceipts] = useState(config.send_receipts ?? true);
  const [weeklySummary, setWeeklySummary] = useState(config.weekly_summary ?? true);

  /* Telegram deep-link onboarding */
  const supabase = createClient();
  const [telegramLinked, setTelegramLinked] = useState(!!config.telegram_chat_id);
  const [telegramLinking, setTelegramLinking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleConnectTelegram() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await supabase.from("telegram_link_codes").insert({
      user_id: user.id,
      code,
      expires_at: expiresAt,
    });

    window.open(`https://t.me/${TELEGRAM_BOT}?start=${code}`, "_blank");

    setTelegramLinking(true);
    pollTelegramLink(user.id);
  }

  function pollTelegramLink(userId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    const start = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - start > 5 * 60 * 1000) {
        if (pollRef.current) clearInterval(pollRef.current);
        setTelegramLinking(false);
        return;
      }
      const { data } = await supabase
        .from("configs")
        .select("telegram_chat_id")
        .eq("user_id", userId)
        .single();
      if (data?.telegram_chat_id) {
        setTelegramLinked(true);
        setTelegramLinking(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 2000);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const blockedCategories = blockedCategoriesText
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    onSave({
      always_ask: alwaysAsk,
      per_purchase_limit:
        fallbackNumber(perPurchaseLimit, 50) >= PER_PURCHASE_MAX
          ? null
          : fallbackNumber(perPurchaseLimit, 50),
      daily_limit:
        fallbackNumber(dailyLimit, 150) >= DAILY_LIMIT_MAX
          ? null
          : fallbackNumber(dailyLimit, 150),
      monthly_limit:
        fallbackNumber(monthlyLimit, 500) >= MONTHLY_LIMIT_MAX
          ? null
          : fallbackNumber(monthlyLimit, 500),
      num_purchase_limit:
        fallbackNumber(numPurchaseLimit, 25) >= WEEKLY_PURCHASE_MAX
          ? null
          : fallbackNumber(numPurchaseLimit, 25),
      blocked_categories: blockedCategories,
      block_new_merchants: blockNewMerchants,
      block_international: blockInternational,
      night_pause: nightPause,
      approval_channel: approvalChannel,
      approval_timeout_seconds: approvalTimeout,
      send_receipts: sendReceipts,
      weekly_summary: weeklySummary,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Spending limits */}
      <section className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6 space-y-5">
        <h3 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider">
          Spending Limits
        </h3>
        <div className="space-y-5">
          <Slider
            label="Per purchase limit"
            value={perPurchaseLimit}
            onChange={setPerPurchaseLimit}
            min={0}
            max={PER_PURCHASE_MAX}
            step={5}
            format={(v) => formatCurrencyLimit(v, PER_PURCHASE_MAX)}
          />
          <Slider
            label="Daily limit"
            value={dailyLimit}
            onChange={setDailyLimit}
            min={0}
            max={DAILY_LIMIT_MAX}
            step={10}
            format={(v) => formatCurrencyLimit(v, DAILY_LIMIT_MAX)}
          />
          <Slider
            label="Monthly limit"
            value={monthlyLimit}
            onChange={setMonthlyLimit}
            min={0}
            max={MONTHLY_LIMIT_MAX}
            step={50}
            format={(v) => formatCurrencyLimit(v, MONTHLY_LIMIT_MAX)}
          />
          <Slider
            label="Max purchases per week"
            value={numPurchaseLimit}
            onChange={setNumPurchaseLimit}
            min={0}
            max={WEEKLY_PURCHASE_MAX}
            step={1}
            format={(v) => (v >= WEEKLY_PURCHASE_MAX ? "No limit" : `${v}`)}
          />
          <p className="text-xs text-[#86868b]">
            Slide all the way right on any limit to set it to no limit.
          </p>
        </div>
      </section>

      {/* Safety toggles */}
      <section className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="px-6 pt-6 pb-3">
          <h3 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider">
            Safety
          </h3>
        </div>
        <div className="divide-y divide-black/[0.06]">
          <Toggle
            label="Block new merchants"
            description="Require approval for first-time merchants"
            checked={blockNewMerchants}
            onChange={setBlockNewMerchants}
          />
          <Toggle
            label="Block international"
            description="Reject purchases from non-domestic merchants"
            checked={blockInternational}
            onChange={setBlockInternational}
          />
          <Toggle
            label="Night pause"
            description="Block purchases between 11 PM and 7 AM"
            checked={nightPause}
            onChange={setNightPause}
          />
        </div>
      </section>

      {/* Approval settings */}
      <section className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="px-6 pt-6 pb-3">
          <h3 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider">
            Approval
          </h3>
        </div>
        <div className="divide-y divide-black/[0.06]">
          <div className="mx-4 my-4 rounded-xl bg-[#ff9f0a]/10 border border-[#ff9f0a]/20">
            <Toggle
              label="Always require approval"
              description="Every purchase must be manually approved"
              checked={alwaysAsk}
              onChange={setAlwaysAsk}
            />
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div>
          <label className="text-sm font-medium mb-2 block">Channel</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "whatsapp", logo: "/whatsapp-logo.svg", label: "WhatsApp" },
              { id: "telegram", logo: "/telegram-logo.png", label: "Telegram" },
              { id: "web", emoji: "🌐", label: "Web" },
            ] as const).map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setApprovalChannel(ch.id)}
                className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                  approvalChannel === ch.id
                    ? "border-[#0071e3] bg-[#0071e3]/[0.04]"
                    : "border-black/[0.06] bg-[#f5f5f7] hover:border-black/[0.12]"
                }`}
              >
                {"logo" in ch ? (
                  <img src={ch.logo} alt={ch.label} className="w-6 h-6 object-contain" />
                ) : (
                  <span className="text-2xl">{ch.emoji}</span>
                )}
                <span className="text-xs font-medium">{ch.label}</span>
                {approvalChannel === ch.id && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#0071e3] rounded-full flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
          {approvalChannel === "telegram" && (
            <div className="mt-3">
              {telegramLinked ? (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#34c759]/10 border border-[#34c759]/20">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="8" fill="#34c759" />
                    <path d="M4.5 8L7 10.5L11.5 5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-sm font-medium text-[#1d1d1f]">Telegram connected</span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleConnectTelegram}
                    disabled={telegramLinking}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#0088cc] hover:bg-[#0077b5] text-white font-medium text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
                  >
                    <img src="/telegram-logo.png" alt="" className="w-5 h-5 object-contain brightness-0 invert" />
                    {telegramLinking ? "Waiting for connection..." : "Connect Telegram"}
                  </button>
                  {telegramLinking && (
                    <p className="text-xs text-[#86868b] mt-2 text-center">
                      Press Start in Telegram, then come back here.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          </div>
          <Slider
            label="Approval timeout"
            value={approvalTimeout}
            onChange={setApprovalTimeout}
            min={60}
            max={1800}
            step={60}
            format={(v) => `${Math.floor(v / 60)} min`}
          />
          <div>
            <label className="text-sm font-medium mb-2 block">
              Blocked categories
            </label>
            <input
              type="text"
              value={blockedCategoriesText}
              onChange={(e) => setBlockedCategoriesText(e.target.value)}
              placeholder="e.g. gambling, crypto, adult"
              className="w-full px-4 py-3 bg-[#f5f5f7] border border-transparent rounded-xl text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all"
            />
            <p className="text-xs text-[#86868b] mt-2">
              Comma-separated categories to reject.
            </p>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="px-6 pt-6 pb-3">
          <h3 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider">
            Notifications
          </h3>
        </div>
        <div className="divide-y divide-black/[0.06]">
          <Toggle
            label="Send receipts"
            description="Get a message after each purchase"
            checked={sendReceipts}
            onChange={setSendReceipts}
          />
          <Toggle
            label="Weekly summary"
            description="Receive a weekly spending summary"
            checked={weeklySummary}
            onChange={setWeeklySummary}
          />
        </div>
      </section>

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
      >
        {saving ? "Saving..." : "Save rules"}
      </button>
    </form>
  );
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <div className="flex justify-between text-sm mb-3">
        <label className="font-medium">{label}</label>
        <span className="text-[#0071e3] font-semibold font-mono tabular-nums">
          {format(value)}
        </span>
      </div>
      <div className="relative h-7 flex items-center">
        {/* Track background */}
        <div className="absolute inset-x-0 h-1 rounded-full bg-[#e5e5ea]" />
        {/* Filled track */}
        <div
          className="absolute left-0 h-1 rounded-full bg-[#0071e3]"
          style={{ width: `${percent}%` }}
        />
        {/* Native input on top for interaction */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
          style={{ height: "28px" }}
        />
        {/* Custom thumb */}
        <div
          className="absolute w-7 h-7 rounded-full bg-white shadow-[0_0.5px_4px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.06)] pointer-events-none"
          style={{ left: `calc(${percent}% - 14px)` }}
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-black/[0.02] transition-colors">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-[#86868b] mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-[51px] h-[31px] rounded-full transition-colors ${
          checked ? "bg-[#34c759]" : "bg-[#e5e5ea]"
        }`}
      >
        <span
          className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] bg-white rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.15)] transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </label>
  );
}
