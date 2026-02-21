"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Card } from "@/lib/types";
import { CardPreview, CardInputFields } from "@/components/card-preview";

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "ClawPayBot";

/* ── Step definitions ── */
type Step =
  | "card"
  | "per_purchase"
  | "daily"
  | "monthly"
  | "safety"
  | "approval"
  | "notifications"
  | "done";

const STEPS: Step[] = [
  "card",
  "per_purchase",
  "daily",
  "monthly",
  "safety",
  "approval",
  "notifications",
  "done",
];

type CardField = "number" | "name" | "expiry" | "cvc";

/* ── Inline Toggle (matches rules-form.tsx) ── */
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
    <label className="flex items-center justify-between py-4 cursor-pointer">
      <div>
        <p className="font-medium text-[15px]">{label}</p>
        <p className="text-sm text-[#86868b] mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        className={`relative shrink-0 ml-4 w-[51px] h-[31px] rounded-full transition-colors ${
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

/* ── Inline Slider for limit steps ── */
function LimitSlider({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  const percent = ((value - min) / (max - min)) * 100;
  const [bounce, setBounce] = useState(false);
  const prevVal = useRef(value);

  useEffect(() => {
    if (value !== prevVal.current) {
      setBounce(true);
      prevVal.current = value;
      const t = setTimeout(() => setBounce(false), 150);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <div className="flex flex-col items-center gap-8 w-full">
      <span
        className={`text-5xl font-semibold text-[#0071e3] tabular-nums transition-all duration-150 ${
          bounce ? "scale-105" : "scale-100"
        }`}
      >
        ${value}
      </span>
      <div className="w-full max-w-md">
        <div className="relative h-7 flex items-center">
          <div className="absolute inset-x-0 h-1 rounded-full bg-[#e5e5ea]" />
          <div
            className="absolute left-0 h-1 rounded-full bg-[#0071e3] transition-all duration-75"
            style={{ width: `${percent}%` }}
          />
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
          <div
            className="absolute w-7 h-7 rounded-full bg-white shadow-[0_0.5px_4px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.06)] pointer-events-none transition-all duration-75"
            style={{ left: `calc(${percent}% - 14px)` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-[#86868b]">
          <span>${min}</span>
          <span>${max}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function SetupPage() {
  const supabase = createClient();

  /* Loading & auth */
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<Card[]>([]);
  const [walletProvisioned, setWalletProvisioned] = useState(false);

  /* Step & animation */
  const [step, setStep] = useState<Step>("card");
  const [animClass, setAnimClass] = useState("animate-in-forward");
  const [visible, setVisible] = useState(true);
  const directionRef = useRef<"forward" | "back">("forward");

  /* Card form */
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvc, setCvc] = useState("");
  const [nameOnCard, setNameOnCard] = useState("");
  const [activeCardField, setActiveCardField] = useState<CardField | null>("number");
  const [saving, setSaving] = useState(false);
  const [provisioningWallet, setProvisioningWallet] = useState(false);

  /* Config values */
  const [perPurchaseLimit, setPerPurchaseLimit] = useState(50);
  const [dailyLimit, setDailyLimit] = useState(150);
  const [monthlyLimit, setMonthlyLimit] = useState(500);
  const [numPurchaseLimit, setNumPurchaseLimit] = useState(25);
  const [blockNewMerchants, setBlockNewMerchants] = useState(true);
  const [blockInternational, setBlockInternational] = useState(false);
  const [nightPause, setNightPause] = useState(false);
  const [alwaysAsk, setAlwaysAsk] = useState(true);
  const [blockedCategoriesText, setBlockedCategoriesText] = useState("");
  const [approvalChannel, setApprovalChannel] = useState("whatsapp");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [approvalTimeout, setApprovalTimeout] = useState(300);
  const [sendReceipts, setSendReceipts] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(true);

  /* Telegram deep-link onboarding */
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramLinking, setTelegramLinking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize telegramLinked from loaded config
  useEffect(() => {
    if (telegramChatId) setTelegramLinked(true);
  }, [telegramChatId]);

  // Cleanup polling on unmount
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

    // Open Telegram immediately (before any await) so the browser doesn't block the popup
    window.open(`https://t.me/${TELEGRAM_BOT}?start=${code}`, "_blank");

    const { error: insertErr } = await supabase.from("telegram_link_codes").insert({
      user_id: user.id,
      code,
      expires_at: expiresAt,
    });

    if (insertErr) {
      console.error("Failed to insert telegram link code:", insertErr);
    }

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
        setTelegramChatId(data.telegram_chat_id);
        setTelegramLinked(true);
        setTelegramLinking(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 2000);
  }

  /* Saving final config */
  const [savingConfig, setSavingConfig] = useState(false);

  /* ── Load existing data ── */
  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const [cardRes, walletRes, configRes] = await Promise.all([
        supabase
          .from("cards")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("wallets")
          .select("id")
          .eq("user_id", user.id)
          .single(),
        supabase
          .from("configs")
          .select("*")
          .eq("user_id", user.id)
          .single(),
      ]);
      if (cardRes.data) {
        setCards(cardRes.data);
        // Prefill form with the most recent card's known details
        const latest = cardRes.data[0];
        if (latest) {
          setExpMonth(String(latest.exp_month).padStart(2, "0"));
          setExpYear(String(latest.exp_year).slice(-2));
          if (latest.name_on_card) setNameOnCard(latest.name_on_card);
        }
      }
      if (walletRes.data) setWalletProvisioned(true);
      const cfg = configRes.data as Record<string, unknown> | null;
      if (cfg) {
        setAlwaysAsk(Boolean(cfg.always_ask ?? true));
        setPerPurchaseLimit(Number(cfg.per_purchase_limit ?? 50));
        setDailyLimit(Number(cfg.daily_limit ?? 150));
        setMonthlyLimit(Number(cfg.monthly_limit ?? 500));
        setNumPurchaseLimit(Number(cfg.num_purchase_limit ?? 25));
        setBlockedCategoriesText(
          Array.isArray(cfg.blocked_categories)
            ? (cfg.blocked_categories as string[]).join(", ")
            : "",
        );
        setBlockNewMerchants(Boolean(cfg.block_new_merchants ?? true));
        setBlockInternational(Boolean(cfg.block_international ?? false));
        setNightPause(Boolean(cfg.night_pause ?? false));
        setApprovalChannel(String(cfg.approval_channel || "whatsapp"));
        setTelegramChatId(String(cfg.telegram_chat_id || ""));
        setApprovalTimeout(Number(cfg.approval_timeout_seconds ?? 300));
        setSendReceipts(Boolean(cfg.send_receipts ?? true));
        setWeeklySummary(Boolean(cfg.weekly_summary ?? true));
      }
      setLoading(false);
    }
    load();
  }, []);

  /* ── Helpers ── */
  function detectBrand(number: string): string {
    const cleaned = number.replace(/\s/g, "");
    if (/^4/.test(cleaned)) return "visa";
    if (/^5[1-5]/.test(cleaned)) return "mastercard";
    if (/^3[47]/.test(cleaned)) return "amex";
    if (/^6(?:011|5)/.test(cleaned)) return "discover";
    return "unknown";
  }

  async function provisionWallet(userId: string) {
    setProvisioningWallet(true);
    try {
      const res = await fetch("/api/provision-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (res.ok) {
        setWalletProvisioned(true);
      }
    } catch {
      // can retry later
    }
    setProvisioningWallet(false);
  }

  /* ── Step transition ── */
  const goTo = useCallback(
    (target: Step, direction: "forward" | "back" = "forward") => {
      directionRef.current = direction;
      setVisible(false);
      setAnimClass(direction === "forward" ? "animate-out-forward" : "animate-out-back");
      setTimeout(() => {
        setStep(target);
        setAnimClass(direction === "forward" ? "animate-in-forward" : "animate-in-back");
        setVisible(true);
      }, 300);
    },
    [],
  );

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) goTo(STEPS[idx + 1], "forward");
  }, [step, goTo]);

  const goBack = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) goTo(STEPS[idx - 1], "back");
  }, [step, goTo]);

  /* ── Card form handlers ── */
  function handleCardFieldChange(field: CardField, value: string) {
    switch (field) {
      case "number":
        setCardNumber(value);
        break;
      case "name":
        setNameOnCard(value);
        break;
      case "expiry": {
        const digits = value.replace(/\D/g, "");
        setExpMonth(digits.slice(0, 2));
        setExpYear(digits.slice(2, 4));
        break;
      }
      case "cvc":
        setCvc(value);
        break;
    }
  }

  async function handleAddCard(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const cleaned = cardNumber.replace(/\s/g, "");
    const last4 = cleaned.slice(-4);
    const brand = detectBrand(cleaned);
    const token = `pm_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

    const { data, error } = await supabase
      .from("cards")
      .insert({
        user_id: user.id,
        token,
        last4,
        brand,
        exp_month: parseInt(expMonth),
        exp_year: parseInt(expYear),
        name_on_card: nameOnCard || null,
        is_default: cards.length === 0,
      })
      .select()
      .single();

    if (data && !error) {
      setCards([data, ...cards]);

      if (!walletProvisioned) {
        await provisionWallet(user.id);
      }

      setSaving(false);
      goNext();
    } else {
      setSaving(false);
    }
  }

  /* ── Save all config on final step ── */
  async function saveConfig() {
    setSavingConfig(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSavingConfig(false);
      return;
    }

    const blockedCategories = blockedCategoriesText
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    await supabase.from("configs").upsert(
      {
        user_id: user.id,
        always_ask: alwaysAsk,
        per_purchase_limit: perPurchaseLimit,
        daily_limit: dailyLimit,
        monthly_limit: monthlyLimit,
        num_purchase_limit: numPurchaseLimit,
        blocked_categories: blockedCategories,
        block_new_merchants: blockNewMerchants,
        block_international: blockInternational,
        night_pause: nightPause,
        approval_channel: approvalChannel,
        telegram_chat_id: telegramChatId.trim() || null,
        approval_timeout_seconds: approvalTimeout,
        send_receipts: sendReceipts,
        weekly_summary: weeklySummary,
      },
      { onConflict: "user_id" },
    );

    setSavingConfig(false);
  }

  /* Trigger config save when reaching done step */
  const savedRef = useRef(false);
  useEffect(() => {
    if (step === "done" && !savedRef.current) {
      savedRef.current = true;
      saveConfig();
    }
  }, [step]);

  /* ── Loading state ── */
  if (loading) {
    return <div className="h-64" />;
  }

  /* ── Animation style helper ── */
  const animStyle: React.CSSProperties = (() => {
    switch (animClass) {
      case "animate-in-forward":
        return { animation: "slideInRight 0.35s ease-out forwards" };
      case "animate-out-forward":
        return { animation: "slideOutLeft 0.25s ease-in forwards" };
      case "animate-in-back":
        return { animation: "slideInLeft 0.35s ease-out forwards" };
      case "animate-out-back":
        return { animation: "slideOutRight 0.25s ease-in forwards" };
      default:
        return {};
    }
  })();

  /* ── Progress bar ── */
  const stepIdx = STEPS.indexOf(step);
  const progressBar = (
    <div className="flex gap-1.5 mb-8">
      {STEPS.map((s, i) => (
        <div
          key={s}
          className={`flex-1 h-1 rounded-full transition-all duration-300 ${
            i <= stepIdx ? "bg-[#0071e3]" : "bg-black/[0.06]"
          }`}
        />
      ))}
    </div>
  );

  /* ── Back button ── */
  const backButton = stepIdx > 0 && step !== "done" && (
    <button
      onClick={goBack}
      className="text-[#86868b] hover:text-[#1d1d1f] text-sm font-medium transition-colors mb-6 flex items-center gap-1"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-60">
        <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back
    </button>
  );

  /* ── Continue button ── */
  const continueButton = (
    label = "Continue",
    onClick: () => void = goNext,
    disabled = false,
  ) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full max-w-md mx-auto block bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white font-medium py-3.5 rounded-full transition-all hover:scale-[1.02] active:scale-[0.98] mt-8"
    >
      {label}
    </button>
  );

  /* ── Step content ── */
  function renderStep() {
    switch (step) {
      /* ── 1. Card ── */
      case "card":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Add your funding card
              </h2>
              <p className="text-[#86868b] mt-2">
                This card will fund your agent&apos;s virtual wallet.
              </p>
            </div>

            <div className="flex justify-center">
              <CardPreview
                interactive
                last4={cardNumber.replace(/\D/g, "").slice(-4) || "****"}
                brand={detectBrand(cardNumber)}
                name={nameOnCard || "YOUR NAME"}
                expMonth={expMonth || "MM"}
                expYear={expYear || "YY"}
                cardNumber={cardNumber}
                cvc={cvc}
                activeField={activeCardField}
              />
            </div>

            <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-[#86868b]">
                    <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5 7V5C5 3.34 6.34 2 8 2C9.66 2 11 3.34 11 5V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span className="text-xs text-[#86868b] font-medium">Payment details</span>
                </div>
                <img src="/stripe-logo.png" alt="Stripe" className="h-4 opacity-40" />
              </div>
              <CardInputFields
                cardNumber={cardNumber}
                name={nameOnCard}
                expMonth={expMonth}
                expYear={expYear}
                cvc={cvc}
                onFieldChange={handleCardFieldChange}
                onFieldFocus={setActiveCardField}
              />
            </div>

            <form onSubmit={handleAddCard}>
              {continueButton(
                provisioningWallet
                  ? "Setting up wallet..."
                  : saving
                    ? "Saving..."
                    : "Add card & continue",
                () => {},
                saving || provisioningWallet || cardNumber.replace(/\D/g, "").length < 15 || !expMonth || !expYear || !cvc,
              )}
            </form>

            {cards.length > 0 && (
              <button
                onClick={goNext}
                className="block mx-auto text-[#0071e3] hover:text-[#0077ed] font-medium text-sm mt-2"
              >
                Skip — use existing card
              </button>
            )}

            {/* Powered by Stripe */}
            <div className="flex items-center justify-center gap-1.5 mt-4">
              <svg className="h-5 opacity-40" viewBox="0 0 60 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M60 12.8C60 8.55 57.95 5.18 54.02 5.18C50.07 5.18 47.7 8.55 47.7 12.77C47.7 17.69 50.42 20.33 54.35 20.33C56.27 20.33 57.72 19.87 58.82 19.23V15.98C57.72 16.55 56.45 16.9 54.85 16.9C53.27 16.9 51.87 16.35 51.7 14.42H59.97C59.97 14.2 60 13.28 60 12.8ZM51.65 11.42C51.65 9.57 52.72 8.82 53.99 8.82C55.24 8.82 56.25 9.57 56.25 11.42H51.65ZM41.3 5.18C39.7 5.18 38.67 5.93 38.1 6.45L37.87 5.43H34.47V24.75L38.22 23.95L38.24 19.28C38.82 19.7 39.67 20.33 41.27 20.33C44.52 20.33 47.47 17.73 47.47 12.6C47.45 7.93 44.47 5.18 41.3 5.18ZM40.42 16.78C39.37 16.78 38.74 16.4 38.24 15.93L38.22 9.85C38.74 9.33 39.39 8.97 40.42 8.97C42.09 8.97 43.24 10.85 43.24 12.85C43.24 14.9 42.12 16.78 40.42 16.78ZM29.15 4.18L32.92 3.38V0L29.15 0.78V4.18ZM29.15 5.43H32.92V20.08H29.15V5.43ZM25.1 6.65L24.85 5.43H21.52V20.08H25.27V9.6C26.17 8.43 27.67 8.65 28.12 8.83V5.43C27.65 5.23 25.99 4.88 25.1 6.65ZM17.52 1.55L13.85 2.33L13.82 16.18C13.82 18.53 15.6 20.35 17.95 20.35C19.25 20.35 20.2 20.1 20.72 19.83V16.53C20.22 16.73 17.5 17.53 17.5 15.18V9.08H20.72V5.43H17.5L17.52 1.55ZM5.62 9.85C5.62 9.13 6.2 8.83 7.17 8.83C8.57 8.83 10.32 9.25 11.72 10V6.38C10.2 5.73 8.7 5.48 7.17 5.48C3.62 5.48 1.25 7.33 1.25 10.33C1.25 15.05 7.77 14.28 7.77 16.33C7.77 17.18 7.05 17.48 6.02 17.48C4.5 17.48 2.57 16.83 1.02 16L0 19.5C1.7 20.25 3.42 20.58 5.07 20.58C8.72 20.58 11.22 18.8 11.22 15.75C11.17 10.65 4.62 11.58 4.62 9.58L5.62 9.85Z" fill="#6772E5"/>
              </svg>
              <span className="text-xs text-[#86868b]">Secure payment by Stripe</span>
            </div>
          </div>
        );

      /* ── 2. Per-purchase limit ── */
      case "per_purchase":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                What&apos;s the most your agent can spend per purchase?
              </h2>
              <p className="text-[#86868b] mt-2">
                Any single purchase above this amount will require your approval.
              </p>
            </div>
            <LimitSlider
              value={perPurchaseLimit}
              onChange={setPerPurchaseLimit}
              min={5}
              max={500}
              step={5}
            />
            {continueButton()}
          </div>
        );

      /* ── 3. Daily limit ── */
      case "daily":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Set your daily spending limit
              </h2>
              <p className="text-[#86868b] mt-2">
                Total spending across all purchases in a 24-hour window.
              </p>
            </div>
            <LimitSlider
              value={dailyLimit}
              onChange={setDailyLimit}
              min={10}
              max={1000}
              step={10}
            />
            {continueButton()}
          </div>
        );

      /* ── 4. Monthly limit ── */
      case "monthly":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                And your monthly cap?
              </h2>
              <p className="text-[#86868b] mt-2">
                Once your agent hits this limit, all purchases are paused until next month.
              </p>
            </div>
            <LimitSlider
              value={monthlyLimit}
              onChange={setMonthlyLimit}
              min={50}
              max={5000}
              step={50}
            />
            <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-[#1d1d1f]">
                  Max purchases per week
                </span>
                <span className="text-[#0071e3] font-semibold tabular-nums">
                  {numPurchaseLimit}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={numPurchaseLimit}
                onChange={(e) => setNumPurchaseLimit(Number(e.target.value))}
                className="w-full accent-[#0071e3]"
              />
            </div>
            {continueButton()}
          </div>
        );

      /* ── 5. Safety features ── */
      case "safety":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Which safety features do you want?
              </h2>
              <p className="text-[#86868b] mt-2">
                Extra guardrails to keep your agent in check.
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] px-6 divide-y divide-black/[0.06]">
              <Toggle
                label="Always require approval"
                description="Every purchase must be manually approved"
                checked={alwaysAsk}
                onChange={setAlwaysAsk}
              />
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
            <div>
              <label className="block text-sm font-medium text-[#1d1d1f] mb-2">
                Blocked categories
              </label>
              <input
                type="text"
                value={blockedCategoriesText}
                onChange={(e) => setBlockedCategoriesText(e.target.value)}
                placeholder="e.g. gambling, crypto, adult"
                className="w-full rounded-xl border border-black/[0.12] bg-white px-4 py-3 text-sm outline-none focus:border-[#0071e3]"
              />
              <p className="text-xs text-[#86868b] mt-2">
                Comma-separated categories to reject.
              </p>
            </div>
            {continueButton()}
          </div>
        );

      /* ── 6. Approval channel ── */
      case "approval":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                How should we notify you for approvals?
              </h2>
              <p className="text-[#86868b] mt-2">
                When a purchase needs your OK, we&apos;ll ping you here.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {([
                { id: "whatsapp", logo: "/whatsapp-logo.svg", label: "WhatsApp" },
                { id: "telegram", logo: "/telegram-logo.png", label: "Telegram" },
                { id: "web", emoji: "🌐", label: "Web" },
              ] as const).map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setApprovalChannel(ch.id)}
                  className={`relative flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                    approvalChannel === ch.id
                      ? "border-[#0071e3] bg-[#0071e3]/[0.04]"
                      : "border-black/[0.06] bg-white hover:border-black/[0.12]"
                  }`}
                >
                  {"logo" in ch ? (
                    <img src={ch.logo} alt={ch.label} className="w-8 h-8 object-contain" />
                  ) : (
                    <span className="text-3xl">{ch.emoji}</span>
                  )}
                  <span className="text-sm font-medium">{ch.label}</span>
                  {approvalChannel === ch.id && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-[#0071e3] rounded-full flex items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {approvalChannel === "telegram" && (
              <div className="mt-4">
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
                      <div className="mt-2 text-center">
                        <p className="text-xs text-[#86868b]">
                          Press Start in Telegram, then come back here.
                        </p>
                        <button
                          type="button"
                          onClick={() => { setTelegramLinking(false); if (pollRef.current) clearInterval(pollRef.current); }}
                          className="text-xs text-[#0071e3] hover:text-[#0077ed] font-medium mt-2"
                        >
                          Try again with a new code
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Timeout slider */}
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-3">
                <span className="font-medium text-[#1d1d1f]">Approval timeout</span>
                <span className="text-[#0071e3] font-semibold tabular-nums">
                  {Math.floor(approvalTimeout / 60)} min
                </span>
              </div>
              <div className="relative h-7 flex items-center">
                <div className="absolute inset-x-0 h-1 rounded-full bg-[#e5e5ea]" />
                <div
                  className="absolute left-0 h-1 rounded-full bg-[#0071e3] transition-all duration-75"
                  style={{
                    width: `${((approvalTimeout - 60) / (1800 - 60)) * 100}%`,
                  }}
                />
                <input
                  type="range"
                  min={60}
                  max={1800}
                  step={60}
                  value={approvalTimeout}
                  onChange={(e) => setApprovalTimeout(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                  style={{ height: "28px" }}
                />
                <div
                  className="absolute w-7 h-7 rounded-full bg-white shadow-[0_0.5px_4px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.06)] pointer-events-none transition-all duration-75"
                  style={{
                    left: `calc(${((approvalTimeout - 60) / (1800 - 60)) * 100}% - 14px)`,
                  }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-[#86868b]">
                <span>1 min</span>
                <span>30 min</span>
              </div>
            </div>

            {continueButton()}
          </div>
        );

      /* ── 7. Notifications ── */
      case "notifications":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Stay in the loop?
              </h2>
              <p className="text-[#86868b] mt-2">
                Choose which updates you&apos;d like to receive.
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] px-6 divide-y divide-black/[0.06]">
              <Toggle
                label="Purchase receipts"
                description="Get a message after each purchase"
                checked={sendReceipts}
                onChange={setSendReceipts}
              />
              <Toggle
                label="Weekly summary"
                description="Receive a weekly spending digest"
                checked={weeklySummary}
                onChange={setWeeklySummary}
              />
            </div>
            {continueButton("Finish setup", () => goTo("done", "forward"))}
          </div>
        );

      /* ── 8. Done ── */
      case "done":
        return (
          <div className="text-center py-8 space-y-5">
            <div
              className="w-16 h-16 bg-[#34c759]/10 rounded-full flex items-center justify-center mx-auto"
              style={{ animation: "fadeInUp 0.5s ease-out forwards", opacity: 0 }}
            >
              <span className="text-3xl text-[#34c759]">&#10003;</span>
            </div>
            <h2
              className="text-2xl font-semibold tracking-tight"
              style={{
                animation: "fadeInUp 0.5s ease-out 0.1s forwards",
                opacity: 0,
              }}
            >
              You&apos;re all set!
            </h2>
            <p
              className="text-[#86868b] leading-relaxed max-w-sm mx-auto"
              style={{
                animation: "fadeInUp 0.5s ease-out 0.2s forwards",
                opacity: 0,
              }}
            >
              {savingConfig
                ? "Saving your preferences..."
                : walletProvisioned
                  ? "Your virtual card is ready. Go to your dashboard to add funds and start spending."
                  : "Go to your dashboard to get started."}
            </p>
            <div
              style={{
                animation: "fadeInUp 0.5s ease-out 0.35s forwards",
                opacity: 0,
              }}
            >
              <a
                href="/dashboard"
                className="inline-block bg-[#0071e3] hover:bg-[#0077ed] text-white font-medium px-8 py-3.5 rounded-full transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Go to Dashboard
              </a>
            </div>
          </div>
        );
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4">
      {progressBar}
      {backButton}
      <div key={step} style={animStyle}>
        {renderStep()}
      </div>
    </div>
  );
}
