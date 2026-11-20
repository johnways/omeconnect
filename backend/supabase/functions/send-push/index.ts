// OMECOnnect "send-push" Edge Function: sends a phone pop-up (Web Push) for a
// new row in public.notifications. Called by the database trigger
// push_on_new_notification (see backend/database/migrations/phase13_push_notifications.sql) with
// a shared secret from Supabase Vault. Deployed with verify_jwt = false
// because the caller is the database, not a signed-in user.
//
// POST { "action": "ensure-keys" }      -> creates the push keys once (server-side
//                                          only) and returns the PUBLIC key.
// POST { "notification_id": "<uuid>" } -> (needs x-push-secret) sends the pop-up.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false }
});

type PushConfig = { public_key: string | null; private_key: string | null; hook_secret: string | null };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function base64Url(bytes: ArrayBuffer): string {
  let text = '';
  new Uint8Array(bytes).forEach((b) => { text += String.fromCharCode(b); });
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function loadConfig(): Promise<PushConfig> {
  const { data, error } = await db.rpc('push_service_config');
  if (error) throw new Error(`config: ${error.message}`);
  return data as PushConfig;
}

async function ensureKeys(): Promise<PushConfig> {
  const config = await loadConfig();
  if (config.public_key && config.private_key) return config;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicRaw = await crypto.subtle.exportKey('raw', pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const { error } = await db.rpc('push_service_store_keys', { p_public: base64Url(publicRaw), p_private: privateJwk.d });
  if (error) throw new Error(`store keys: ${error.message}`);
  return loadConfig();
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  try {
    if (body.action === 'ensure-keys') {
      const config = await ensureKeys();
      return json({ public_key: config.public_key });
    }

    const config = await loadConfig();
    const given = req.headers.get('x-push-secret') || '';
    if (!config.hook_secret || !sameSecret(given, config.hook_secret)) return json({ error: 'Forbidden.' }, 403);
    if (!config.public_key || !config.private_key) return json({ error: 'Push keys not set up.' }, 503);

    const notificationId = String(body.notification_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(notificationId)) return json({ error: 'notification_id required.' }, 400);

    const { data: note, error: noteError } = await db
      .from('notifications').select('id,user_id,title,message,type').eq('id', notificationId).maybeSingle();
    if (noteError) throw new Error(`notification: ${noteError.message}`);
    if (!note || !note.user_id) return json({ sent: 0, reason: 'no notification' });

    const { data: subs, error: subError } = await db
      .from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', note.user_id);
    if (subError) throw new Error(`subscriptions: ${subError.message}`);
    if (!subs || !subs.length) return json({ sent: 0, reason: 'no devices' });

    // Admin alerts open the dashboard; everything else opens the customer app.
    const isAdminAlert = String(note.type || '').startsWith('admin_');
    const payload = JSON.stringify({
      title: note.title || 'OMECOnnect',
      body: note.message || '',
      url: isAdminAlert ? '/admin-dashboard/index.html' : '/customer-mobile-app/index.html',
      tag: note.id
    });

    webpush.setVapidDetails('https://omeconnect.vercel.app', config.public_key, config.private_key);

    let sent = 0;
    let removed = 0;
    const failures: string[] = [];
    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86400, urgency: 'high' }
        );
        sent += 1;
        await db.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', sub.id);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // The phone unsubscribed or the app was removed: forget it.
          await db.from('push_subscriptions').delete().eq('id', sub.id);
          removed += 1;
        } else {
          failures.push(String(status || (error as Error).message).slice(0, 120));
        }
      }
    }));

    return json({ sent, removed, failures });
  } catch (error) {
    console.error('send-push failed:', (error as Error).message);
    return json({ error: 'Push failed.' }, 500);
  }
});
