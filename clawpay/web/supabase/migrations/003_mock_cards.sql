-- 003_mock_cards.sql
-- Mock card persistence table (survives server restarts)

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
