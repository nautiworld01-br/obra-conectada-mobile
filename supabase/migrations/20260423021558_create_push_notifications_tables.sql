create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  platform text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_push_at timestamptz,
  last_failure_at timestamptz,
  failure_code text,
  revoked_at timestamptz,
  constraint push_subscriptions_status_check check (status in ('active', 'revoked', 'expired', 'failed_permanent'))
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
create index if not exists push_subscriptions_status_idx on public.push_subscriptions (status);
create index if not exists push_subscriptions_active_user_idx
  on public.push_subscriptions (user_id)
  where status = 'active' and revoked_at is null;

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
create policy "Users can read own push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own push subscriptions" on public.push_subscriptions;
create policy "Users can insert own push subscriptions"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
create policy "Users can update own push subscriptions"
  on public.push_subscriptions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
create policy "Users can delete own push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());

drop trigger if exists update_push_subscriptions_updated_at on public.push_subscriptions;
create trigger update_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row
  execute function public.update_updated_at_column();

create table if not exists public.push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  event_key text,
  tag text,
  status text not null,
  response_code integer,
  error_message text,
  created_at timestamptz not null default now(),
  constraint push_delivery_attempts_status_check check (status in ('sent', 'failed', 'skipped', 'duplicate'))
);

create index if not exists push_delivery_attempts_user_id_idx on public.push_delivery_attempts (user_id);
create index if not exists push_delivery_attempts_subscription_id_idx on public.push_delivery_attempts (subscription_id);
create index if not exists push_delivery_attempts_event_key_idx on public.push_delivery_attempts (event_key);

alter table public.push_delivery_attempts enable row level security;

drop policy if exists "Users can read own push delivery attempts" on public.push_delivery_attempts;
create policy "Users can read own push delivery attempts"
  on public.push_delivery_attempts
  for select
  to authenticated
  using (user_id = auth.uid());
