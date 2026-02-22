/**
 * ClawPay API client — talks to the ClawPay server over HTTPS.
 *
 * Despite the filename (kept for historical reasons), this is a plain
 * fetch-based HTTP client — Supabase is only on the server side.
 */

export interface ClawPayClient {
  isPaired: boolean;
  apiUrl: string;

  pair(code: string): Promise<{ api_token: string; user_id: string }>;
  setToken(token: string): void;

  purchase(req: PurchaseInput): Promise<PurchaseResponse>;
  complete(topupId: string, success: boolean): Promise<DrainResponse>;
  approve(approved: boolean): Promise<ApproveResponse>;
  getConfig(): Promise<ConfigResponse>;
  getCardDetails(): Promise<CardDetailsResponse>;
}

export interface PurchaseInput {
  item: string;
  amount: number;
  currency?: string;
  merchant: string;
  merchant_url?: string;
  category?: string;
  international?: boolean;
  userConfirmed?: boolean;
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

export type PurchaseResponse =
  | {
      status: "approved";
      transaction_id: string;
      topup_id: string;
      card_last4: string;
      card: CardDetails;
    }
  | { status: "pending_approval"; approval_id: string; expires_at: string }
  | { status: "rejected"; reason: string }
  | { error: string };

export interface DrainResponse {
  status?: string;
  drained_amount?: number;
  reason?: string;
  error?: string;
}

export type ApproveResponse =
  | {
      status: "approved";
      transaction_id: string;
      topup_id: string;
      card_last4: string;
      card: CardDetails;
      amount?: number;
    }
  | { status: "rejected" }
  | { error: string };

export interface ConfigResponse {
  always_ask?: boolean;
  per_purchase_limit?: number;
  daily_limit?: number;
  monthly_limit?: number;
  num_purchase_limit?: number;
  blocked_categories?: string[];
  allowed_categories?: string[];
  approval_channel?: string;
  telegram_chat_id?: string | null;
  approval_timeout_seconds?: number;
  block_new_merchants?: boolean;
  block_international?: boolean;
  night_pause?: boolean;
  send_receipts?: boolean;
  weekly_summary?: boolean;
  error?: string;
}

export interface CardDetailsResponse {
  card_id?: string;
  number?: string;
  exp_month?: string;
  exp_year?: string;
  cvc?: string;
  brand?: string;
  spending_limit?: number;
  currency?: string;
  error?: string;
}

// ── Implementation ──────────────────────────────────────────────────────────

export function createClawPayClient(
  apiUrl: string,
  apiToken: string,
): ClawPayClient {
  let token = apiToken;

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return res.json() as Promise<T>;
  }

  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${apiUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.json() as Promise<T>;
  }

  return {
    get isPaired() {
      return !!token;
    },

    apiUrl,

    setToken(newToken: string) {
      token = newToken;
    },

    async pair(code: string) {
      const res = await fetch(`${apiUrl}/api/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Pairing failed (HTTP ${res.status})`);
      }
      const data = (await res.json()) as { api_token: string; user_id: string };
      token = data.api_token;
      return data;
    },

    purchase: (req) => post<PurchaseResponse>("/api/purchase", req),
    complete: (topupId, success) =>
      post<DrainResponse>("/api/drain", { topup_id: topupId, success }),
    approve: (approved) => post<ApproveResponse>("/api/approve", { approved }),
    getConfig: () => get<ConfigResponse>("/api/config"),
    getCardDetails: () => get<CardDetailsResponse>("/api/card-details"),
  };
}
