-- 003_stripe_integration.sql
-- Adds Stripe IDs to wallets table and mock card persistence table.

-- Stripe IDs on wallets table (for real Stripe mode)
ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_financial_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_cardholder_id text;

-- Mock card persistence table (for mock mode to survive restarts)
CREATE TABLE IF NOT EXISTS mock_cards (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  card_id text NOT NULL,
  number text NOT NULL,
  last4 text NOT NULL,
  exp_month int NOT NULL,
  exp_year int NOT NULL,
  cvc text NOT NULL,
  spending_limit numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  currency text DEFAULT 'USD',
  created_at timestamptz DEFAULT now()
);
