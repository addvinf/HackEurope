create table mock_transactions (
  id uuid primary key default gen_random_uuid(),
  card_details jsonb not null,
  purchase_details jsonb not null,
  created_at timestamptz not null default now()
);
