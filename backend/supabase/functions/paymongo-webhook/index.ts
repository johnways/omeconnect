// OMECOnnect: PayMongo tells us a checkout was paid. Verifies PayMongo's
// signature, then marks the payment paid, lowers the bill balance and notifies
// the customer. Safe to receive the same event twice.
//
// Secrets: PAYMONGO_WEBHOOK_SECRET (whsk_... from the PayMongo webhook you create)
// PayMongo webhook URL: https://<project>.supabase.co/functions/v1/paymongo-webhook
// Events: checkout_session.payment.paid
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const service = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

async function hmacHex(key: string, message: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...service, ...(init.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('PAYMONGO_WEBHOOK_SECRET');
  if (!secret) return new Response('Not configured', { status: 503 });

  const raw = await req.text();
  const header = req.headers.get('paymongo-signature') || '';
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=').map((s) => s.trim())));
  const timestamp = parts.t;
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 600) return new Response('Bad signature', { status: 401 });
  const expected = await hmacHex(secret, `${timestamp}.${raw}`);
  if (!safeEqual(expected, parts.li || '') && !safeEqual(expected, parts.te || '')) return new Response('Bad signature', { status: 401 });

  let event;
  try { event = JSON.parse(raw); } catch { return new Response('Bad body', { status: 400 }); }
  const type = event?.data?.attributes?.type;
  if (type !== 'checkout_session.payment.paid') return new Response('Ignored', { status: 200 });

  try {
    const session = event.data.attributes.data;
    const sessionId = session.id;
    const attrs = session.attributes || {};
    const billId = attrs.metadata?.bill_id || attrs.reference_number;
    const payment = (attrs.payments || [])[0]?.attributes || {};
    const paidAmount = Number(payment.amount ?? attrs.line_items?.[0]?.amount ?? 0) / 100;
    const method = payment.source?.type || attrs.payment_method_used || 'online';

    const rows = await rest(`payments?reference_number=eq.${encodeURIComponent(sessionId)}&select=id,status`);
    if (rows?.[0]?.status === 'paid') return new Response('Already processed', { status: 200 });
    if (rows?.[0]) {
      await rest(`payments?id=eq.${rows[0].id}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid', payment_method: method, amount: paidAmount, payment_date: new Date().toISOString() }) });
    }

    const bills = await rest(`electricity_bills?id=eq.${billId}&select=id,billing_month,outstanding_balance,customer_accounts(user_id,account_number)`);
    const bill = bills?.[0];
    if (bill) {
      const left = Math.max(0, Math.round((Number(bill.outstanding_balance) - paidAmount) * 100) / 100);
      await rest(`electricity_bills?id=eq.${bill.id}`, { method: 'PATCH', body: JSON.stringify({ outstanding_balance: left, status: left === 0 ? 'paid' : 'partial' }) });
      if (bill.customer_accounts?.user_id) {
        await rest('notifications', {
          method: 'POST', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            user_id: bill.customer_accounts.user_id, title: 'Payment received', type: 'billing', bill_id: bill.id,
            message: `We received ₱${paidAmount.toFixed(2)} for your ${bill.billing_month} bill (account ${bill.customer_accounts.account_number}) via ${method}. Reference ${sessionId}.`,
          }),
        });
      }
    }
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('paymongo-webhook failed:', error);
    return new Response('Error', { status: 500 }); // PayMongo retries
  }
});
