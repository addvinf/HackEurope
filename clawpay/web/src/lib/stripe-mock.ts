import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Persistent Card — the core abstraction
// ---------------------------------------------------------------------------

/**
 * A persistent virtual card issued once per user, normally at $0 balance.
 *
 * In production this maps to Stripe Issuing:
 *   const card = await stripe.issuing.cards.create({
 *     cardholder: holderId,
 *     type: "virtual",
 *     currency,
 *     spending_controls: { spending_limits: [{ amount: 0, interval: "per_authorization" }] },
 *   });
 *
 * The mock generates a realistic-looking card number so the CDP injection
 * path can be tested end-to-end without a real Stripe account.
 */
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

// In-memory store: one card per user
const userCards = new Map<string, PersistentCard>();
const cardIndex = new Map<string, string>(); // card_id → user_id
const drainTimers = new Map<string, NodeJS.Timeout>();

// ---------------------------------------------------------------------------
// Mock Stripe Wallet Manager
// ---------------------------------------------------------------------------

/**
 * Mock Stripe provider — wallet-manager pattern.
 *
 * Production mapping:
 *   provisionCard() → stripe.issuing.cards.create() (one-time)
 *   topUp()         → stripe.treasury.inboundTransfers.create() + stripe.issuing.cards.update() (raise spending limit)
 *   drain()         → stripe.issuing.cards.update() (set limit to $0) + sweep balance back
 *   charge()        → handled by Stripe issuing_authorization.request webhook
 */
export const stripeMock = {
  /**
   * Provision a persistent virtual card for a user (one-time).
   *
   * Production equivalent:
   *   stripe.issuing.cards.create({ ... })
   */
  provisionCard(params: { user_id: string; currency?: string }): PersistentCard {
    // If user already has a card, return it
    const existing = userCards.get(params.user_id);
    if (existing) return existing;

    const id = `icd_mock_${crypto.randomBytes(12).toString("hex")}`;
    const number = generateMockVisaNumber();
    const now = new Date();
    const exp_month = now.getMonth() + 1;
    const exp_year = now.getFullYear() + 3; // longer expiry for persistent card

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
    return card;
  },

  /**
   * Get the user's persistent card.
   */
  getCard(userId: string): PersistentCard | null {
    return userCards.get(userId) ?? null;
  },

  /**
   * Get a card by its card_id.
   */
  getCardById(cardId: string): PersistentCard | null {
    const userId = cardIndex.get(cardId);
    if (!userId) return null;
    return userCards.get(userId) ?? null;
  },

  /**
   * Top up the card for a purchase. Sets balance and spending limit,
   * starts an auto-drain timer.
   *
   * Production equivalent:
   *   stripe.treasury.inboundTransfers.create() + stripe.issuing.cards.update()
   */
  topUp(params: {
    user_id: string;
    amount: number;
    transaction_id: string;
    timeout_seconds?: number;
  }): TopUpResult {
    const card = userCards.get(params.user_id);
    if (!card) throw new Error("No wallet provisioned for user");

    const timeout = params.timeout_seconds ?? 120;
    const topupId = `tu_${crypto.randomBytes(8).toString("hex")}`;

    // Fund the card
    card.balance = params.amount;
    card.spending_limit = params.amount;

    // Auto-drain timer (safety net)
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

  /**
   * Drain the card back to $0 after checkout.
   *
   * Production equivalent:
   *   stripe.issuing.cards.update() (set spending limit to $0) + sweep balance
   */
  drain(params: { user_id: string; reason: string }): DrainResult {
    const card = userCards.get(params.user_id);
    if (!card) return { drained_amount: 0, reason: params.reason };

    const drained = card.balance;
    card.balance = 0;
    card.spending_limit = 0;

    // Clear auto-drain timer
    const timer = drainTimers.get(params.user_id);
    if (timer) {
      clearTimeout(timer);
      drainTimers.delete(params.user_id);
    }

    return { drained_amount: drained, reason: params.reason };
  },

  /**
   * Check if the user has an active top-up (card is funded).
   */
  hasActiveTopUp(userId: string): boolean {
    const card = userCards.get(userId);
    return !!card && card.balance > 0;
  },

  /**
   * Simulate a charge against the persistent card.
   * In production this happens automatically via Stripe issuing_authorization.request webhook.
   */
  async charge(params: {
    amount: number;
    currency: string;
    card_id: string;
  }): Promise<ChargeResult> {
    await new Promise((r) => setTimeout(r, 100));

    const card = stripeMock.getCardById(params.card_id);

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
