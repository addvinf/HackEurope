import Stripe from "stripe";
import crypto from "node:crypto";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { stripeMock } from "./stripe-mock";
import type { PersistentCard, TopUpResult, DrainResult } from "./stripe-mock";

// ---------------------------------------------------------------------------
// Toggle: real Stripe vs mock
// ---------------------------------------------------------------------------

const USE_REAL_STRIPE = !!process.env.STRIPE_SECRET_KEY;

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-01-28.clover",
  });
}

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// In-memory drain timers (same pattern as mock)
const drainTimers = new Map<string, NodeJS.Timeout>();

// ---------------------------------------------------------------------------
// Real Stripe Wallet Manager
// ---------------------------------------------------------------------------

export const stripeWallet = {
  /**
   * Provision a persistent virtual card for a user via Stripe Issuing + Treasury.
   *
   * Full chain: Connected Account → Financial Account → Cardholder → Virtual Card
   * Idempotent — checks wallets table for existing Stripe IDs before creating anything.
   */
  async provisionCard(params: { user_id: string; currency?: string }): Promise<PersistentCard> {
    const stripe = getStripe();
    const supabase = getAdminClient();
    const currency = params.currency || "USD";

    // Check if wallet already exists with Stripe IDs
    const { data: existingWallet } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", params.user_id)
      .single();

    if (existingWallet?.stripe_account_id && existingWallet?.card_id) {
      // Already provisioned — retrieve card details
      const card = await stripe.issuing.cards.retrieve(
        existingWallet.card_id,
        { expand: ["number", "cvc"] },
        { stripeAccount: existingWallet.stripe_account_id },
      );

      return {
        id: card.id,
        number: (card as Stripe.Issuing.Card & { number?: string }).number || "",
        last4: card.last4,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        cvc: (card as Stripe.Issuing.Card & { cvc?: string }).cvc || "",
        brand: "visa",
        spending_limit: 0,
        currency: currency.toUpperCase(),
        balance: 0,
        created: card.created,
      };
    }

    // 1. Create Connected Account
    const account = await stripe.accounts.create({
      type: "custom",
      country: "US",
      capabilities: {
        card_issuing: { requested: true },
        treasury: { requested: true },
      },
      business_type: "individual",
      individual: {
        first_name: "ClawPay",
        last_name: "User",
        email: `user-${params.user_id.slice(0, 8)}@clawpay.dev`,
        dob: { day: 1, month: 1, year: 1990 },
        address: {
          line1: "123 Test St",
          city: "San Francisco",
          state: "CA",
          postal_code: "94111",
          country: "US",
        },
        ssn_last_4: "0000",
      },
      business_profile: {
        mcc: "5734",
        url: "https://clawpay.dev",
      },
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: "127.0.0.1",
      },
      external_account: {
        object: "bank_account",
        country: "US",
        currency: "usd",
        routing_number: "110000000",
        account_number: "000123456789",
      },
    });

    // 2. Create Financial Account
    const financialAccount = await stripe.treasury.financialAccounts.create(
      {
        supported_currencies: ["usd"],
        features: {
          card_issuing: { requested: true },
          financial_addresses: { aba: { requested: true } },
        },
      },
      { stripeAccount: account.id },
    );

    // 3. Create Cardholder
    const cardholder = await stripe.issuing.cardholders.create(
      {
        name: "ClawPay User",
        email: `user-${params.user_id.slice(0, 8)}@clawpay.dev`,
        type: "individual",
        billing: {
          address: {
            line1: "123 Test St",
            city: "San Francisco",
            state: "CA",
            postal_code: "94111",
            country: "US",
          },
        },
      },
      { stripeAccount: account.id },
    );

    // 4. Create Virtual Card
    const card = await stripe.issuing.cards.create(
      {
        cardholder: cardholder.id,
        financial_account: financialAccount.id,
        type: "virtual",
        currency: "usd",
        status: "active",
        spending_controls: {
          spending_limits: [
            {
              amount: 0,
              interval: "per_authorization",
            },
          ],
        },
      },
      { stripeAccount: account.id },
    );

    // Retrieve with expanded number + cvc
    const fullCard = await stripe.issuing.cards.retrieve(
      card.id,
      { expand: ["number", "cvc"] },
      { stripeAccount: account.id },
    );

    const result: PersistentCard = {
      id: fullCard.id,
      number: (fullCard as Stripe.Issuing.Card & { number?: string }).number || "",
      last4: fullCard.last4,
      exp_month: fullCard.exp_month,
      exp_year: fullCard.exp_year,
      cvc: (fullCard as Stripe.Issuing.Card & { cvc?: string }).cvc || "",
      brand: "visa",
      spending_limit: 0,
      currency: currency.toUpperCase(),
      balance: 0,
      created: fullCard.created,
    };

    // Store Stripe IDs — they'll be saved in the wallet insert by the route
    // We attach them as extra properties for the route to pick up
    (result as PersistentCard & {
      stripe_account_id: string;
      stripe_financial_account_id: string;
      stripe_cardholder_id: string;
    }).stripe_account_id = account.id;
    (result as PersistentCard & {
      stripe_financial_account_id: string;
    }).stripe_financial_account_id = financialAccount.id;
    (result as PersistentCard & {
      stripe_cardholder_id: string;
    }).stripe_cardholder_id = cardholder.id;

    return result;
  },

  /**
   * Get card details for a user. Calls Stripe to expand number + cvc.
   */
  async getCard(userId: string): Promise<PersistentCard | null> {
    const stripe = getStripe();
    const supabase = getAdminClient();

    const { data: walletRow } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!walletRow?.card_id || !walletRow?.stripe_account_id) return null;

    const card = await stripe.issuing.cards.retrieve(
      walletRow.card_id,
      { expand: ["number", "cvc"] },
      { stripeAccount: walletRow.stripe_account_id },
    );

    return {
      id: card.id,
      number: (card as Stripe.Issuing.Card & { number?: string }).number || "",
      last4: card.last4,
      exp_month: card.exp_month,
      exp_year: card.exp_year,
      cvc: (card as Stripe.Issuing.Card & { cvc?: string }).cvc || "",
      brand: "visa",
      spending_limit: card.spending_controls?.spending_limits?.[0]?.amount
        ? card.spending_controls.spending_limits[0].amount / 100
        : 0,
      currency: walletRow.currency || "USD",
      balance: Number(walletRow.balance) || 0,
      created: card.created,
    };
  },

  /**
   * Top up the card for a purchase.
   * Funds the Financial Account via test helper, then raises spending limit.
   */
  async topUp(params: {
    user_id: string;
    amount: number;
    transaction_id: string;
    timeout_seconds?: number;
  }): Promise<TopUpResult> {
    const stripe = getStripe();
    const supabase = getAdminClient();

    const { data: walletRow } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", params.user_id)
      .single();

    if (!walletRow?.stripe_account_id || !walletRow?.stripe_financial_account_id) {
      throw new Error("No Stripe wallet provisioned for user");
    }

    const amountCents = Math.round(params.amount * 100);
    const timeout = params.timeout_seconds ?? 120;
    const topupId = `tu_${crypto.randomBytes(8).toString("hex")}`;

    // Fund the Financial Account (test mode only)
    await stripe.testHelpers.treasury.receivedCredits.create(
      {
        amount: amountCents,
        currency: "usd",
        financial_account: walletRow.stripe_financial_account_id,
        network: "ach",
      },
      { stripeAccount: walletRow.stripe_account_id },
    );

    // Raise the spending limit on the card
    await stripe.issuing.cards.update(
      walletRow.card_id,
      {
        spending_controls: {
          spending_limits: [
            {
              amount: amountCents,
              interval: "per_authorization",
            },
          ],
        },
      },
      { stripeAccount: walletRow.stripe_account_id },
    );

    // Auto-drain timer (safety net) — in-memory only
    const existingTimer = drainTimers.get(params.user_id);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      stripeWallet.drain({ user_id: params.user_id, reason: "timeout" });
    }, timeout * 1000);
    drainTimers.set(params.user_id, timer);

    return {
      topup_id: topupId,
      amount: params.amount,
      expires_at: Math.floor(Date.now() / 1000) + timeout,
    };
  },

  /**
   * Drain the card back to $0.
   * Sets spending limit to $0 in Stripe.
   */
  async drain(params: { user_id: string; reason: string }): Promise<DrainResult> {
    const stripe = getStripe();
    const supabase = getAdminClient();

    const { data: walletRow } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", params.user_id)
      .single();

    if (!walletRow?.stripe_account_id) {
      return { drained_amount: 0, reason: params.reason };
    }

    const drained = Number(walletRow.balance) || 0;

    // Set spending limit to $0
    await stripe.issuing.cards.update(
      walletRow.card_id,
      {
        spending_controls: {
          spending_limits: [
            {
              amount: 0,
              interval: "per_authorization",
            },
          ],
        },
      },
      { stripeAccount: walletRow.stripe_account_id },
    );

    // Clear auto-drain timer
    const timer = drainTimers.get(params.user_id);
    if (timer) {
      clearTimeout(timer);
      drainTimers.delete(params.user_id);
    }

    return { drained_amount: drained, reason: params.reason };
  },

  /**
   * Check if the user has an active top-up (queries topup_sessions table).
   */
  async hasActiveTopUp(userId: string): Promise<boolean> {
    const supabase = getAdminClient();
    const { data } = await supabase
      .from("topup_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .limit(1);

    return !!data && data.length > 0;
  },

  /**
   * Charge is handled by Stripe Issuing webhooks in real mode.
   * This is a no-op / pass-through.
   */
  async charge(params: {
    amount: number;
    currency: string;
    card_id: string;
  }): Promise<{ id: string; amount: number; currency: string; status: "succeeded"; card_id: string; created: number }> {
    return {
      id: `ch_real_${crypto.randomBytes(12).toString("hex")}`,
      amount: params.amount,
      currency: params.currency,
      status: "succeeded",
      card_id: params.card_id,
      created: Math.floor(Date.now() / 1000),
    };
  },
};

// ---------------------------------------------------------------------------
// Exported wallet — switches between real and mock based on env var
// ---------------------------------------------------------------------------

export const wallet = USE_REAL_STRIPE ? stripeWallet : stripeMock;
