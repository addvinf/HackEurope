import crypto from "node:crypto";
import { createClient as createServerClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Persistent Card — the core abstraction
// ---------------------------------------------------------------------------

export interface PersistentCard {
  /** Stripe Issuing card ID (icd_mock_...) */
  id: string;
  /** Full 16-digit card number — NEVER expose to the LLM */
  number: string;
  /** Last 4 digits (safe to log / show in dashboards) */
  last4: string;
  /** 2-digit expiry month */
  exp_month: number;
  /** 4-digit expiry year */
  exp_year: number;
  /** 3-digit CVC */
  cvc: string;
  /** Card brand */
  brand: "visa";
  /** Current spending limit (0 when idle, amount when topped up) */
  spending_limit: number;
  /** ISO currency */
  currency: string;
  /** Current balance (0 when idle, amount when topped up) */
  balance: number;
  /** Creation timestamp */
  created: number;
}

export interface TopUpResult {
  topup_id: string;
  amount: number;
  expires_at: number;
}

export interface DrainResult {
  drained_amount: number;
  reason: string;
}

export interface ChargeResult {
  id: string;
  amount: number;
  currency: string;
  status: "succeeded" | "failed";
  card_id: string;
  created: number;
}

// In-memory store: one card per user (acts as cache, DB is source of truth)
const userCards = new Map<string, PersistentCard>();
const cardIndex = new Map<string, string>(); // card_id → user_id
const drainTimers = new Map<string, NodeJS.Timeout>();

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function persistCardToDB(userId: string, card: PersistentCard) {
  const supabase = getAdminClient();
  await supabase.from("mock_cards").upsert({
    user_id: userId,
    card_id: card.id,
    number: card.number,
    last4: card.last4,
    exp_month: card.exp_month,
    exp_year: card.exp_year,
    cvc: card.cvc,
    spending_limit: card.spending_limit,
    balance: card.balance,
    currency: card.currency,
  }, { onConflict: "user_id" });
}

async function hydrateFromDB(userId: string): Promise<PersistentCard | null> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("mock_cards")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!data) return null;

  const card: PersistentCard = {
    id: data.card_id,
    number: data.number,
    last4: data.last4,
    exp_month: data.exp_month,
    exp_year: data.exp_year,
    cvc: data.cvc,
    brand: "visa",
    spending_limit: Number(data.spending_limit),
    currency: data.currency,
    balance: Number(data.balance),
    created: Math.floor(new Date(data.created_at).getTime() / 1000),
  };

  userCards.set(userId, card);
  cardIndex.set(card.id, userId);
  return card;
}

async function updateCardInDB(userId: string, updates: { spending_limit?: number; balance?: number }) {
  const supabase = getAdminClient();
  await supabase
    .from("mock_cards")
    .update(updates)
    .eq("user_id", userId);
}

// ---------------------------------------------------------------------------
// Mock Stripe Wallet Manager
// ---------------------------------------------------------------------------

