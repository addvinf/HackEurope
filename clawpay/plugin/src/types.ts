export interface PurchaseRequest {
  item: string;
  amount: number;
  currency: string;
  merchant: string;
  merchant_url?: string;
  category?: string;
  international?: boolean;
}

export interface PurchaseToolInput extends PurchaseRequest {
  userConfirmed: boolean;
}

export type PurchaseResult =
  | {
      status: "approved";
      transaction_id: string;
      /** Top-up session ID — call clawpay_complete with this after checkout */
      topup_id: string;
      card_last4: string;
      /** Full card details for CDP injection — NEVER expose to LLM */
      card: VirtualCardDetails;
    }
  | {
      status: "pending_approval";
      approval_id: string;
      expires_at: string;
    }
  | { status: "rejected"; reason: string };

export interface UserConfig {
  always_ask: boolean;
  per_purchase_limit: number | null;
  daily_limit: number | null;
  monthly_limit: number | null;
  num_purchase_limit: number | null;
  blocked_categories: string[];
  allowed_categories: string[];
  approval_channel: string;
  approval_timeout_seconds: number;
  block_new_merchants: boolean;
  block_international: boolean;
  night_pause: boolean;
  send_receipts: boolean;
  weekly_summary: boolean;
}

export interface ApproveRequest {
  approved: boolean;
}

export interface ApproveResult {
  status: "approved" | "rejected";
  transaction_id?: string;
  topup_id?: string;
  card_last4?: string;
  /** Full card details for CDP injection — NEVER expose to LLM */
  card?: VirtualCardDetails;
}

/**
 * Virtual card details returned by /api/card-details.
 * Contains sensitive data — NEVER expose to the LLM.
 * Used exclusively for CDP injection into checkout forms.
 */
export interface VirtualCardDetails {
  card_id: string;
  number: string;
  exp_month: string;
  exp_year: string;
  cvc: string;
  brand: string;
  spending_limit: number;
  currency: string;
}

export interface DrainRequest {
  topup_id: string;
  success: boolean;
}

export interface DrainResponse {
  status: "drained" | "already_drained";
  drained_amount?: number;
  reason?: string;
  drain_reason?: string;
}

export interface TransactionRecord {
  id: string;
  item: string;
  amount: number;
  currency: string;
  merchant: string;
  status: string;
  created_at: string;
}

export interface SpendingSummary {
  today: number;
  this_week: number;
  this_month: number;
  transaction_count: number;
  recent: TransactionRecord[];
}
