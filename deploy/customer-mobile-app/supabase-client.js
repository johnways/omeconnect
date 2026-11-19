(function () {
  const config = window.OMECO_CONFIG || {};

  function getBaseUrl() {
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('Supabase is not configured. Add the project URL and anon key to config.js.');
    }

    const projectUrl = new URL(config.supabaseUrl);
    if (projectUrl.protocol !== 'https:' && projectUrl.hostname !== 'localhost') {
      throw new Error('Supabase must use HTTPS.');
    }

    return projectUrl.toString().replace(/\/+$/, '');
  }

  async function request(url, options) {
    const response = await fetch(url, options);
    const responseText = await response.text();
    let data = null;

    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error('Supabase returned an unreadable response.');
      }
    }

    if (!response.ok) {
      throw new Error(data?.msg || data?.message || data?.error_description || data?.error || `Supabase request failed (${response.status}).`);
    }

    return data;
  }

  function authHeaders(accessToken) {
    const headers = {
      apikey: config.supabaseAnonKey,
      'Content-Type': 'application/json'
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    } else if (config.supabaseAnonKey.startsWith('eyJ')) {
      headers.Authorization = `Bearer ${config.supabaseAnonKey}`;
    }

    return headers;
  }

  async function authRequest(path, body) {
    return request(`${getBaseUrl()}/auth/v1/${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });
  }

  async function updateUser(accessToken, attributes, emailRedirectTo) {
    const url = new URL(`${getBaseUrl()}/auth/v1/user`);
    if (emailRedirectTo) url.searchParams.set('redirect_to', emailRedirectTo);
    return request(url.toString(), {
      method: 'PUT',
      headers: authHeaders(accessToken),
      body: JSON.stringify(attributes)
    });
  }

  async function restRequest(tableName, query, accessToken, options) {
    const url = new URL(`${getBaseUrl()}/rest/v1/${tableName}`);
    Object.entries(query || {}).forEach(([key, value]) => url.searchParams.set(key, value));

    return request(url.toString(), {
      method: (options && options.method) || 'GET',
      headers: {
        ...authHeaders(accessToken),
        ...(options && options.headers)
      },
      body: options && options.body ? JSON.stringify(options.body) : undefined
    });
  }

  const PKCE_STORAGE_KEY = 'omeco.pkce.verifier';

  function base64UrlEncode(bytes) {
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function createCodeVerifier() {
    const bytes = new Uint8Array(48);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
  }

  async function createCodeChallenge(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return base64UrlEncode(new Uint8Array(digest));
  }

  // Converts Philippine mobile numbers (09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX,
  // +639XXXXXXXXX) to E.164 (+639XXXXXXXXX). Other numbers must include "+".
  function normalizePhoneNumber(input) {
    const raw = String(input || '').trim();
    const digits = raw.replace(/\D/g, '');
    let e164 = '';

    if (/^09\d{9}$/.test(digits)) e164 = `+63${digits.slice(1)}`;
    else if (/^9\d{9}$/.test(digits)) e164 = `+63${digits}`;
    else if (/^639\d{9}$/.test(digits)) e164 = `+${digits}`;
    else if (raw.startsWith('+') && /^\d{8,15}$/.test(digits)) e164 = `+${digits}`;

    if (!e164) {
      throw new Error('Enter a valid mobile number, for example 09171234567.');
    }
    return e164;
  }

  // Asks Supabase which sign-in methods are switched on, so the app can
  // explain "not set up yet" instead of sending people to an error page.
  async function isProviderEnabled(provider) {
    const settings = await request(`${getBaseUrl()}/auth/v1/settings`, {
      method: 'GET',
      headers: authHeaders()
    });
    return Boolean(settings && settings.external && settings.external[provider]);
  }

  window.OMECO_SUPABASE = {
    normalizePhoneNumber,
    isProviderEnabled,

    async signInWithPassword({ email, password }) {
      return authRequest('token?grant_type=password', { email, password });
    },

    // ---------- Phone pop-up notifications (Web Push)
    async getPushPublicKey() {
      return request(`${getBaseUrl()}/rest/v1/rpc/get_push_public_key`, {
        method: 'POST', headers: authHeaders(), body: '{}'
      });
    },

    async savePushSubscription(accessToken, subscription) {
      const json = subscription.toJSON();
      return request(`${getBaseUrl()}/rest/v1/rpc/save_push_subscription`, {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify({
          p_endpoint: json.endpoint,
          p_p256dh: json.keys && json.keys.p256dh,
          p_auth: json.keys && json.keys.auth,
          p_user_agent: navigator.userAgent
        })
      });
    },

    // Sends a test pop-up to the signed-in customer's registered phones.
    async sendTestPush(accessToken) {
      return request(`${getBaseUrl()}/rest/v1/rpc/send_test_push`, {
        method: 'POST', headers: authHeaders(accessToken), body: '{}'
      });
    },

    async removePushSubscription(accessToken, endpoint) {
      return request(`${getBaseUrl()}/rest/v1/rpc/remove_push_subscription`, {
        method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({ p_endpoint: endpoint })
      });
    },

    // Sign-ins last 1 hour; this swaps the refresh token for a fresh session
    // (same user, same two-step level) so the app keeps working.
    async refreshSession(refreshToken) {
      return authRequest('token?grant_type=refresh_token', { refresh_token: refreshToken });
    },

    // Google sign-in uses the OAuth PKCE flow: the browser is sent to Google
    // via Supabase, then comes back to redirectTo with ?code=..., which
    // exchangeCodeForSession() swaps for a session.
    async startGoogleSignIn(redirectTo) {
      const verifier = createCodeVerifier();
      const challenge = await createCodeChallenge(verifier);
      sessionStorage.setItem(PKCE_STORAGE_KEY, verifier);

      const url = new URL(`${getBaseUrl()}/auth/v1/authorize`);
      url.searchParams.set('provider', 'google');
      url.searchParams.set('redirect_to', redirectTo);
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 's256');
      window.location.assign(url.toString());
    },

    async exchangeCodeForSession(authCode) {
      const verifier = sessionStorage.getItem(PKCE_STORAGE_KEY);
      sessionStorage.removeItem(PKCE_STORAGE_KEY);
      if (!verifier) {
        throw new Error('Google sign-in expired or was started in another tab. Please try again.');
      }
      return authRequest('token?grant_type=pkce', {
        auth_code: authCode,
        code_verifier: verifier
      });
    },

    // Sign-up step 1: text a 6-digit code to a new customer's mobile number.
    // Supabase creates the account only when the code is verified.
    async sendSignupOtp(phone, metadata) {
      return authRequest('otp', { phone, create_user: true, data: metadata || {} });
    },

    // Existing (e.g. Google) account: attach and verify a mobile number.
    async requestPhoneVerification(accessToken, phone) {
      return updateUser(accessToken, { phone });
    },

    // type: 'sms' for sign-up codes, 'phone_change' for adding a number.
    async verifyPhoneOtp({ phone, token, type }) {
      return authRequest('verify', { type, phone, token });
    },

    // ---- Authenticator app (TOTP) two-step verification ----
    async getUser(accessToken) {
      return request(`${getBaseUrl()}/auth/v1/user`, {
        method: 'GET',
        headers: authHeaders(accessToken)
      });
    },

    async enrollTotp(accessToken) {
      const data = await request(`${getBaseUrl()}/auth/v1/factors`, {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify({
          factor_type: 'totp',
          issuer: 'OMECOnnect',
          friendly_name: `OMECOnnect ${new Date().toISOString()}`
        })
      });
      const svg = data && data.totp && data.totp.qr_code;
      return {
        id: data.id,
        secret: data.totp && data.totp.secret,
        qrCodeUrl: svg && !svg.startsWith('data:')
          ? `data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`
          : svg
      };
    },

    // Challenge + verify in one step. Returns a new, upgraded (aal2) session.
    async verifyTotp(accessToken, factorId, code) {
      const base = `${getBaseUrl()}/auth/v1/factors/${encodeURIComponent(factorId)}`;
      const challenge = await request(`${base}/challenge`, {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: '{}'
      });
      return request(`${base}/verify`, {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify({ challenge_id: challenge.id, code })
      });
    },

    async unenrollFactor(accessToken, factorId) {
      return request(`${getBaseUrl()}/auth/v1/factors/${encodeURIComponent(factorId)}`, {
        method: 'DELETE',
        headers: authHeaders(accessToken)
      });
    },

    // Sets email/password/profile data on the signed-in user. A new email
    // gets a confirmation link and only becomes active once clicked.
    async updateUser(accessToken, attributes, emailRedirectTo) {
      return updateUser(accessToken, attributes, emailRedirectTo);
    },

    // Email + password sign-up. Supabase emails a confirmation link that returns
    // to emailRedirectTo. Profile details are stored as sign-up metadata and copied
    // into public.users by the database trigger.
    async signUp({ email, password, metadata, emailRedirectTo }) {
      const path = emailRedirectTo ? `signup?redirect_to=${encodeURIComponent(emailRedirectTo)}` : 'signup';
      return authRequest(path, { email, password, data: metadata || {} });
    },

    async hasVerificationRequest({ userId, accessToken }) {
      const rows = await restRequest('account_verification_requests', {
        user_id: `eq.${userId}`,
        select: 'id',
        limit: '1'
      }, accessToken);
      return Array.isArray(rows) && rows.length > 0;
    },

    async signOut(accessToken) {
      await request(`${getBaseUrl()}/auth/v1/logout`, {
        method: 'POST',
        headers: authHeaders(accessToken)
      });
    },

    // The emailed link returns to redirectTo with #access_token=…&type=recovery.
    async sendPasswordReset(email, redirectTo) {
      const path = redirectTo ? `recover?redirect_to=${encodeURIComponent(redirectTo)}` : 'recover';
      return authRequest(path, { email });
    },

    async markNotificationsRead({ userId, accessToken, notificationId }) {
      const query = { user_id: `eq.${userId}`, is_read: 'eq.false' };
      if (notificationId) query.id = `eq.${notificationId}`;
      return restRequest('notifications', query, accessToken, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { is_read: true }
      });
    },

    async isAdmin(accessToken) {
      return restRequest('rpc/is_omeco_admin_account', {}, accessToken, {
        method: 'POST',
        body: {}
      });
    },

    async createAccountVerificationRequest({ userId, accountNumber, accessToken }) {
      return restRequest('account_verification_requests', {}, accessToken, {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: {
          user_id: userId,
          account_number: accountNumber,
          status: 'pending'
        }
      });
    },

    async getCustomerData({ userId, accessToken }) {
      const profilePromise = restRequest('users', {
        id: `eq.${userId}`,
        select: 'id,full_name,email,mobile_number,municipality,barangay'
      }, accessToken);

      const accountPromise = restRequest('customer_accounts', {
        user_id: `eq.${userId}`,
        verification_status: 'eq.verified',
        select: 'id,account_number,service_area,meter_number,status,verification_status',
        order: 'created_at.desc',
        limit: '1'
      }, accessToken);

      const [profiles, accounts] = await Promise.all([profilePromise, accountPromise]);
      const account = accounts[0] || null;

      const billsPromise = account
        ? restRequest('electricity_bills', {
            customer_account_id: `eq.${account.id}`,
            select: 'id,billing_month,due_date,total_amount,outstanding_balance,consumption_kwh,status,created_at',
            order: 'created_at.desc'
          }, accessToken)
        : Promise.resolve([]);

      const announcementsPromise = restRequest('announcements', {
        select: 'id,title,content,category,affected_area,is_urgent,created_at',
        is_published: 'eq.true',
        order: 'created_at.desc',
        limit: '20'
      }, accessToken);

      const notificationsPromise = restRequest('notifications', {
        user_id: `eq.${userId}`,
        select: 'id,title,message,type,is_read,created_at,announcement_id,bill_id',
        order: 'created_at.desc',
        limit: '30'
      }, accessToken);

      const chatPromise = restRequest('ai_chat_history', {
        user_id: `eq.${userId}`,
        select: 'prompt,response,created_at',
        order: 'created_at.desc',
        limit: '20'
      }, accessToken);

      const [bills, announcements, notifications, chatEntries] = await Promise.all([
        billsPromise,
        announcementsPromise,
        notificationsPromise,
        chatPromise
      ]);

      return {
        profile: profiles[0] || null,
        account,
        bills,
        announcements,
        notifications,
        chatHistory: (chatEntries || []).reverse().flatMap((entry) => [
          { role: 'user', text: entry.prompt },
          { role: 'bot', text: entry.response }
        ])
      };
    },

    // OMECO service coverage (municipality → barangays). Public list, no sign-in needed.
    async getServiceAreas() {
      const rows = await restRequest('service_areas', {
        select: 'municipality,barangay',
        order: 'municipality_order.asc,barangay_order.asc'
      });
      const coverage = new Map();
      (rows || []).forEach(({ municipality, barangay }) => {
        if (!coverage.has(municipality)) coverage.set(municipality, []);
        coverage.get(municipality).push(barangay);
      });
      return coverage;
    },

    // Concerns (complaints). Tracking number and status are set by the database.
    async submitConcern({ userId, type, description, municipality, barangay, accessToken }) {
      const rows = await restRequest('complaints', { select: 'tracking_number,complaint_type,status,created_at' }, accessToken, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: {
          user_id: userId,
          complaint_type: type,
          description,
          municipality: municipality || null,
          barangay: barangay || null
        }
      });
      return rows && rows[0];
    },

    async getConcerns({ userId, accessToken }) {
      return restRequest('complaints', {
        user_id: `eq.${userId}`,
        select: 'tracking_number,complaint_type,description,status,created_at',
        order: 'created_at.desc',
        limit: '50'
      }, accessToken);
    },

    async updateLocation({ userId, municipality, barangay, accessToken }) {
      return restRequest('users', { id: `eq.${userId}` }, accessToken, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { municipality, barangay }
      });
    },

    async saveChatEntry({ userId, prompt, response, accessToken }) {
      return restRequest('ai_chat_history', {}, accessToken, {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: {
          user_id: userId,
          prompt,
          response
        }
      });
    }
  };
})();
