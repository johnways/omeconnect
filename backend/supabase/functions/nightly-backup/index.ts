// OMECOnnect nightly backup.
// Writes a gzip-compressed JSON copy of the main tables to the private
// "backups" Storage bucket (backups/YYYY-MM-DD/omeconnect-YYYY-MM-DD.json.gz)
// and keeps the last 14 days.
//
// Called by:
//   - pg_cron every night at 2:00 AM PH time (header x-backup-secret from Vault)
//   - a supervisor pressing "Back up now" in the admin console (their sign-in)
// Uses the built-in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never sent to browsers).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KEEP_DAYS = 14;
const TABLES = [
  'users', 'customer_accounts', 'electricity_bills', 'payments', 'meter_readings',
  'account_verification_requests', 'complaints', 'complaint_status_history',
  'announcements', 'admin_accounts', 'audit_logs', 'service_areas', 'app_settings',
  // Added in the restore drill (Nov 2026): the rate schedule every bill is computed
  // from, and customers' notification history.
  'electricity_rates', 'notifications',
];
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-backup-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const service = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function rpc(name: string, args: unknown, headers: Record<string, string>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(args ?? {}),
  });
  if (!r.ok) return null;
  return r.json();
}

async function allowed(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-backup-secret');
  if (secret) return (await rpc('backup_hook_secret_matches', { p_secret: secret }, service)) === true;
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const anon = req.headers.get('apikey') || '';
  return (await rpc('staff_role', {}, { apikey: anon || SERVICE_KEY, Authorization: auth })) === 'supervisor';
}

async function readTable(table: string) {
  const rows: unknown[] = [];
  for (let offset = 0; offset < 2_000_000; offset += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1000&offset=${offset}`, { headers: service });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
    const batch = await r.json();
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function pruneOld() {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/backups`, {
    method: 'POST', headers: { ...service, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!r.ok) return 0;
  const folders: { name: string }[] = await r.json();
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  const old = folders.map((f) => f.name).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n) && n < cutoff);
  if (!old.length) return 0;
  const prefixes = old.map((day) => `${day}/omeconnect-${day}.json.gz`);
  await fetch(`${SUPABASE_URL}/storage/v1/object/backups`, {
    method: 'DELETE', headers: { ...service, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes }),
  });
  return old.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!(await allowed(req))) return json({ error: 'Not allowed' }, 401);

  try {
    const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); // Philippine date
    const data: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      data[table] = await readTable(table);
      counts[table] = data[table].length;
    }
    const body = await gzip(JSON.stringify({ app: 'OMECOnnect', created_at: new Date().toISOString(), counts, data }));
    const path = `${day}/omeconnect-${day}.json.gz`;
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/backups/${path}`, {
      method: 'POST', headers: { ...service, 'Content-Type': 'application/gzip', 'x-upsert': 'true' }, body,
    });
    if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
    const pruned = await pruneOld();
    return json({ ok: true, path, bytes: body.length, counts, pruned });
  } catch (error) {
    console.error('Backup failed:', error);
    return json({ ok: false, error: String((error as Error).message || error) }, 500);
  }
});
