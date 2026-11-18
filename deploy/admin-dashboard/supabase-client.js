(function () {
  const config = window.OMECO_CONFIG || {};

  if (config.demoMode || !config.supabaseUrl || !config.supabaseAnonKey) {
    window.OMECO_SUPABASE = null;
    return;
  }

  const baseUrl = config.supabaseUrl.trim().replace(/\/+$/, '');
  const apiKey = config.supabaseAnonKey.trim();

  async function request(path, { method = 'GET', accessToken, body, headers } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${accessToken || apiKey}`,
        'Content-Type': 'application/json',
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('The server returned an unreadable response.');
      }
    }
    if (!response.ok) {
      throw new Error(data?.msg || data?.message || data?.error_description || data?.error || `Request failed (${response.status}).`);
    }
    return data;
  }

  window.OMECO_SUPABASE = {
    // Generic data access (Row Level Security decides what an admin may do).
    async select(pathAndQuery, accessToken) {
      return request(`/rest/v1/${pathAndQuery}`, { accessToken });
    },

    async insert(table, row, accessToken) {
      const rows = await request(`/rest/v1/${table}`, {
        method: 'POST', accessToken, body: row, headers: { Prefer: 'return=representation' }
      });
      return rows && rows[0];
    },

    async update(tableAndFilter, changes, accessToken) {
      return request(`/rest/v1/${tableAndFilter}`, {
        method: 'PATCH', accessToken, body: changes, headers: { Prefer: 'return=representation' }
      });
    },

    async remove(tableAndFilter, accessToken) {
      return request(`/rest/v1/${tableAndFilter}`, { method: 'DELETE', accessToken, headers: { Prefer: 'return=minimal' } });
    },

    async rpc(name, args, accessToken) {
      return request(`/rest/v1/rpc/${name}`, { method: 'POST', accessToken, body: args || {} });
    },

    async signInWithPassword({ email, password }) {
      return request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    },

    async signOut(accessToken) {
      await request('/auth/v1/logout', { method: 'POST', accessToken });
    },

    // Admin rights come only from the protected admin_accounts table.
    async isAdmin(accessToken) {
      return request('/rest/v1/rpc/is_omeco_admin', { method: 'POST', accessToken, body: {} });
    },

    async getServiceAreas() {
      const rows = await request('/rest/v1/service_areas?select=municipality,barangay&order=municipality_order.asc,barangay_order.asc');
      const coverage = new Map();
      rows.forEach(({ municipality, barangay }) => {
        if (!coverage.has(municipality)) coverage.set(municipality, []);
        coverage.get(municipality).push(barangay);
      });
      return coverage;
    },

    // All customer profiles with their location and linked OMECO account (RLS: admins only).
    async getCustomers(accessToken) {
      const [users, admins] = await Promise.all([
        request('/rest/v1/users?select=id,full_name,email,mobile_number,municipality,barangay,created_at,' +
          'customer_accounts(account_number,verification_status,service_area)&order=full_name.asc', { accessToken }),
        request('/rest/v1/admin_accounts?select=user_id', { accessToken })
      ]);
      const adminIds = new Set(admins.map((row) => row.user_id));
      return users.filter((user) => !adminIds.has(user.id));
    }
  };
})();
