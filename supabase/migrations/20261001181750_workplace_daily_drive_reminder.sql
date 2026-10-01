create or replace function public.workplace_queue_drive_reminder() returns void
language plpgsql security definer set search_path = '' as $$
declare reminder_key text := 'drive-reminder:' || (now() at time zone 'Asia/Jakarta')::date::text;
begin
  insert into public.workplace_push_jobs(subscription_id,event_key,payload)
  select s.id, reminder_key,
    jsonb_build_object('title','Pengingat · JOKI.IN','body','Saatnya mengganti link Google Drive','tag',reminder_key,'tab','home')
  from public.workplace_push_subscriptions s
  join public.profiles p on p.id=s.user_id and p.role='admin'
  on conflict(subscription_id,event_key) do nothing;
  perform public.workplace_dispatch_push();
end;
$$;
revoke all on function public.workplace_queue_drive_reminder() from public, anon, authenticated;
select cron.schedule('workplace-drive-reminder','0 17 * * *','select public.workplace_queue_drive_reminder()');

