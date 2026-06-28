begin;

create table if not exists identity.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.users(id) on delete cascade,
  token_hash text not null unique,
  delivery_channel text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint password_reset_tokens_delivery_channel_check check (delivery_channel in ('email', 'sms'))
);

create index if not exists password_reset_tokens_user_idx
  on identity.password_reset_tokens (user_id, created_at desc);

create table if not exists identity.auth_mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.users(id) on delete cascade,
  method_type text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint auth_mfa_challenges_method_type_check check (method_type in ('totp', 'sms', 'email'))
);

create index if not exists auth_mfa_challenges_user_idx
  on identity.auth_mfa_challenges (user_id, created_at desc);

select platform.touch_updated_at('identity', 'users');

commit;
