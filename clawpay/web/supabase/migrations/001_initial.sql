-- Users managed by Supabase Auth (auth.users)

-- Payment methods (mock tokens for now)
create table cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  token text not null,
  last4 text not null,
  brand text not null,
  exp_month int not null,
  exp_year int not null,
  name_on_card text,
  is_default boolean default true,
  created_at timestamptz default now()
);

-- User spending rules / config
create table configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  per_purchase_limit numeric default 50,
  daily_limit numeric default 150,
  monthly_limit numeric default 500,
  blocked_categories text[] default '{}',
  allowed_categories text[] default '{}',
  approval_channel text default 'whatsapp',
  approval_timeout_seconds int default 300,
  block_new_merchants boolean default true,
  block_international boolean default false,
  night_pause boolean default false,
  send_receipts boolean default true,
  weekly_summary boolean default true,
  updated_at timestamptz default now()
);

-- Transaction history
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  item text not null,
  amount numeric not null,
  currency text default 'USD',
  merchant text not null,
  merchant_url text,
  category text,
  charge_id text,
  status text not null,
  rejection_reason text,
  created_at timestamptz default now()
);

-- Pending approvals
create table approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  token text unique not null,
  item text not null,
  amount numeric not null,
  currency text default 'USD',
  merchant text not null,
  category text,
  status text default 'pending',
  risk_flags text[],
  expires_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

-- Pairing codes for OpenClaw plugin
create table pairing_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  code text unique not null,
  api_token text unique not null,
  used boolean default false,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- Known merchants (for new merchant detection)
create table known_merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  merchant text not null,
  first_seen_at timestamptz default now(),
  unique(user_id, merchant)
);

-- RLS policies
alter table cards enable row level security;
alter table configs enable row level security;
alter table transactions enable row level security;
alter table approvals enable row level security;
alter table pairing_codes enable row level security;
alter table known_merchants enable row level security;

create policy "Users can manage own cards" on cards for all using (auth.uid() = user_id);
create policy "Users can manage own config" on configs for all using (auth.uid() = user_id);
create policy "Users can view own transactions" on transactions for all using (auth.uid() = user_id);
create policy "Users can manage own approvals" on approvals for all using (auth.uid() = user_id);
create policy "Users can manage own pairing codes" on pairing_codes for all using (auth.uid() = user_id);
create policy "Users can manage own merchants" on known_merchants for all using (auth.uid() = user_id);
