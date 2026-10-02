alter table public.profiles add column workplace_role text check (workplace_role in ('founder','supervisor','admin','user'));
update public.profiles set workplace_role = case when name='Kayla' then 'founder' when name='Riski' then 'supervisor' else 'admin' end where role='admin';
create function private.protect_workplace_role() returns trigger language plpgsql set search_path='' as $$
begin
  if (tg_op='INSERT' and new.workplace_role is not null) or (tg_op='UPDATE' and new.workplace_role is distinct from old.workplace_role) then
    if current_user in ('anon','authenticated') then raise exception 'Workplace role cannot be changed by clients'; end if;
  end if;
  return new;
end; $$;
create trigger protect_workplace_role before insert or update on public.profiles for each row execute function private.protect_workplace_role();
create function private.is_workplace_founder() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and workplace_role='founder');
$$;
revoke all on function private.is_workplace_founder() from public,anon;
grant execute on function private.is_workplace_founder() to authenticated;
create table public.workplace_violations(
 id uuid primary key default gen_random_uuid(),
 admin_id uuid not null references public.profiles(id),
 violation_date date not null,
 description text not null check(char_length(trim(description)) between 1 and 2000),
 resolved boolean not null default false,
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.workplace_violations enable row level security;
grant select,insert,update on public.workplace_violations to authenticated;
grant all on public.workplace_violations to service_role;
create policy founder_read_violations on public.workplace_violations for select to authenticated using((select private.is_workplace_founder()));
create policy founder_create_violations on public.workplace_violations for insert to authenticated with check((select private.is_workplace_founder()) and created_by=(select auth.uid()) and exists(select 1 from public.profiles where id=admin_id and role='admin'));
create policy founder_update_violations on public.workplace_violations for update to authenticated using((select private.is_workplace_founder())) with check((select private.is_workplace_founder()) and exists(select 1 from public.profiles where id=admin_id and role='admin'));

