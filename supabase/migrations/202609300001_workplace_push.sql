create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table public.workplace_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.workplace_push_jobs (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.workplace_push_subscriptions(id) on delete cascade,
  event_key text not null,
  payload jsonb not null,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_status int,
  created_at timestamptz not null default now(),
  unique(subscription_id, event_key)
);
create index workplace_push_jobs_pending on public.workplace_push_jobs(next_attempt_at) where delivered_at is null;
alter table public.workplace_push_subscriptions enable row level security;
alter table public.workplace_push_jobs enable row level security;
revoke all on public.workplace_push_subscriptions, public.workplace_push_jobs from anon, authenticated;
grant all on public.workplace_push_subscriptions, public.workplace_push_jobs to service_role;
grant usage, select on sequence public.workplace_push_jobs_id_seq to service_role;

create function public.workplace_push_config() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_object_agg(name, decrypted_secret) from vault.decrypted_secrets
  where name in ('workplace_push_public_key','workplace_push_private_key','workplace_push_hook_secret');
$$;
revoke all on function public.workplace_push_config() from public, anon, authenticated;
grant execute on function public.workplace_push_config() to service_role;

create function public.workplace_dispatch_push() returns void
language plpgsql security definer set search_path = '' as $$
declare hook_secret text;
begin
  if not exists(select 1 from public.workplace_push_jobs where delivered_at is null and attempts < 5 and next_attempt_at <= now()) then return; end if;
  select decrypted_secret into hook_secret from vault.decrypted_secrets where name='workplace_push_hook_secret';
  if hook_secret is null then return; end if;
  perform net.http_post(
    url := 'https://xdbnwjvxqtpkoaigedsk.supabase.co/functions/v1/workplace-push/dispatch',
    headers := jsonb_build_object('Content-Type','application/json','X-Webhook-Secret',hook_secret),
    body := '{}'::jsonb, timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function public.workplace_dispatch_push() from public, anon, authenticated;

create function public.workplace_queue_order_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' then return new; end if;
  insert into public.workplace_push_jobs(subscription_id,event_key,payload)
  select s.id, coalesce(nullif(new.order_code,''),tg_table_name || ':' || new.id::text),
    jsonb_build_object('title','Pesanan baru · JOKI.IN','body','Ada pesanan baru masuk. Buka Workplace untuk melihat detail.',
      'tag',coalesce(nullif(new.order_code,''),tg_table_name || ':' || new.id::text),
      'tab',case when tg_table_name='payment_orders' then 'payments' else 'orders' end)
  from public.workplace_push_subscriptions s join public.profiles p on p.id=s.user_id and p.role='admin'
  on conflict(subscription_id,event_key) do nothing;
  perform public.workplace_dispatch_push();
  return new;
exception when others then
  raise warning 'Workplace push queue failed; order remains saved';
  return new;
end;
$$;
revoke all on function public.workplace_queue_order_push() from public, anon, authenticated;
create trigger workplace_order_push after insert on public.orders for each row execute function public.workplace_queue_order_push();
create trigger workplace_checkout_push after insert on public.payment_orders for each row execute function public.workplace_queue_order_push();

create function public.workplace_claim_push_jobs() returns table(job_id bigint, subscription_id uuid, subscription jsonb, payload jsonb)
language sql security definer set search_path = '' as $$
  with due as (
    select j.id from public.workplace_push_jobs j
    join public.workplace_push_subscriptions s on s.id=j.subscription_id
    join public.profiles p on p.id=s.user_id and p.role='admin'
    where j.delivered_at is null and j.attempts < 5 and j.next_attempt_at <= now()
    order by j.id limit 50 for update of j skip locked
  ), claimed as (
    update public.workplace_push_jobs j set attempts=attempts+1,next_attempt_at=now()+interval '2 minutes'
    from due where j.id=due.id returning j.*
  ) select j.id,s.id,s.subscription,j.payload from claimed j join public.workplace_push_subscriptions s on s.id=j.subscription_id;
$$;
revoke all on function public.workplace_claim_push_jobs() from public, anon, authenticated;
grant execute on function public.workplace_claim_push_jobs() to service_role;
select cron.schedule('workplace-push-retry','* * * * *','select public.workplace_dispatch_push()');

-- Job metadata is retained for 7 days; retries stop after 5 attempts.
select cron.schedule('workplace-push-cleanup','17 3 * * *',$job$delete from public.workplace_push_jobs where created_at < now()-interval '7 days'$job$);
