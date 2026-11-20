// OMECOnnect: Supabase "Send SMS" Auth Hook -> textbee (Android SMS gateway).
//
// Supabase Auth still creates the 6-digit code and enforces its expiry
// (Auth > Phone > SMS OTP Expiry = 300 seconds). This function only delivers
// the text through the textbee app running on an Android phone with a SIM.
//
// Required secrets (Supabase > Edge Functions > Secrets), never in app code:
//   SEND_SMS_HOOK_SECRET  "v1,whsec_..." generated in Auth > Hooks
//   TEXTBEE_API_KEY       from the textbee dashboard
//   TEXTBEE_DEVICE_ID     the Android device id shown in the textbee dashboard
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

const TEXTBEE_BASE_URL = 'https://api.textbee.dev/api/v1/gateway';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function hookError(httpCode: number, message: string): Response {
  // Supabase Auth shows this message to the app when sending fails.
  return jsonResponse({ error: { http_code: httpCode, message } }, httpCode);
}

function toE164(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

async function sendWithTextbee(apiKey: string, deviceId: string, to: string, message: string) {
  const headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey };
  const body = JSON.stringify({ recipients: [to], message });

  // textbee documents two routes; try the device-scoped one, then the newer one.
  let response = await fetch(`${TEXTBEE_BASE_URL}/devices/${encodeURIComponent(deviceId)}/send-sms`, {
    method: 'POST', headers, body,
  });
  if (response.status === 404) {
    response = await fetch(`${TEXTBEE_BASE_URL}/send-sms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId, recipients: [to], message }),
    });
  }

  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return hookError(405, 'Method not allowed');

  const rawSecret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  const apiKey = Deno.env.get('TEXTBEE_API_KEY');
  const deviceId = Deno.env.get('TEXTBEE_DEVICE_ID');
  if (!rawSecret || !apiKey || !deviceId) {
    // Names only, never values, so a misconfiguration is easy to spot.
    const missing = [
      !rawSecret && 'SEND_SMS_HOOK_SECRET',
      !apiKey && 'TEXTBEE_API_KEY',
      !deviceId && 'TEXTBEE_DEVICE_ID',
    ].filter(Boolean).join(', ');
    console.error(`Missing secrets: ${missing}`);
    return hookError(500, `SMS service is not configured yet (missing: ${missing}).`);
  }

  // Only Supabase Auth (holder of the hook secret) may trigger an SMS.
  const payload = await req.text();
  let user: { phone?: string };
  let sms: { otp?: string };
  try {
    const wh = new Webhook(rawSecret.replace('v1,whsec_', ''));
    ({ user, sms } = wh.verify(payload, Object.fromEntries(req.headers)) as {
      user: { phone?: string };
      sms: { otp?: string };
    });
  } catch (_error) {
    return hookError(401, 'Invalid hook signature.');
  }

  const to = toE164(user?.phone ?? '');
  const otp = sms?.otp ?? '';
  if (!to || !/^\d{6,10}$/.test(otp)) {
    return hookError(400, 'Missing phone number or code.');
  }

  const message = `OMECOnnect code: ${otp}. Valid for 5 minutes. Never share this code with anyone, including OMECO staff.`;

  try {
    const result = await sendWithTextbee(apiKey, deviceId, to, message);
    if (!result.ok) {
      // Log the provider status only; never log the code itself.
      console.error(`textbee send failed: HTTP ${result.status}`);
      return hookError(502, 'The SMS could not be sent. Please try again in a minute.');
    }
  } catch (_error) {
    console.error('textbee request error');
    return hookError(502, 'The SMS could not be sent. Please try again in a minute.');
  }

  return jsonResponse({});
});
