-- Wallet ledger for full audit trail of all balance movements
CREATE TABLE wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  wallet_id uuid REFERENCES wallets(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,             -- 'deposit' | 'purchase_debit' | 'refund'
  amount numeric NOT NULL,        -- always positive
  balance_after numeric NOT NULL,
  reference_id text,              -- transaction_id or checkout_session_id
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own ledger" ON wallet_ledger FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_wallet_ledger_user ON wallet_ledger(user_id, created_at DESC);
