alter table configs
add column if not exists always_ask boolean not null default true,
add column if not exists num_purchase_limit int not null default 25;
