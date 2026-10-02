alter table public.workplace_violations
 add column sanction_days integer not null default 0 check(sanction_days between 0 and 3650),
 add column block_orders boolean not null default false,
 add column freeze_balance boolean not null default false,
 add column block_withdrawals boolean not null default false;

create function private.workplace_sanction_until(p_admin uuid,p_kind text) returns timestamptz
language sql stable security definer set search_path='' as $$
 select max((v.violation_date + v.sanction_days)::timestamp at time zone 'Asia/Jakarta')
 from public.workplace_violations v
 where v.admin_id=p_admin and not v.resolved and v.sanction_days>0
 and v.violation_date <= (now() at time zone 'Asia/Jakarta')::date
 and (v.violation_date+v.sanction_days)::timestamp at time zone 'Asia/Jakarta' > now()
 and case p_kind when 'orders' then v.block_orders when 'balance' then v.freeze_balance when 'withdrawals' then v.block_withdrawals else false end;
$$;
revoke all on function private.workplace_sanction_until(uuid,text) from public,anon,authenticated;

create function public.workplace_my_sanctions() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('orders_until',private.workplace_sanction_until(auth.uid(),'orders'),'balance_until',private.workplace_sanction_until(auth.uid(),'balance'),'withdrawals_until',private.workplace_sanction_until(auth.uid(),'withdrawals'));
$$;
revoke all on function public.workplace_my_sanctions() from public,anon;
grant execute on function public.workplace_my_sanctions() to authenticated;

create function private.workplace_guard_order_claim() returns trigger language plpgsql security definer set search_path='' as $$
declare until_at timestamptz;
begin
 if new.assigned_to is not null and (tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to) then
  perform 1 from public.profiles where id=new.assigned_to for update;
  until_at := private.workplace_sanction_until(new.assigned_to,'orders');
  if until_at is not null then raise exception 'Admin tidak dapat mengambil order selama sanksi, hingga % WIB.',to_char(until_at at time zone 'Asia/Jakarta','DD/MM/YYYY HH24:MI') using errcode='42501'; end if;
 end if;
 return new;
end; $$;
create trigger workplace_guard_order_claim before insert or update of assigned_to on public.orders for each row execute function private.workplace_guard_order_claim();

create function private.workplace_lock_sanction_admin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.admin_id is distinct from old.admin_id then raise exception 'Admin catatan pelanggaran tidak dapat dipindahkan.'; end if;
 perform 1 from public.profiles where id=new.admin_id for update;
 return new;
end; $$;
create trigger workplace_lock_sanction_admin before insert or update on public.workplace_violations for each row execute function private.workplace_lock_sanction_admin();

