-- One-time codes for Telegram deep-link onboarding
create table telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  code text unique not null,
  used boolean default false,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

alter table telegram_link_codes enable row level security;

create policy "Users can manage own telegram link codes"
  on telegram_link_codes for all
  using (auth.uid() = user_id);
