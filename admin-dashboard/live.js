// OMECOnnect live layer (shared by the customer app and the admin dashboard).
//  1. Live updates: listens to Supabase Realtime so changes appear at once.
//  2. Online-only: covers the app with a notice while there is no internet.
//  3. New versions: when a new version is published, offers/does a reload.
// No libraries: plain WebSocket (Phoenix protocol used by Supabase Realtime).
(function () {
  const config = window.OMECO_CONFIG || {};

  // ------------------------------------------------------------ 1. Live updates
  // createLiveUpdates({ tables, onChange, onStatus }) -> { start(token), setToken(token), stop() }
  //   onChange({ table, type })  called for every insert/update/delete the user may see
  //                              ({ table: '*', type: 'RESYNC' } after a reconnect)
  //   onStatus(status)           'connecting' | 'live' | 'reconnecting' | 'offline' | 'error'
  function createLiveUpdates({ tables, onChange, onStatus = () => {} }) {
    let socket = null;
    let token = null;
    let topic = null;
    let heartbeatTimer = null;
    let retryTimer = null;
    let retryCount = 0;
    let stopped = true;
    let ref = 0;
    let wasLiveBefore = false;

    const nextRef = () => String(++ref);
    const send = (message) => {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };

    function socketUrl() {
      const base = String(config.supabaseUrl || '').replace(/\/+$/, '').replace(/^http/, 'ws');
      return `${base}/realtime/v1/websocket?apikey=${encodeURIComponent(config.supabaseAnonKey || '')}&vsn=1.0.0`;
    }

    function cleanUpSocket() {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        try { socket.close(); } catch { /* already closed */ }
      }
      socket = null;
    }

    function scheduleReconnect() {
      if (stopped) return;
      clearTimeout(retryTimer);
      if (!navigator.onLine) {
        onStatus('offline');
        return; // the 'online' listener below reconnects
      }
      onStatus('reconnecting');
      const delay = Math.min(30000, 1000 * 2 ** Math.min(retryCount, 5)) + Math.floor(Math.random() * 500);
      retryCount += 1;
      retryTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (stopped || !token || !config.supabaseUrl) return;
      cleanUpSocket();
      onStatus('connecting');
      try {
        socket = new WebSocket(socketUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      topic = `realtime:omeconnect-${Math.random().toString(36).slice(2, 10)}`;
      const joinRef = nextRef();

      socket.onopen = () => {
        send({
          topic,
          event: 'phx_join',
          ref: joinRef,
          join_ref: joinRef,
          payload: {
            config: {
              broadcast: { ack: false, self: false },
              presence: { key: '' },
              postgres_changes: tables.map((table) => ({ event: '*', schema: 'public', table })),
              private: false
            },
            access_token: token
          }
        });
        heartbeatTimer = setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() }), 25000);
      };

      socket.onmessage = (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.topic !== topic) return;

        if (message.event === 'postgres_changes') {
          const data = (message.payload && message.payload.data) || {};
          onChange({ table: data.table, type: data.type });
        } else if (message.event === 'phx_reply' && message.ref === joinRef) {
          if (message.payload && message.payload.status === 'ok') {
            retryCount = 0;
            onStatus('live');
            // After a drop, catch up on anything missed while disconnected.
            if (wasLiveBefore) onChange({ table: '*', type: 'RESYNC' });
            wasLiveBefore = true;
          } else {
            onStatus('error');
            console.warn('Live updates could not start:', message.payload && message.payload.response);
            cleanUpSocket();
            scheduleReconnect();
          }
        } else if (message.event === 'system' && message.payload && message.payload.status === 'error') {
          console.warn('Live updates warning:', message.payload.message);
        } else if (message.event === 'phx_error' || message.event === 'phx_close') {
          cleanUpSocket();
          scheduleReconnect();
        }
      };

      socket.onclose = () => {
        cleanUpSocket();
        scheduleReconnect();
      };
      socket.onerror = () => {
        // onclose follows and handles the reconnect.
      };
    }

    function handleOnline() {
      if (!stopped) {
        retryCount = 0;
        connect();
      }
    }
    function handleOffline() {
      if (!stopped) {
        cleanUpSocket();
        onStatus('offline');
      }
    }
    function handleVisible() {
      // Phones pause background tabs; reconnect when the app is opened again.
      if (!stopped && document.visibilityState === 'visible' && (!socket || socket.readyState > WebSocket.OPEN)) {
        retryCount = 0;
        connect();
      }
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);

    return {
      start(accessToken) {
        token = accessToken;
        stopped = false;
        wasLiveBefore = false;
        retryCount = 0;
        connect();
      },
      setToken(accessToken) {
        token = accessToken;
        send({ topic, event: 'access_token', payload: { access_token: accessToken }, ref: nextRef() });
      },
      stop() {
        stopped = true;
        clearTimeout(retryTimer);
        cleanUpSocket();
        onStatus('stopped');
      }
    };
  }

  // ------------------------------------------------------------ 2. Online-only
  function requireOnline({ appName = 'OMECOnnect', onBackOnline = () => {} } = {}) {
    const cover = document.createElement('div');
    cover.id = 'offlineCover';
    cover.setAttribute('role', 'alertdialog');
    cover.setAttribute('aria-modal', 'true');
    cover.setAttribute('aria-labelledby', 'offlineTitle');
    Object.assign(cover.style, {
      position: 'fixed', inset: '0', zIndex: '9999', display: 'none',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
      background: 'rgba(9, 30, 66, 0.72)', fontFamily: 'Arial, Helvetica, sans-serif'
    });
    const box = document.createElement('div');
    Object.assign(box.style, {
      maxWidth: '340px', width: '100%', background: '#ffffff', borderRadius: '18px',
      padding: '24px 20px', textAlign: 'center', color: '#17212b', boxShadow: '0 18px 48px rgba(0,0,0,0.25)'
    });
    const icon = document.createElement('div');
    icon.textContent = '📶';
    icon.style.fontSize = '40px';
    const title = document.createElement('h2');
    title.id = 'offlineTitle';
    title.textContent = 'No internet connection';
    Object.assign(title.style, { margin: '8px 0', fontSize: '1.2rem' });
    const text = document.createElement('p');
    text.textContent = `${appName} needs the internet to show your latest bills, alerts and messages. It will continue automatically when you are back online.`;
    Object.assign(text.style, { margin: '0 0 16px', color: '#617085', fontSize: '0.92rem', lineHeight: '1.5' });
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Try again';
    Object.assign(retry.style, {
      width: '100%', border: '0', borderRadius: '12px', padding: '12px 16px', fontWeight: '700',
      background: '#0b5ed7', color: '#ffffff', cursor: 'pointer', fontSize: '1rem'
    });
    retry.addEventListener('click', () => update(true));
    box.append(icon, title, text, retry);
    cover.append(box);
    document.body.append(cover);

    let offlineShown = false;
    async function reallyOnline() {
      if (!navigator.onLine) return false;
      try {
        const response = await fetch(`/version.json?ping=${Date.now()}`, { cache: 'no-store' });
        return response.ok || response.status === 404; // 404 = server reachable (local preview)
      } catch {
        return false;
      }
    }
    async function update(checkServer) {
      const online = checkServer ? await reallyOnline() : navigator.onLine;
      cover.style.display = online ? 'none' : 'flex';
      if (online && offlineShown) onBackOnline();
      offlineShown = !online;
    }
    window.addEventListener('online', () => void update(true));
    window.addEventListener('offline', () => void update(false));
    void update(false);
    return { check: () => update(true) };
  }

  // ------------------------------------------------------------ 3. New versions
  // Compares /version.json (written at publish time) with the one this page
  // loaded with. On change: reload when the app is reopened, or offer a button.
  function watchForNewVersion({ checkEveryMs = 120000 } = {}) {
    let loadedVersion = null;
    let updateReady = false;
    let banner = null;

    async function fetchVersion() {
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return null;
        const data = await response.json();
        return data && data.version ? String(data.version) : null;
      } catch {
        return null;
      }
    }

    function showBanner() {
      if (banner) return;
      banner = document.createElement('button');
      banner.type = 'button';
      banner.textContent = '✨ OMECOnnect was updated — tap to refresh';
      Object.assign(banner.style, {
        position: 'fixed', left: '50%', top: '12px', transform: 'translateX(-50%)', zIndex: '9998',
        border: '0', borderRadius: '999px', padding: '10px 16px', fontWeight: '700', fontSize: '0.9rem',
        background: '#0b5ed7', color: '#ffffff', boxShadow: '0 8px 24px rgba(11,94,215,0.35)', cursor: 'pointer',
        maxWidth: 'calc(100vw - 24px)'
      });
      banner.addEventListener('click', () => window.location.reload());
      document.body.append(banner);
    }

    async function check() {
      const latest = await fetchVersion();
      if (!latest) return;
      if (!loadedVersion) { loadedVersion = latest; return; }
      if (latest !== loadedVersion) {
        updateReady = true;
        if (document.visibilityState === 'hidden') return; // reload on return
        showBanner();
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (updateReady) window.location.reload();
      else void check();
    });
    window.addEventListener('online', () => void check());
    setInterval(() => void check(), checkEveryMs);
    void check();
  }

  window.OMECO_LIVE = { createLiveUpdates, requireOnline, watchForNewVersion };
})();
