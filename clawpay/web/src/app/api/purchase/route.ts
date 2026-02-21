import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { wallet } from "@/lib/stripe";
import type { PurchaseRequest, PurchaseResult } from "@/lib/types";

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function getUserFromToken(token: string) {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("pairing_codes")
    .select("user_id")
    .eq("api_token", token)
    .eq("used", true)
    .single();
  return data?.user_id ?? null;
}

interface RulesConfig {
  always_ask: boolean;
  per_purchase_limit: number;
  daily_limit: number;
  num_purchase_limit: number;
  num_purchases: number;
  monthly_limit: number;
  blocked_categories: string[];
  block_new_merchants: boolean;
  block_international: boolean;
  night_pause: boolean;
  approval_timeout_seconds: number;
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
  if (purchase.amount > Number(config.per_purchase_limit)) {
    return {
      action: "reject",
      reason: `Amount $${purchase.amount} exceeds per-purchase limit of $${config.per_purchase_limit}`,
      riskFlags: ["over_limit"],
    };
  }

  // 5. Today's spend + amount > daily_limit → hard reject
  const dailyLimit = Number(config.daily_limit);
  if (todaySpent + purchase.amount > dailyLimit) {
    return {
      action: "reject",
      reason: `Would exceed daily limit of $${dailyLimit} (already spent $${todaySpent.toFixed(2)} today)`,
      riskFlags: ["daily_limit"],
    };
  }

  // 6. Month spend + amount > monthly_limit → hard reject
  if (monthSpent + purchase.amount > Number(config.monthly_limit)) {
    return {
      action: "reject",
      reason: `Would exceed monthly limit of $${config.monthly_limit}`,
      riskFlags: ["monthly_limit"],
    };
  }


  // 7. Exceeded max purchases per week → hard reject
  if (config.num_purchases >= config.num_purchase_limit) {
    return {
      action: "reject",
      reason: `Exceeded maximum purchases per week (${config.num_purchase_limit})`,
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
  if (todaySpent + purchase.amount > dailyLimit * 0.8) {
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

    const userId = await getUserFromToken(token);
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

    // Fetch user config
    const { data: config } = await supabase
      .from("configs")
      .select("*")
      .eq("user_id", userId)
      .single();

    const rules: RulesConfig = config || {
      always_ask: true,
      per_purchase_limit: 50,
      daily_limit: 150,
      monthly_limit: 500,
      blocked_categories: [],
      block_new_merchants: true,
      block_international: false,
      night_pause: false,
      approval_timeout_seconds: 300,
    };

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
        approval_token: approvalToken,
        expires_at: expiresAt,
      };
    } else {
      // Auto-approve: top up the persistent card
      const topUpResult = await wallet.topUp({
        user_id: userId,
        amount,
        transaction_id: "", // will update after inserting transaction
        timeout_seconds: 120,
      });

      // Record transaction
      const { data: txn } = await supabase
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
          status: "completed",
        })
        .select()
        .single();

      // Create topup session
      await supabase.from("topup_sessions").insert({
        user_id: userId,
        wallet_id: walletRow.id,
        transaction_id: txn!.id,
        topup_id: topUpResult.topup_id,
        amount,
        status: "active",
        expires_at: new Date(topUpResult.expires_at * 1000).toISOString(),
      });

      // Update wallet balance
      await supabase
        .from("wallets")
        .update({ balance: amount })
        .eq("id", walletRow.id);

      // Track merchant as known
      if (!isKnownMerchant) {
        await supabase
          .from("known_merchants")
          .upsert({ user_id: userId, merchant }, { onConflict: "user_id,merchant" });
      }

      response = {
        status: "approved",
        transaction_id: txn!.id,
        topup_id: topUpResult.topup_id,
        card_last4: walletRow.card_last4,
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
