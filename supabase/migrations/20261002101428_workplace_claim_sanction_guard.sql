create or replace function private.workplace_guard_order_claim() returns trigger language plpgsql security definer set search_path='' as $$
declare until_at timestamptz;
begin
 if new.assigned_to is not null and (tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to) then
  perform 1 from public.profiles where id=new.assigned_to for update;
  until_at := private.workplace_sanction_until(new.assigned_to,'orders');
  if until_at is not null then raise exception 'Admin tidak dapat mengambil order selama sanksi, hingga % WIB.',to_char(until_at at time zone 'Asia/Jakarta','DD/MM/YYYY HH24:MI') using errcode='42501'; end if;
 end if;
 return new;
end; $$;