export const stripeMock = {
  async provisionCard(params: { user_id: string; currency?: string }): Promise<PersistentCard> {
    // Check in-memory cache first
    const existing = userCards.get(params.user_id);
    if (existing) return existing;

    // Check DB (server may have restarted)
    const fromDB = await hydrateFromDB(params.user_id);
    if (fromDB) return fromDB;

    const id = `icd_mock_${crypto.randomBytes(12).toString("hex")}`;
    const number = generateMockVisaNumber();
    const now = new Date();
    const exp_month = now.getMonth() + 1;
    const exp_year = now.getFullYear() + 3;

    const card: PersistentCard = {
      id,
      number,
      last4: number.slice(-4),
      exp_month,
      exp_year,
      cvc: String(Math.floor(100 + Math.random() * 900)),
      brand: "visa",
      spending_limit: 0,
      currency: params.currency || "USD",
      balance: 0,
      created: Math.floor(Date.now() / 1000),
    };

    userCards.set(params.user_id, card);
    cardIndex.set(id, params.user_id);

    // Persist to DB
    await persistCardToDB(params.user_id, card);

    return card;
  },

  async getCard(userId: string): Promise<PersistentCard | null> {
    // Check in-memory cache
    const cached = userCards.get(userId);
    if (cached) return cached;

    // Hydrate from DB if cache is empty (server restarted)
    return hydrateFromDB(userId);
  },

  async getCardById(cardId: string): Promise<PersistentCard | null> {
    const userId = cardIndex.get(cardId);
    if (userId) return userCards.get(userId) ?? null;

    // Fallback: look up in DB by card_id
    const supabase = getAdminClient();
    const { data } = await supabase
      .from("mock_cards")
      .select("user_id")
      .eq("card_id", cardId)
      .single();

    if (!data) return null;
    return hydrateFromDB(data.user_id);
  },

  async topUp(params: {
    user_id: string;
    amount: number;
    transaction_id: string;
    timeout_seconds?: number;
  }): Promise<TopUpResult> {
    let card = userCards.get(params.user_id);
    if (!card) {
      card = await hydrateFromDB(params.user_id) ?? undefined;
    }
    if (!card) throw new Error("No wallet provisioned for user");

    const timeout = params.timeout_seconds ?? 120;
    const topupId = `tu_${crypto.randomBytes(8).toString("hex")}`;

    // Fund the card
    card.balance = params.amount;
    card.spending_limit = params.amount;

    // Persist to DB
    await updateCardInDB(params.user_id, {
      balance: params.amount,
      spending_limit: params.amount,
    });

    // Auto-drain timer (safety net) — in-memory only
    const existingTimer = drainTimers.get(params.user_id);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      stripeMock.drain({ user_id: params.user_id, reason: "timeout" });
    }, timeout * 1000);
    drainTimers.set(params.user_id, timer);

    return {
      topup_id: topupId,
      amount: params.amount,
      expires_at: Math.floor(Date.now() / 1000) + timeout,
    };
  },

  async drain(params: { user_id: string; reason: string }): Promise<DrainResult> {
    const card = userCards.get(params.user_id);
    if (!card) return { drained_amount: 0, reason: params.reason };

    const drained = card.balance;
    card.balance = 0;
    card.spending_limit = 0;

    // Persist to DB
    await updateCardInDB(params.user_id, { balance: 0, spending_limit: 0 });

    // Clear auto-drain timer
    const timer = drainTimers.get(params.user_id);
    if (timer) {
      clearTimeout(timer);
      drainTimers.delete(params.user_id);
    }

    return { drained_amount: drained, reason: params.reason };
  },

  async hasActiveTopUp(userId: string): Promise<boolean> {
    const card = userCards.get(userId);
    if (card) return card.balance > 0;

    // Check DB if not in cache
    const fromDB = await hydrateFromDB(userId);
    return !!fromDB && fromDB.balance > 0;
  },

  async deposit(params: { user_id: string; amount: number }): Promise<{ checkout_session_id: string; amount: number }> {
    const sessionId = `cs_mock_${crypto.randomBytes(12).toString("hex")}`;
    return { checkout_session_id: sessionId, amount: params.amount };
  },

  async charge(params: {
    amount: number;
    currency: string;
    card_id: string;
  }): Promise<ChargeResult> {
    await new Promise((r) => setTimeout(r, 100));

    const card = await stripeMock.getCardById(params.card_id);

    if (!card) {
      return {
        id: `ch_mock_${crypto.randomBytes(12).toString("hex")}`,
        amount: params.amount,
        currency: params.currency,
        status: "failed",
        card_id: params.card_id,
        created: Math.floor(Date.now() / 1000),
      };
    }

    // No balance or over limit
    if (card.balance <= 0 || params.amount > card.spending_limit) {
      return {
        id: `ch_mock_${crypto.randomBytes(12).toString("hex")}`,
        amount: params.amount,
        currency: params.currency,
        status: "failed",
        card_id: params.card_id,
        created: Math.floor(Date.now() / 1000),
      };
    }

    // Deduct from balance
    card.balance -= params.amount;

    return {
      id: `ch_mock_${crypto.randomBytes(12).toString("hex")}`,
      amount: params.amount,
      currency: params.currency,
      status: "succeeded",
      card_id: params.card_id,
      created: Math.floor(Date.now() / 1000),
    };
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a mock Visa number that passes Luhn check */
function generateMockVisaNumber(): string {
  const prefix = "4";
  let digits = prefix;
  for (let i = 0; i < 14; i++) {
    digits += Math.floor(Math.random() * 10);
  }
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = parseInt(digits[i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return digits + check;
}

export function detectBrand(number: string): string {
  const cleaned = number.replace(/\s/g, "");
  if (/^4/.test(cleaned)) return "visa";
  if (/^5[1-5]/.test(cleaned)) return "mastercard";
  if (/^3[47]/.test(cleaned)) return "amex";
  if (/^6(?:011|5)/.test(cleaned)) return "discover";
  return "unknown";
}
