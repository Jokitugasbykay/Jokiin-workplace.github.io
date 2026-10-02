-- Run inside BEGIN / ROLLBACK: fixtures, queue entries and changes do not persist.
begin;
do $$
declare prefix text := 'EXPIRY-CHECK-' || gen_random_uuid()::text;
begin
 perform set_config('request.jwt.claim.sub','73a14e88-9421-4936-ba99-745768343a13',true);
 insert into public.orders(order_code,status,payment_status,created_at)
 values (prefix||'-expired','cancelled','PENDING',now()-interval '25 hours'),
        (prefix||'-recent','cancelled','PENDING',now()-interval '23 hours'),
        (prefix||'-boundary','cancelled','PENDING',now()-interval '24 hours'),
        (prefix||'-paid','cancelled','PAID',now()-interval '3 days'),
        (prefix||'-proof','cancelled','PENDING',now()-interval '3 days'),
        (prefix||'-processing','cancelled','PENDING',now()-interval '3 days'),
        (prefix||'-manual','cancelled','PENDING',now()-interval '3 days');
 update public.orders set status=case when order_code=prefix||'-processing' then 'processing' else 'pending' end
 where order_code like prefix||'-%' and order_code<>prefix||'-manual';
 insert into public.payments(order_id,status) select id,'paid' from public.orders where order_code=prefix||'-proof';
 insert into public.payment_orders(order_code,customer,items,total_price,status,payment_status,created_at)
 values (prefix||'-expired','{}','[]',0,'cancelled','PENDING',now()-interval '25 hours'),
        (prefix||'-recent','{}','[]',0,'cancelled','PENDING',now()-interval '23 hours'),
        (prefix||'-paid','{}','[]',0,'cancelled','PENDING',now()-interval '3 days'),
        (prefix||'-proof','{}','[]',0,'cancelled','PENDING',now()-interval '3 days');
 update public.payment_orders set status='pending' where order_code like prefix||'-%';
 perform set_config('request.jwt.claim.sub','',true);
 perform private.workplace_cancel_unpaid_orders();
 if (select count(*) from public.orders where order_code in(prefix||'-expired',prefix||'-boundary') and status='cancelled' and auto_cancelled_at is not null)<>2 then raise exception 'Expired/boundary order was not cancelled'; end if;
 if (select count(*) from public.orders where order_code in(prefix||'-recent',prefix||'-paid',prefix||'-proof') and status='pending' and auto_cancelled_at is null)<>3 then raise exception 'Recent or paid order was cancelled'; end if;
 if not exists(select 1 from public.orders where order_code=prefix||'-processing' and status='processing') then raise exception 'Processing order was cancelled'; end if;
 if not exists(select 1 from public.payment_orders where order_code=prefix||'-expired' and payment_status='CANCELED' and auto_cancelled_at is not null) then raise exception 'Expired checkout was not cancelled'; end if;
 if (select count(*) from public.payment_orders where order_code in(prefix||'-recent',prefix||'-paid',prefix||'-proof') and payment_status='PENDING')<>3 then raise exception 'Checkout payment proof ignored'; end if;
 if private.workplace_cancel_unpaid_orders() <> '{"checkouts_cancelled":0,"orders_cancelled":0}'::jsonb then raise exception 'Expiry is not idempotent'; end if;
 update public.payment_orders set payment_status='PAID',paid_at=now() where order_code=prefix||'-expired';
 if not exists(select 1 from public.payment_orders where order_code=prefix||'-expired' and status='pending' and auto_cancelled_at is null) then raise exception 'Delayed checkout payment not restored'; end if;
 if not exists(select 1 from public.orders where order_code=prefix||'-expired' and status='pending' and payment_status='PAID' and auto_cancelled_at is null) then raise exception 'Delayed Mayar payment not synced/restored'; end if;
 update public.orders set payment_status='PAID' where order_code=prefix||'-manual';
 if not exists(select 1 from public.orders where order_code=prefix||'-manual' and status='cancelled') then raise exception 'Manual cancellation was restored'; end if;
 if has_function_privilege('authenticated','private.workplace_cancel_unpaid_orders()','EXECUTE') or has_function_privilege('anon','private.workplace_cancel_unpaid_orders()','EXECUTE') then raise exception 'Expiry callable from public client'; end if;
end;
$$;
rollback;
select 'PASS: expiry, boundary, recent/paid protection, idempotency, delayed payment, manual cancellation and permissions' as result;
