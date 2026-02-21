"use client";

import { useState } from "react";
import type { Config } from "@/lib/types";

interface RulesFormProps {
  config: Config;
  onSave: (updated: Partial<Config>) => Promise<void>;
  saving: boolean;
}

function fallbackNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

export function RulesForm({ config, onSave, saving }: RulesFormProps) {
  const [alwaysAsk, setAlwaysAsk] = useState(config.always_ask ?? true);
  const [perPurchaseLimit, setPerPurchaseLimit] = useState(
    Number(config.per_purchase_limit ?? 50),
  );
  const [dailyLimit, setDailyLimit] = useState(Number(config.daily_limit ?? 150));
  const [monthlyLimit, setMonthlyLimit] = useState(
    Number(config.monthly_limit ?? 500),
  );
  const [numPurchaseLimit, setNumPurchaseLimit] = useState(
    Number(config.num_purchase_limit ?? 25),
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const blockedCategories = blockedCategoriesText
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    onSave({
      always_ask: alwaysAsk,
      per_purchase_limit: fallbackNumber(perPurchaseLimit, 50),
      daily_limit: fallbackNumber(dailyLimit, 150),
      monthly_limit: fallbackNumber(monthlyLimit, 500),
      num_purchase_limit: fallbackNumber(numPurchaseLimit, 25),
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
            min={5}
            max={500}
            step={5}
            format={(v) => `$${v}`}
          />
          <Slider
            label="Daily limit"
            value={dailyLimit}
            onChange={setDailyLimit}
            min={10}
            max={1000}
            step={10}
            format={(v) => `$${v}`}
          />
          <Slider
            label="Monthly limit"
            value={monthlyLimit}
            onChange={setMonthlyLimit}
            min={50}
            max={5000}
            step={50}
            format={(v) => `$${v}`}
          />
          <Slider
            label="Max purchases per week"
            value={numPurchaseLimit}
            onChange={setNumPurchaseLimit}
            min={1}
            max={100}
            step={1}
            format={(v) => `${v}`}
          />
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
      <section className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6 space-y-5">
        <h3 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider">
          Approval
        </h3>
        <Toggle
          label="Always require approval"
          description="Every purchase must be manually approved"
          checked={alwaysAsk}
          onChange={setAlwaysAsk}
        />
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
