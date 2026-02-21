import type {
  PurchaseRequest,
  PurchaseResult,
  UserConfig,
  ApproveRequest,
  ApproveResult,
  VirtualCardDetails,
  DrainRequest,
  DrainResponse,
} from "./types.js";

/**
 * HTTP client for the ClawPay website API.
 * All calls are authenticated via the pairing token.
 */
export class ClawPayClient {
  constructor(
    private apiUrl: string,
    private apiToken: string,
  ) {}

  get isPaired(): boolean {
    return !!this.apiToken;
  }

  setToken(token: string) {
    this.apiToken = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.apiUrl.replace(/\/$/, "")}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res
        .json()
        .catch(() => ({ error: res.statusText })) as { error?: string };
      const apiError = body.error || res.statusText;

      if (res.status === 401) {
        throw new Error(
          `Authentication failed (401): ${apiError}. Pair again with /clawpay-pair <code>.`,
        );
      }
      if (res.status === 400) {
        throw new Error(`Request rejected (400): ${apiError}`);
      }
      if (res.status >= 500) {
        throw new Error(`ClawPay API unavailable (${res.status}): ${apiError}`);
      }
      throw new Error(`ClawPay API error (${res.status}): ${apiError}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Exchange a 6-digit pairing code for an API token.
   */
  async pair(code: string): Promise<{ api_token: string; user_id: string }> {
    const url = `${this.apiUrl.replace(/\/$/, "")}/api/pair`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!res.ok) {
      const body = await res
        .json()
        .catch(() => ({ error: res.statusText })) as { error?: string };
      const apiError = body.error || res.statusText;
      if (res.status === 400 || res.status === 401) {
        throw new Error(`Pairing failed: ${apiError}`);
      }
      if (res.status >= 500) {
        throw new Error(`Pairing backend unavailable (${res.status}): ${apiError}`);
      }
      throw new Error(`Pairing API error (${res.status}): ${apiError}`);
    }

    return res.json() as Promise<{ api_token: string; user_id: string }>;
  }

  /**
   * Fetch user's spending rules / config.
   */
  async getConfig(): Promise<UserConfig> {
    return this.request<UserConfig>("/api/config");
  }

  /**
   * Submit a purchase attempt. Returns auto-approved, pending approval, or rejected.
   */
  async purchase(req: PurchaseRequest): Promise<PurchaseResult> {
    return this.request<PurchaseResult>("/api/purchase", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  /**
   * Approve or reject a pending purchase.
   */
  async resolveApproval(req: ApproveRequest): Promise<ApproveResult> {
    return this.request<ApproveResult>("/api/approve", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  /**
   * Fetch persistent card details for CDP injection.
   * Only succeeds while an active top-up session exists (card is funded).
   *
   * SECURITY: The returned data contains the full card number, CVC, etc.
   * It must NEVER be passed to the LLM context. The plugin uses this
   * data exclusively with CDP Runtime.evaluate to fill checkout forms.
   */
  async getCardDetails(): Promise<VirtualCardDetails> {
    return this.request<VirtualCardDetails>("/api/card-details");
  }

  /**
   * Drain the persistent card back to $0 after checkout.
   * Called by the clawpay_complete tool.
   */
  async drain(req: DrainRequest): Promise<DrainResponse> {
    return this.request<DrainResponse>("/api/drain", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }
}

export function createClawPayClient(
  apiUrl: string,
  apiToken: string,
): ClawPayClient {
  return new ClawPayClient(apiUrl || "https://clawpay.tech", apiToken || "");
}
