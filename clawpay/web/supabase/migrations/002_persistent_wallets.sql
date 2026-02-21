-- Persistent wallet: one virtual card per user, normally $0 balance
create table wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  card_id text unique not null,
  card_last4 text not null,
  card_brand text default 'visa',
  balance numeric default 0,
  currency text default 'USD',
  status text default 'active',
  created_at timestamptz default now()
);

-- Top-up sessions: track each funded window
create table topup_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  wallet_id uuid references wallets(id) on delete cascade not null,
  transaction_id uuid references transactions(id) on delete set null,
  topup_id text unique not null,
  amount numeric not null,
  status text default 'active',    -- active | completed | drained
  drain_reason text,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- RLS
alter table wallets enable row level security;
alter table topup_sessions enable row level security;
create policy "Users can view own wallet" on wallets for all using (auth.uid() = user_id);
create policy "Users can view own topups" on topup_sessions for all using (auth.uid() = user_id);
