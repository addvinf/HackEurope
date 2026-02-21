export interface Card {
  id: string;
  user_id: string;
  token: string;
  last4: string;
  brand: string;
  exp_month: number;
  exp_year: number;
  name_on_card: string | null;
  is_default: boolean;
  created_at: string;
}

export interface Config {
  id: string;
  user_id: string;
  always_ask: boolean;
  per_purchase_limit: number;
  daily_limit: number;
  monthly_limit: number;
  num_purchase_limit: number;
  blocked_categories: string[];
  allowed_categories: string[];
  approval_channel: string;
  telegram_chat_id: string | null;
  approval_timeout_seconds: number;
  block_new_merchants: boolean;
  block_international: boolean;
  night_pause: boolean;
  send_receipts: boolean;
  weekly_summary: boolean;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  item: string;
  amount: number;
  currency: string;
  merchant: string;
  merchant_url: string | null;
  category: string | null;
  charge_id: string | null;
  status: "authorized" | "completed" | "rejected" | "cancelled";
  rejection_reason: string | null;
  created_at: string;
}

export interface Approval {
  id: string;
  user_id: string;
  token: string;
  item: string;
  amount: number;
  currency: string;
  merchant: string;
  category: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  risk_flags: string[];
  expires_at: string;
  resolved_at: string | null;
  created_at: string;
}

export interface PairingCode {
  id: string;
  user_id: string;
  code: string;
  api_token: string;
  used: boolean;
  expires_at: string;
  created_at: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  card_id: string;
  card_last4: string;
  card_brand: string;
  balance: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface TopUpSession {
  id: string;
  user_id: string;
  wallet_id: string;
  transaction_id: string | null;
  topup_id: string;
  amount: number;
  status: "active" | "completed" | "drained";
  drain_reason: string | null;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface PurchaseRequest {
  item: string;
  amount: number;
  currency?: string;
  merchant: string;
  merchant_url?: string;
  category?: string;
  /** Whether the merchant is international (used by block_international rule) */
  international?: boolean;
}

export interface WalletLedgerEntry {
  id: string;
  user_id: string;
  wallet_id: string;
  type: "deposit" | "purchase_debit" | "refund";
  amount: number;
  balance_after: number;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export interface CardDetails {
  card_id: string;
  number: string;
  exp_month: string;
  exp_year: string;
  cvc: string;
  brand: string;
  spending_limit: number;
  currency: string;
}

export type PurchaseResult =
  | {
      status: "approved";
      transaction_id: string;
      /** Top-up session ID — plugin calls clawpay_complete with this after checkout */
      topup_id: string;
      /** Last 4 digits of the persistent virtual card (safe to show) */
      card_last4: string;
      /** Full card details for CDP injection — NEVER expose to LLM */
      card: CardDetails;
    }
  | {
      status: "pending_approval";
      approval_id: string;
      expires_at: string;
    }
  | { status: "rejected"; reason: string };

export type ApproveResult =
  | {
      status: "approved";
      transaction_id: string;
      topup_id: string;
      card_last4: string;
      /** Full card details for CDP injection — NEVER expose to LLM */
      card: CardDetails;
    }
  | {
      status: "rejected";
    };
