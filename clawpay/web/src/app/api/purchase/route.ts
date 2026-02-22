import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { formatApprovalMessage, sendTelegramMessage } from "@/lib/telegram";
import { getAdminClient, getUserFromApiToken } from "@/lib/supabase-admin";
import { stripeMock } from "@/lib/stripe-mock";
import type { PurchaseRequest, PurchaseResult } from "@/lib/types";

interface RulesConfig {
  always_ask: boolean;
  per_purchase_limit: number | null;
  daily_limit: number | null;
  num_purchase_limit: number | null;
  num_purchases: number;
  monthly_limit: number | null;
  blocked_categories: string[];
  block_new_merchants: boolean;
  block_international: boolean;
  night_pause: boolean;
  approval_timeout_seconds: number;
}

function parseLimitOrDefault(value: unknown, fallback: number): number | null {
  if (value === null) return null;
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/**
 * Rule evaluation — first match wins (ordered per the brief).
 *
 * Hard rejects:
 *   1. Blocked category
 *   2. International + block_international
 *   3. Night hours + night_pause
 *   4. Amount > per_purchase_limit
 *   5. Today's spend + amount > daily_limit
 *   6. Month spend + amount > monthly_limit
 *   7. Exceeded max purchases per day
 *
 * Soft (requires approval):
 *   1. Always approve (if always_ask is true)
 *   2. New merchant + block_new_merchants
 *   3. Within 20% of daily limit
 *
 * Otherwise: auto-approve
 */
function evaluateRules(
  purchase: PurchaseRequest,
  config: RulesConfig,
  todaySpent: number,
  monthSpent: number,
  isKnownMerchant: boolean,
): { action: "auto_approve" | "needs_approval" | "reject"; reason?: string; riskFlags: string[] } {
  const riskFlags: string[] = [];
  const effectivePerPurchaseLimit =
    config.per_purchase_limit === null
      ? Number.POSITIVE_INFINITY
      : Number(config.per_purchase_limit);
  const dailyLimit =
    config.daily_limit === null
      ? Number.POSITIVE_INFINITY
      : Number(config.daily_limit);
  const monthlyLimit =
    config.monthly_limit === null
      ? Number.POSITIVE_INFINITY
      : Number(config.monthly_limit);
  const weeklyPurchaseLimit =
    config.num_purchase_limit === null
      ? Number.POSITIVE_INFINITY
      : Number(config.num_purchase_limit);

  // 1. Blocked category → hard reject
  if (
    config.blocked_categories.length > 0 &&
    purchase.category &&
    config.blocked_categories.includes(purchase.category)
  ) {
    return {
      action: "reject",
      reason: `Category "${purchase.category}" is blocked`,
      riskFlags: ["blocked_category"],
    };
  }

  // 2. International + block_international → hard reject
  if (config.block_international && purchase.international) {
    return {
      action: "reject",
      reason: "International purchases are blocked",
      riskFlags: ["international"],
    };
  }

  // 3. Night hours + night_pause → hard reject
  if (config.night_pause) {
    const hour = new Date().getHours();
    if (hour >= 23 || hour < 7) {
      return {
        action: "reject",
        reason: "Purchases blocked during night pause (11 PM – 7 AM)",
        riskFlags: ["night_pause"],
      };
    }
  }

  // 4. Amount > per_purchase_limit → hard reject
  if (purchase.amount > effectivePerPurchaseLimit) {
    return {
      action: "reject",
      reason: `Amount $${purchase.amount} exceeds per-purchase limit of $${effectivePerPurchaseLimit}`,
      riskFlags: ["over_limit"],
    };
  }

  // 5. Today's spend + amount > daily_limit → hard reject
  if (todaySpent + purchase.amount > dailyLimit) {
    return {
      action: "reject",
      reason: `Would exceed daily limit of $${dailyLimit} (already spent $${todaySpent.toFixed(2)} today)`,
      riskFlags: ["daily_limit"],
    };
  }

  // 6. Month spend + amount > monthly_limit → hard reject
  if (monthSpent + purchase.amount > monthlyLimit) {
    return {
      action: "reject",
      reason: `Would exceed monthly limit of $${monthlyLimit}`,
      riskFlags: ["monthly_limit"],
    };
  }


  // 7. Exceeded max purchases per week → hard reject
  if (config.num_purchases >= weeklyPurchaseLimit) {
    return {
      action: "reject",
      reason: `Exceeded maximum purchases per week (${weeklyPurchaseLimit})`,
      riskFlags: ["velocity_limit"],
    };
  }

  // 1. Always approve (if always_ask is true)
  if (config.always_ask) {
    return {
      action: "needs_approval",
      reason: "Always ask for approval",
      riskFlags: ["always_ask"],
    };
  }

  // 2. New merchant + block_new_merchants → requires approval
  if (config.block_new_merchants && !isKnownMerchant) {
    riskFlags.push("new_merchant");
    return {
      action: "needs_approval",
      reason: `First purchase from "${purchase.merchant}"`,
      riskFlags,
    };
  }

  // 3. Within 20% of daily limit → requires approval
  if (Number.isFinite(dailyLimit) && todaySpent + purchase.amount > dailyLimit * 0.8) {
    riskFlags.push("near_daily_limit");
    return {
      action: "needs_approval",
      reason: `Purchase would put you at ${(((todaySpent + purchase.amount) / dailyLimit) * 100).toFixed(0)}% of your daily limit`,
      riskFlags,
    };
  }

  // All clear → auto-approve
  return { action: "auto_approve", riskFlags };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 },
      );
    }

    const userId = await getUserFromApiToken(token);
    if (!userId) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 },
      );
    }

    const body: PurchaseRequest = await request.json();
    const {
      item,
      amount,
      currency = "USD",
      merchant,
      merchant_url,
      category,
      international,
    } = body;

    if (!item || !amount || !merchant) {
      return NextResponse.json(
        { error: "Missing required fields: item, amount, merchant" },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    // Expire stale topup_sessions (safety cleanup on each API call)
    await supabase
      .from("topup_sessions")
      .update({
        status: "drained",
        drain_reason: "stale_cleanup",
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString());

    // Verify user has a provisioned wallet
    const { data: walletRow } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (!walletRow) {
      return NextResponse.json(
        { error: "No wallet provisioned. Call /api/provision-wallet first." },
        { status: 400 },
      );
    }

    // Check wallet balance
    if (Number(walletRow.balance) < amount) {
      return NextResponse.json(
        {
          status: "rejected",
          reason: `Insufficient wallet balance. Current balance: $${Number(walletRow.balance).toFixed(2)}, purchase amount: $${amount.toFixed(2)}. Add funds first.`,
        } as PurchaseResult,
      );
    }

    // Fetch user config
    const { data: config } = await supabase
      .from("configs")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Calculate spending
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [todayTxnsRes, monthTxnsRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", userId)
        .eq("status", "completed")
        .gte("created_at", `${today}T00:00:00Z`),
      supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", userId)
        .eq("status", "completed")
        .gte("created_at", monthStart.toISOString()),
    ]);

    const todaySpent = (todayTxnsRes.data || []).reduce(
      (sum, t) => sum + Number(t.amount),
      0,
    );
    const monthSpent = (monthTxnsRes.data || []).reduce(
      (sum, t) => sum + Number(t.amount),
      0,
    );
    const weeklyPurchaseCount = (todayTxnsRes.data || []).length;

    const configRow = config as {
      always_ask?: unknown;
      per_purchase_limit?: unknown;
      daily_limit?: unknown;
      num_purchase_limit?: unknown;
      monthly_limit?: unknown;
      blocked_categories?: unknown;
      block_new_merchants?: unknown;
      block_international?: unknown;
      night_pause?: unknown;
      approval_timeout_seconds?: unknown;
    } | null;

    const rules: RulesConfig = {
      always_ask: Boolean(configRow?.always_ask ?? true),
      per_purchase_limit: parseLimitOrDefault(configRow?.per_purchase_limit, 50),
      daily_limit: parseLimitOrDefault(configRow?.daily_limit, 150),
      num_purchase_limit: parseLimitOrDefault(configRow?.num_purchase_limit, 25),
      num_purchases: weeklyPurchaseCount,
      monthly_limit: parseLimitOrDefault(configRow?.monthly_limit, 500),
      blocked_categories: Array.isArray(configRow?.blocked_categories)
        ? (configRow.blocked_categories as string[])
        : [],
      block_new_merchants: Boolean(configRow?.block_new_merchants ?? true),
      block_international: Boolean(configRow?.block_international ?? false),
      night_pause: Boolean(configRow?.night_pause ?? false),
      approval_timeout_seconds: Number(configRow?.approval_timeout_seconds ?? 300),
    };

    // Check if merchant is known
    const { data: knownMerchant } = await supabase
      .from("known_merchants")
      .select("id")
      .eq("user_id", userId)
      .eq("merchant", merchant)
      .single();

    const isKnownMerchant = !!knownMerchant;

    // Evaluate rules
    const result = evaluateRules(body, rules, todaySpent, monthSpent, isKnownMerchant);

    let response: PurchaseResult;

    if (result.action === "reject") {
      // Record rejected transaction
      await supabase.from("transactions").insert({
        user_id: userId,
        item,
        amount,
        currency,
        merchant,
        merchant_url,
        category,
        status: "rejected",
        rejection_reason: result.reason,
      });

      response = { status: "rejected", reason: result.reason! };
    } else if (result.action === "needs_approval") {
      // Create approval record — no top-up yet (happens on approval)
      const approvalToken = crypto.randomBytes(8).toString("hex");
      const expiresAt = new Date(
        Date.now() + (rules.approval_timeout_seconds || 300) * 1000,
      ).toISOString();

      const { data: approval } = await supabase
        .from("approvals")
        .insert({
          user_id: userId,
          token: approvalToken,
          item,
          amount,
          currency,
          merchant,
          category,
          risk_flags: result.riskFlags,
          expires_at: expiresAt,
        })
        .select()
        .single();

      response = {
        status: "pending_approval",
        approval_id: approval!.id,
        expires_at: expiresAt,
      };

      const approvalChannel = String(
        (config as { approval_channel?: unknown } | null)?.approval_channel || "",
      ).toLowerCase();
      const telegramChatId = String(
        (config as { telegram_chat_id?: unknown } | null)?.telegram_chat_id || "",
      ).trim();

      if (approvalChannel === "telegram" && telegramChatId) {
        try {
          const message = formatApprovalMessage({
            item,
            amount,
            currency,
            merchant,
            expiresAt,
          });
          const sendResult = await sendTelegramMessage(telegramChatId, message);
          if (!sendResult.ok) {
            console.error(
              `[clawpay] approval telegram send failed: ${sendResult.description || "unknown"}`,
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown";
          console.error(`[clawpay] approval telegram send threw: ${message}`);
        }
      }
    } else {
      // Auto-approve: top up the persistent card
      const topUpResult = await stripeMock.topUp({
        user_id: userId,
        amount,
        transaction_id: "", // will update after inserting transaction
        timeout_seconds: 300,
      });

      // Record authorized transaction; checkout completion is finalized via /api/drain.
      const { data: txn, error: txnError } = await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          item,
          amount,
          currency,
          merchant,
          merchant_url,
          category,
          charge_id: walletRow.card_id,
          status: "authorized",
        })
        .select()
        .single();
      if (txnError || !txn) {
        await stripeMock.drain({ user_id: userId, reason: "purchase_rollback_txn" });
        return NextResponse.json(
          { error: "Failed to create authorized transaction" },
          { status: 500 },
        );
      }

      // Create topup session
      const { error: topupError } = await supabase.from("topup_sessions").insert({
        user_id: userId,
        wallet_id: walletRow.id,
        transaction_id: txn.id,
        topup_id: topUpResult.topup_id,
        amount,
        status: "active",
        expires_at: new Date(topUpResult.expires_at * 1000).toISOString(),
      });
      if (topupError) {
        await stripeMock.drain({ user_id: userId, reason: "purchase_rollback_topup" });
        return NextResponse.json(
          { error: "Failed to create top-up session" },
          { status: 500 },
        );
      }

      // Deduct from wallet balance
      const newBalance = Number(walletRow.balance) - amount;
      const { error: walletError } = await supabase
        .from("wallets")
        .update({ balance: newBalance })
        .eq("id", walletRow.id);
      if (walletError) {
        await stripeMock.drain({ user_id: userId, reason: "purchase_rollback_wallet" });
        return NextResponse.json(
          { error: "Failed to update wallet balance" },
          { status: 500 },
        );
      }

      // Record ledger entry
      const { error: ledgerError } = await supabase.from("wallet_ledger").insert({
        user_id: userId,
        wallet_id: walletRow.id,
        type: "purchase_debit",
        amount,
        balance_after: newBalance,
        reference_id: txn.id,
        description: `Authorized purchase: ${item} from ${merchant}`,
      });
      if (ledgerError) {
        await stripeMock.drain({ user_id: userId, reason: "purchase_rollback_ledger" });
        return NextResponse.json(
          { error: "Failed to write wallet ledger entry" },
          { status: 500 },
        );
      }

      // Track merchant as known
      if (!isKnownMerchant) {
        await supabase
          .from("known_merchants")
          .upsert({ user_id: userId, merchant }, { onConflict: "user_id,merchant" });
      }

      // Fetch full card details to return inline
      const card = await stripeMock.getCard(userId);
      if (!card) {
        await stripeMock.drain({ user_id: userId, reason: "purchase_rollback_no_card" });
        return NextResponse.json(
          { error: "Card not found after top-up" },
          { status: 500 },
        );
      }

      response = {
        status: "approved",
        transaction_id: txn.id,
        topup_id: topUpResult.topup_id,
        card_last4: walletRow.card_last4,
        card: {
          card_id: card.id,
          number: card.number,
          exp_month: String(card.exp_month).padStart(2, "0"),
          exp_year: String(card.exp_year),
          cvc: card.cvc,
          brand: card.brand,
          spending_limit: card.spending_limit,
          currency: card.currency,
        },
      };
    }

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
