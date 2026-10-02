alter table public.admin_withdrawals
 add column bank_name text,
 add column account_number text,
 add column account_name text,
 add column reviewed_by uuid references public.profiles(id),
 add column review_note text;

revoke insert,update,delete,truncate,references,trigger on public.admin_withdrawals from anon,authenticated;
drop policy "Admins can view withdrawals" on public.admin_withdrawals;
create policy workplace_read_withdrawals on public.admin_withdrawals for select to authenticated
 using(requested_by=(select auth.uid()) or (select private.is_order_supervisor()));

create function private.workplace_guard_balance() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.admin_balance < old.admin_balance and private.workplace_sanction_until(new.id,'balance') is not null then
  raise exception 'Rekening admin dibekukan. Pengurangan saldo tidak diizinkan selama sanksi.' using errcode='42501';
 end if;
 return new;
end; $$;
create trigger workplace_guard_balance before update of admin_balance on public.profiles for each row execute function private.workplace_guard_balance();

create function private.workplace_guard_balance_adjustment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.delta<0 and private.workplace_sanction_until(new.admin_id,'balance') is not null then
  raise exception 'Rekening admin dibekukan. Pengurangan saldo tidak diizinkan selama sanksi.' using errcode='42501';
 end if;
 return new;
end; $$;
create trigger workplace_guard_balance_adjustment before insert on private.admin_balance_adjustments for each row execute function private.workplace_guard_balance_adjustment();

create function public.workplace_request_withdrawal(p_amount numeric,p_bank text,p_account text,p_name text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); wallet numeric; result uuid;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role='admin') then raise exception 'Hanya admin dapat mengajukan pencairan.' using errcode='42501'; end if;
 select admin_balance into wallet from public.profiles where id=actor for update;
 if private.workplace_sanction_until(actor,'balance') is not null or private.workplace_sanction_until(actor,'withdrawals') is not null then raise exception 'Pengajuan pencairan diblokir selama sanksi.' using errcode='42501'; end if;
 if p_amount is null or p_amount<50000 or p_amount<>trunc(p_amount) then raise exception 'Minimal pencairan Rp50.000, dalam rupiah penuh.'; end if;
 if char_length(trim(coalesce(p_bank,''))) not between 1 and 80 or char_length(trim(coalesce(p_account,''))) not between 3 and 50 or char_length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Isi bank/e-wallet, nomor rekening, dan nama pemilik dengan benar.'; end if;
 perform public.refresh_global_admin_balance();
 select admin_balance into wallet from public.profiles where id=actor;
 if p_amount>wallet then raise exception 'Saldo tidak mencukupi.'; end if;
 if exists(select 1 from public.admin_withdrawals where requested_by=actor and status in ('pending','approved')) then raise exception 'Masih ada pengajuan pencairan yang diproses.'; end if;
 insert into public.admin_withdrawals(requested_by,amount,bank_name,account_number,account_name)
 values(actor,p_amount,trim(p_bank),trim(p_account),trim(p_name)) returning id into result;
 return result;
end; $$;
revoke all on function public.workplace_request_withdrawal(numeric,text,text,text) from public,anon;
grant execute on function public.workplace_request_withdrawal(numeric,text,text,text) to authenticated;

create function public.workplace_review_withdrawal(p_id uuid,p_status text,p_note text) returns void
 language plpgsql security definer set search_path='' as $$
declare request public.admin_withdrawals; wallet numeric; target uuid;
begin
 if not (select private.is_order_supervisor()) then raise exception 'Hanya Supervisor dan Founder dapat meninjau pencairan.' using errcode='42501'; end if;
 if p_status is null or p_status not in ('paid','rejected') then raise exception 'Status pencairan tidak valid.'; end if;
 if char_length(trim(coalesce(p_note,''))) not between 1 and 500 then raise exception 'Isi referensi transfer atau alasan penolakan.'; end if;
 select requested_by into target from public.admin_withdrawals where id=p_id;
 if target is null then raise exception 'Pengajuan tidak ditemukan.'; end if;
 select admin_balance into wallet from public.profiles where id=target for update;
 select * into request from public.admin_withdrawals where id=p_id for update;
 if request.status<>'pending' then raise exception 'Pengajuan sudah diproses.'; end if;
 if request.requested_by=auth.uid() then raise exception 'Pengajuan sendiri harus ditinjau pengelola lain.' using errcode='42501'; end if;
 if p_status='paid' then
  if private.workplace_sanction_until(target,'balance') is not null or private.workplace_sanction_until(target,'withdrawals') is not null then raise exception 'Pencairan diblokir selama sanksi.' using errcode='42501'; end if;
  perform public.refresh_global_admin_balance();
  select admin_balance into wallet from public.profiles where id=target;
  if request.amount>wallet then raise exception 'Saldo admin tidak mencukupi.'; end if;
 end if;
 update public.admin_withdrawals set status=p_status,reviewed_by=auth.uid(),review_note=trim(p_note),
  approved_at=case when p_status='paid' then now() else null end,
  paid_at=case when p_status='paid' then now() else null end where id=p_id;
end; $$;
revoke all on function public.workplace_review_withdrawal(uuid,text,text) from public,anon;
grant execute on function public.workplace_review_withdrawal(uuid,text,text) to authenticated;

