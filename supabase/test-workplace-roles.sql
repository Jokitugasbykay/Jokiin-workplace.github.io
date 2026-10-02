begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where workplace_role='founder' limit 1),true);
set local role authenticated;
do $$ declare test_id uuid; begin
 insert into public.workplace_violations(admin_id,violation_date,description)
 select id,current_date,'Test rollback' from public.profiles where workplace_role='supervisor' returning id into test_id;
 assert test_id is not null, 'Founder insert failed';
 update public.workplace_violations set resolved=true where id=test_id;
 assert exists(select 1 from public.workplace_violations where id=test_id and resolved), 'Founder update failed';
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where workplace_role='supervisor' limit 1),true);
set local role authenticated;
do $$ declare denied boolean := false; begin
 assert not exists(select 1 from public.workplace_violations), 'Supervisor can read Founder records';
 begin
  insert into public.workplace_violations(admin_id,violation_date,description) values(auth.uid(),current_date,'Denied');
 exception when insufficient_privilege then denied := true;
 end;
 assert denied, 'Supervisor can insert violation';
 denied := false;
 begin
  update public.profiles set workplace_role='founder' where id=auth.uid();
 exception when raise_exception or insufficient_privilege then denied := true;
 end;
 assert denied, 'Supervisor can promote self';
end $$;
rollback;
