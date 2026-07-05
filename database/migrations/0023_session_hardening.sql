begin;

alter table identity.user_sessions
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists device_hash varchar(64);

-- Update existing sessions to have last_activity_at match created_at
update identity.user_sessions
  set last_activity_at = created_at
  where last_activity_at is null;

select platform.touch_updated_at('identity', 'user_sessions');

commit;
