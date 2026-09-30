import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const origins = new Set(['https://jokitugasbykay.github.io', 'http://localhost:3000']);
const pushHosts = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);
const base64url = /^[A-Za-z0-9_-]+$/;

function validSubscription(value) {
  try {
    const url = new URL(value.endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (pushHosts.has(url.hostname) || url.hostname.endsWith('.notify.windows.com'))
      && value.endpoint.length < 4096 && base64url.test(value.keys.p256dh) && value.keys.p256dh.length === 87
      && base64url.test(value.keys.auth) && value.keys.auth.length === 22;
  } catch { return false; }
}

async function send(subscription, payload, config) {
  const details = webpush.generateRequestDetails(subscription, JSON.stringify(payload), {
    TTL: 3600, urgency: 'high', vapidDetails: {
      subject: 'https://jokitugasbykay.github.io/Jokiin-workplace.github.io/',
      publicKey: config.workplace_push_public_key, privateKey: config.workplace_push_private_key
    }
  });
  return fetch(details.endpoint, { method: details.method, headers: details.headers, body: details.body,
    redirect: 'error', signal: AbortSignal.timeout(10000) });
}

Deno.serve(async req => {
  const origin = req.headers.get('origin');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
    'Access-Control-Allow-Origin': origins.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
  if (req.method === 'OPTIONS') return reply(origins.has(origin) ? 200 : 403, {});
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  const route = new URL(req.url).pathname.split('/').pop();
  try {
    const { data: config, error: configError } = await db.rpc('workplace_push_config');
    if (configError || !config?.workplace_push_private_key) return reply(503, { error: 'Push belum dikonfigurasi.' });
    if (route === 'dispatch') {
      if (req.headers.get('x-webhook-secret') !== config.workplace_push_hook_secret) return reply(401, { error: 'Unauthorized' });
      const { data: jobs, error } = await db.rpc('workplace_claim_push_jobs');
      if (error) throw error;
      // ponytail: at most 50 jobs per dispatch; next minute handles the remainder.
      let delivered = 0;
      for (let offset = 0; offset < jobs.length; offset += 10) {
        await Promise.all(jobs.slice(offset, offset + 10).map(async job => {
          try {
            if (!validSubscription(job.subscription)) throw Error('Invalid subscription');
            const res = await send(job.subscription, job.payload, config);
            if (res.status === 404 || res.status === 410) {
              await db.from('workplace_push_subscriptions').delete().eq('id', job.subscription_id);
            } else {
              const update = { last_status: res.status, ...(res.ok ? { delivered_at: new Date().toISOString() } : {}) };
              const { error: saveError } = await db.from('workplace_push_jobs').update(update).eq('id', job.job_id);
              if (saveError) throw saveError;
              if (res.ok) delivered++;
            }
          } catch { await db.from('workplace_push_jobs').update({ last_status: 0 }).eq('id', job.job_id); }
        }));
      }
      return reply(200, { claimed: jobs.length, delivered });
    }
    if (!origins.has(origin)) return reply(403, { error: 'Origin not allowed' });
    const bearer = req.headers.get('authorization') || '';
    if (!bearer.startsWith('Bearer ')) return reply(401, { error: 'Masuk ulang untuk mengaktifkan notifikasi.' });
    const { data: auth, error: authError } = await db.auth.getUser(bearer.slice(7));
    if (authError || !auth?.user) return reply(401, { error: 'Sesi tidak valid. Silakan masuk ulang.' });
    const input = await req.json();
    if (route === 'unsubscribe') {
      const { error } = await db.from('workplace_push_subscriptions').delete().eq('user_id', auth.user.id).eq('endpoint', input.endpoint);
      if (error) throw error;
      return reply(200, { ok: true });
    }
    const { data: profile } = await db.from('profiles').select('role').eq('id', auth.user.id).single();
    if (profile?.role !== 'admin') return reply(403, { error: 'Hanya admin yang dapat mengaktifkan notifikasi.' });
    if (route === 'config') return reply(200, { publicKey: config.workplace_push_public_key });
    if (!validSubscription(input.subscription)) return reply(400, { error: 'Langganan perangkat tidak valid.' });
    if (route === 'subscribe') {
      const { error } = await db.from('workplace_push_subscriptions').upsert({ user_id: auth.user.id,
        endpoint: input.subscription.endpoint, subscription: input.subscription, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' });
      if (error) throw error;
      return reply(200, { ok: true });
    }
    if (route === 'test') {
      const { data: owned } = await db.from('workplace_push_subscriptions').select('subscription')
        .eq('user_id', auth.user.id).eq('endpoint', input.subscription.endpoint).single();
      if (!owned) return reply(404, { error: 'Aktifkan notifikasi pada perangkat ini terlebih dahulu.' });
      const res = await send(owned.subscription, { title: 'Tes notifikasi · JOKI.IN', body: 'Notifikasi perangkat ini berhasil terhubung.', tab: 'home', tag: 'workplace-test' }, config);
      return reply(res.ok ? 200 : 502, { ok: res.ok, ...(res.ok ? {} : { error: 'Layanan push belum menerima notifikasi tes.' }) });
    }
    return reply(404, { error: 'Not found' });
  } catch {
    return reply(500, { error: 'Notifikasi gagal diproses. Coba lagi.' });
  }
});
