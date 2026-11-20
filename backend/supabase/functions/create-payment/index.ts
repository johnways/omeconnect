// OMECOnnect: start an online payment (GCash, Maya, card) for one bill via PayMongo Checkout.
// The customer must own the bill (checked with their own sign-in). The amount
// always comes from the database, never from the browser.
//
// Secrets (Supabase > Edge Functions > Secrets):
//   PAYMONGO_SECRET_KEY   sk_test_... (testing) or sk_live_... (real payments)
//   PAYMONGO_METHODS      optional, default "gcash,paymaya,card"
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_RETURN = ['https://omeconnect.vercel.app', 'http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8080'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function db(path: string, key: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: key === SERVICE_KEY ? SERVICE_KEY : ANON_KEY, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('PAYMONGO_SECRET_KEY');
  if (!secret) return json({ error: 'Online payment is not switched on yet.' }, 503);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!token) return json({ error: 'Sign in first.' }, 401);
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!userRes.ok) return json({ error: 'Your sign-in expired. Please sign in again.' }, 401);
  const user = await userRes.json();

  let billId = '';
  let returnUrl = 'https://omeconnect.vercel.app/customer-mobile-app/index.html';
  try {
    const body = await req.json();
    billId = String(body.bill_id || '');
    const asked = String(body.return_url || '');
    if (ALLOWED_RETURN.some((origin) => asked.startsWith(`${origin}/`))) returnUrl = asked;
  } catch { /* handled below */ }
  if (!/^[0-9a-f-]{36}$/i.test(billId)) return json({ error: 'Choose a bill to pay.' }, 400);

  try {
    // Read with the customer's own sign-in: only their verified accounts' bills are visible.
    const bills = await db(`/rest/v1/electricity_bills?id=eq.${billId}&select=id,billing_month,outstanding_balance,customer_account_id,customer_accounts(account_number,user_id,verification_status)`, token);
    const bill = bills && bills[0];
    if (!bill || !bill.customer_accounts || bill.customer_accounts.user_id !== user.id || bill.customer_accounts.verification_status !== 'verified') {
      return json({ error: 'Bill not found.' }, 404);
    }
    const amount = Math.round(Number(bill.outstanding_balance) * 100); // centavos
    if (!(amount >= 2000)) return json({ error: amount > 0 ? 'Online payment needs at least ₱20.00.' : 'This bill is already paid.' }, 400);

    const methods = (Deno.env.get('PAYMONGO_METHODS') || 'gcash,paymaya,card').split(',').map((m) => m.trim()).filter(Boolean);
    const sep = returnUrl.includes('?') ? '&' : '?';
    const checkout = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${secret}:`)}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [{ currency: 'PHP', amount, name: `OMECO bill ${bill.billing_month} · ${bill.customer_accounts.account_number}`, quantity: 1 }],
            payment_method_types: methods,
            description: `OMECO electricity bill ${bill.billing_month}, account ${bill.customer_accounts.account_number}`,
            reference_number: bill.id,
            send_email_receipt: Boolean(user.email),
            show_description: true,
            show_line_items: true,
            success_url: `${returnUrl}${sep}payment=success`,
            cancel_url: `${returnUrl}${sep}payment=cancelled`,
            metadata: { bill_id: bill.id, user_id: user.id, account_number: bill.customer_accounts.account_number },
          },
        },
      }),
    });
    const result = await checkout.json();
    if (!checkout.ok) {
      console.error('PayMongo error', checkout.status, JSON.stringify(result).slice(0, 500));
      return json({ error: 'The payment page could not be opened. Please try again later.' }, 502);
    }
    const sessionId = result.data.id;
    const checkoutUrl = result.data.attributes.checkout_url;

    // Record the pending payment (service role: customers cannot write payments).
    await db('/rest/v1/payments', SERVICE_KEY, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        customer_account_id: bill.customer_account_id, amount: amount / 100, payment_method: 'online',
        reference_number: sessionId, status: 'pending', payment_date: new Date().toISOString(),
      }),
    });
    return json({ checkout_url: checkoutUrl });
  } catch (error) {
    console.error('create-payment failed:', error);
    return json({ error: 'The payment could not be started.' }, 500);
  }
});
