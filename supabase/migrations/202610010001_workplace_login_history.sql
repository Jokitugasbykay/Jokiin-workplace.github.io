create table public.workplace_login_history (
  session_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  login_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  provider text not null,
  device text not null
);
alter table public.workplace_login_history enable row level security;
revoke all on public.workplace_login_history from anon, authenticated;
grant select on public.workplace_login_history to authenticated;
create policy workplace_own_login_history on public.workplace_login_history
  for select to authenticated using (user_id = (select auth.uid()));

create function public.workplace_record_login(device text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare session_uuid uuid := (auth.jwt()->>'session_id')::uuid;
begin
  if session_uuid is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception 'Admin session required' using errcode='42501';
  end if;
  insert into public.workplace_login_history(session_id,user_id,provider,device)
  values(session_uuid,auth.uid(),coalesce(auth.jwt()->'app_metadata'->>'provider','unknown'),left(coalesce(device,''),256))
  on conflict(session_id) do update set last_seen_at=now() where workplace_login_history.user_id=auth.uid();
end;
$$;
revoke all on function public.workplace_record_login(text) from public, anon;
grant execute on function public.workplace_record_login(text) to authenticated;
