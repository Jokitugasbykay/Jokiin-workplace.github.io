begin;
set local role authenticated;
do $$
declare checkout_id uuid; detail jsonb;
begin
 perform set_config('request.jwt.claim.sub','73a14e88-9421-4936-ba99-745768343a13',true);
 select id into checkout_id from public.payment_orders where payment_status='PENDING' limit 1;
 if checkout_id is null then raise exception 'Test needs one unpaid checkout'; end if;
 detail := public.workplace_checkout_detail(checkout_id);
 if not detail ? 'task' or detail->>'payment_status'<>'PENDING' then raise exception 'Riski missing unpaid task'; end if;
 perform set_config('request.jwt.claim.sub','92e7a1cb-2136-496a-913b-00cd402c04f5',true);
 if public.workplace_checkout_detail(checkout_id) is distinct from detail then raise exception 'Kayla missing task'; end if;
 perform set_config('request.jwt.claim.sub','c37f5efb-980c-4be3-9855-c219420c3687',true);
 begin
  perform public.workplace_checkout_detail(checkout_id);
  raise exception 'Other admin can read task';
 exception when insufficient_privilege then null;
 end;
 begin
  perform task from public.payment_orders where id=checkout_id;
  raise exception 'Task exposed through direct SELECT';
 exception when insufficient_privilege then null;
 end;
 if not exists(select 1 from public.payment_orders where id=checkout_id) then raise exception 'Other admin lost checkout summary'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.workplace_checkout_detail(checkout_id);
  raise exception 'Unauthenticated session can read task';
 exception when insufficient_privilege then null;
 end;
end;
$$;
reset role;
rollback;
select 'PASS: Riski/Kayla unpaid detail, other admins denied, direct task SELECT denied, summaries retained' as result;
