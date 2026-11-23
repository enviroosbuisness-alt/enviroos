/* EnviroOS — SUPABASE CLOUD SYNC & TIME-SERIES DATA LAYER
 * Records periodic sensor readings from ESP32 nodes into Supabase PostgreSQL.
 * Features:
 *   - Direct PostgREST / Supabase REST client (zero external dependencies required)
 *   - User-configurable recording interval (e.g. 1m, 5m, 10m, 15m, 30m, 60m, or Off)
 *   - Offline buffering: buffers readings in localStorage if connection drops, flushes when online
 *   - Multi-node support: tracks deviceId, cropId, NPK, moisture, temp, lux, pressure, pH
 *   - Test connection & Save Now triggers
 *   - Query historical readings for cloud charts
 */

'use strict';

window.EnviroOS = window.EnviroOS || {};

(function () {
  const E = EnviroOS;

  const STORAGE_KEY = 'enviroos.supabase.config';
  const QUEUE_KEY = 'enviroos.supabase.queue';
  const INTERVALS = [0, 1, 5, 10, 15, 30, 60]; // 0 = Off

  const DEFAULT_CONFIG = {
    url: '',
    anonKey: '',
    table: 'sensor_readings',
    intervalMin: 15,
    enabled: true,
    autoSyncOffline: true
  };

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw));
    } catch (_) { /* ignore */ }
    return Object.assign({}, DEFAULT_CONFIG);
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (_) { /* ignore */ }
  }

  function loadQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    return [];
  }

  function saveQueue(q) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-100))); // keep max 100 offline points
    } catch (_) { /* ignore */ }
  }

  function numOrNull(v) {
    if (v == null) return null;
    const n = +v;
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  function cleanUrl(url) {
    if (!url) return '';
    return url.trim().replace(/\/+$/, '');
  }

  function SupabaseSync() {
    this.config = loadConfig();
    this.timer = null;
    this.listeners = [];
    this.lastSavedAt = 0;
    this.lastStatus = 'idle'; // 'idle' | 'saving' | 'success' | 'error'
    this.lastError = '';
    this.totalSaved = 0;
    this.isFlushing = false;

    // Boot periodic schedule if configured
    this.restartSchedule();

    // Listen to network changes to flush queue
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.flushQueue();
      });
    }
  }

  SupabaseSync.prototype.INTERVALS = INTERVALS;

  SupabaseSync.prototype.addListener = function (fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  };

  SupabaseSync.prototype._emit = function () {
    const s = this.getStatus();
    this.listeners.forEach((fn) => {
      try { fn(s); } catch (_) { /* ignore */ }
    });
  };

  SupabaseSync.prototype.getStatus = function () {
    return {
      configured: this.isConfigured(),
      enabled: this.config.enabled && this.config.intervalMin > 0,
      intervalMin: this.config.intervalMin,
      url: this.config.url,
      table: this.config.table,
      lastSavedAt: this.lastSavedAt,
      lastStatus: this.lastStatus,
      lastError: this.lastError,
      totalSaved: this.totalSaved,
      queueLength: loadQueue().length
    };
  };

  SupabaseSync.prototype.isConfigured = function () {
    return !!(cleanUrl(this.config.url) && this.config.anonKey && this.config.anonKey.trim());
  };

  SupabaseSync.prototype.updateConfig = function (patch) {
    Object.assign(this.config, patch);
    saveConfig(this.config);
    this.restartSchedule();
    this._emit();
  };

  SupabaseSync.prototype.setIntervalMin = function (m) {
    m = parseInt(m, 10);
    if (!INTERVALS.includes(m)) m = 15;
    this.config.intervalMin = m;
    this.config.enabled = m > 0;
    saveConfig(this.config);
    this.restartSchedule();
    this._emit();
  };

  SupabaseSync.prototype.restartSchedule = function () {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.config.enabled || this.config.intervalMin <= 0) return;

    const ms = this.config.intervalMin * 60 * 1000;
    this.timer = setInterval(() => {
      this.recordFromApp('scheduled');
    }, ms);
  };

  // Helper to build headers for Supabase REST API
  SupabaseSync.prototype._headers = function (preferReturn) {
    const key = (this.config.anonKey || '').trim();
    const h = {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': 'Bearer ' + key
    };
    if (preferReturn) {
      h['Prefer'] = 'return=representation';
    }
    return h;
  };

  // Test connection to Supabase endpoint
  SupabaseSync.prototype.testConnection = async function (testUrl, testKey) {
    const url = cleanUrl(testUrl || this.config.url);
    const key = (testKey || this.config.anonKey || '').trim();
    const table = this.config.table || 'sensor_readings';

    if (!url || !key) {
      return { ok: false, message: 'URL and Anon Key are required.' };
    }

    const start = Date.now();
    try {
      // Query 1 row to verify table exists and key has permissions
      const endpoint = `${url}/rest/v1/${table}?select=id&limit=1`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'apikey': key,
          'Authorization': 'Bearer ' + key
        }
      });

      const elapsed = Date.now() - start;
      if (res.ok) {
        return { ok: true, message: `Connected! (${elapsed}ms)`, latency: elapsed };
      }

      let errDetail = '';
      try {
        const body = await res.json();
        errDetail = body.message || body.error || res.statusText;
      } catch (_) {
        errDetail = res.statusText || String(res.status);
      }

      if (res.status === 404) {
        return {
          ok: false,
          message: `Table '${table}' not found. Please run the SQL schema in Supabase SQL editor.`
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          message: `Authentication failed (${res.status}). Verify Anon Key & RLS policies.`
        };
      }
      return { ok: false, message: `HTTP ${res.status}: ${errDetail}` };
    } catch (err) {
      return { ok: false, message: 'Network error: ' + (err.message || 'Cannot reach Supabase host') };
    }
  };

  // Formats a sensor reading into the database row schema
  SupabaseSync.prototype.formatRow = function (snap, extra) {
    snap = snap || {};
    extra = extra || {};

    const rawDev = extra.deviceId || snap.deviceId || '4493A6470968';
    const devId = String(rawDev).toUpperCase().replace(/[^0-9A-F]/g, '') || '4493A6470968';
    return {
      device_id: devId,
      node_name: extra.nodeName || (E.UI?.deviceLabel ? E.UI.deviceLabel(devId) : 'Sensor device'),
      crop_id: extra.cropId || snap.cropId || null,
      moisture: numOrNull(snap.moisture),
      temp_c: numOrNull(snap.tempC),
      humidity: numOrNull(snap.humidity),
      pressure_hpa: numOrNull(snap.pressureHpa),
      lux: numOrNull(snap.lux),
      n: numOrNull(snap.n),
      p: numOrNull(snap.p),
      k: numOrNull(snap.k),
      ph: numOrNull(snap.ph),
      wifi_rssi: numOrNull(extra.rssi || snap.wifi_rssi),
      uptime_s: numOrNull(extra.uptime || snap.uptime_s),
      raw_payload: extra.raw || null,
      recorded_at: new Date().toISOString()
    };
  };

  // A row with zero usable sensor fields is junk (node silent / save pressed
  // before first telemetry). Shared with the History banner fallback.
  const USABLE_FIELDS = ['moisture', 'temp_c', 'humidity', 'pressure_hpa', 'lux', 'n', 'p', 'k', 'ph'];

  SupabaseSync.prototype.hasUsableData = function (row) {
    if (!row || typeof row !== 'object') return false;
    return USABLE_FIELDS.some((f) => row[f] != null);
  };

  // Best-effort: make sure the device row exists so the FK on
  // sensor_readings never rejects a new node. Ignores all errors.
  SupabaseSync.prototype.ensureDevice = async function (deviceId, nodeName) {
    if (!this.isConfigured() || !deviceId) return;
    try {
      const url = cleanUrl(this.config.url);
      await fetch(`${url}/rest/v1/devices?on_conflict=device_id`, {
        method: 'POST',
        headers: Object.assign(this._headers(false), { Prefer: 'resolution=merge-duplicates' }),
        body: JSON.stringify([{ device_id: deviceId, node_name: nodeName || 'Sensor Node' }])
      });
    } catch (_) { /* ignore — insert will surface real errors */ }
  };

  // Best-effort: mirror the user-chosen interval into device_config so a
  // future ESP32 firmware can poll it and save directly (works with app closed).
  SupabaseSync.prototype.syncIntervalToCloud = async function (deviceId) {
    if (!this.isConfigured()) return;
    try {
      if (!deviceId) {
        if (E.mqttProvider && E.mqttProvider.deviceId) deviceId = E.mqttProvider.deviceId;
        else if (E.lastSnapshot && E.lastSnapshot.deviceId) deviceId = E.lastSnapshot.deviceId;
      }
      if (!deviceId) return;
      deviceId = String(deviceId).toUpperCase().replace(/[^0-9A-F]/g, '');
      if (!deviceId) return;
      const url = cleanUrl(this.config.url);
      await fetch(`${url}/rest/v1/device_config?on_conflict=device_id`, {
        method: 'POST',
        headers: Object.assign(this._headers(false), { Prefer: 'resolution=merge-duplicates' }),
        body: JSON.stringify([{ device_id: deviceId, interval_min: this.config.intervalMin }])
      });
    } catch (_) { /* ignore — local timer remains source of truth */ }
  };

  // Insert rows into Supabase via PostgREST
  SupabaseSync.prototype.insertRows = async function (rows) {
    if (!Array.isArray(rows)) rows = [rows];
    if (!rows.length) return { ok: true, count: 0 };

    const url = cleanUrl(this.config.url);
    const table = this.config.table || 'sensor_readings';
    const endpoint = `${url}/rest/v1/${table}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: this._headers(false),
      body: JSON.stringify(rows)
    });

    if (!res.ok) {
      let errMsg = '';
      try {
        const b = await res.json();
        errMsg = b.message || b.error || res.statusText;
      } catch (_) {
        errMsg = res.statusText || String(res.status);
      }
      throw new Error(`Supabase insert failed (${res.status}): ${errMsg}`);
    }

    return { ok: true, count: rows.length };
  };

  // Records a reading object (from current snapshot or caller)
  SupabaseSync.prototype.recordReading = async function (snap, extra) {
    if (!this.isConfigured()) {
      this.lastStatus = 'error';
      this.lastError = 'Supabase credentials not configured';
      this._emit();
      return { ok: false, error: this.lastError };
    }

    const row = this.formatRow(snap, extra);

    // Never store a reading with zero sensor values (silent node / save
    // pressed before first telemetry). Such rows made History look broken.
    if (!this.hasUsableData(row)) {
      this.lastStatus = 'error';
      this.lastError = 'No sensor data — skipped (node silent)';
      this._emit();
      return { ok: false, error: this.lastError, skipped: true };
    }

    this.lastStatus = 'saving';
    this._emit();

    // If browser is currently offline, buffer to queue
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const q = loadQueue();
      q.push(row);
      saveQueue(q);
      this.lastSavedAt = Date.now();
      this.lastStatus = 'queued';
      this.lastError = 'Offline — saved to local queue';
      this._emit();
      return { ok: true, queued: true };
    }

    try {
      await this.ensureDevice(row.device_id, row.node_name);
      await this.insertRows(row);
      this.lastSavedAt = Date.now();
      this.lastStatus = 'success';
      this.lastError = '';
      this.totalSaved++;
      this._emit();

      // Check if there are queued rows to flush
      this.flushQueue();

      return { ok: true, row };
    } catch (err) {
      // Buffer to queue on network failure
      const q = loadQueue();
      q.push(row);
      saveQueue(q);

      this.lastStatus = 'error';
      this.lastError = err.message || 'Insert error';
      this._emit();
      return { ok: false, error: this.lastError, queued: true };
    }
  };

  // Flush any queued offline readings
  SupabaseSync.prototype.flushQueue = async function () {
    if (this.isFlushing || !this.isConfigured()) return;
    const q = loadQueue();
    if (!q.length) return;

    this.isFlushing = true;
    try {
      const ids = {};
      q.forEach((r) => { if (r && r.device_id) ids[r.device_id] = r.node_name; });
      for (const id of Object.keys(ids)) {
        try { await this.ensureDevice(id, ids[id]); } catch (_) { /* ignore */ }
      }
      await this.insertRows(q);
      saveQueue([]); // clear queue on success
      this.totalSaved += q.length;
      this._emit();
    } catch (_) {
      // Keep queue for next attempt
    } finally {
      this.isFlushing = false;
    }
  };

  // Convenient trigger to record from live EnviroOS app state
  SupabaseSync.prototype.recordFromApp = function (reason) {
    try {
      let snap = null;
      let extra = {};

      if (window.EnviroOS) {
        if (E.lastSnapshot) snap = E.lastSnapshot;
        else if (E.getCurrentSnapshot) snap = E.getCurrentSnapshot();
      }

      if (!snap) {
        // Fallback to localStorage snapshot if memory reference isn't global
        try {
          const raw = localStorage.getItem('enviroos.lastSnapshot');
          if (raw) snap = JSON.parse(raw);
        } catch (_) { /* ignore */ }
      }

      if (!snap) {
        this.lastStatus = 'error';
        this.lastError = 'No sensor telemetry available to record';
        this._emit();
        return;
      }

      // If active MQTT provider exists, fetch device health
      if (E.mqttProvider && E.mqttProvider.getStatus) {
        const st = E.mqttProvider.getStatus();
        if (st && st.device) {
          extra.rssi = st.device.rssi;
          extra.uptime = st.device.uptime;
          extra.deviceId = st.device.id;
        }
      }

      return this.recordReading(snap, extra);
    } catch (e) {
      this.lastStatus = 'error';
      this.lastError = e.message;
      this._emit();
    }
  };

  // Fetch recent history from Supabase for charts
  SupabaseSync.prototype.fetchHistory = async function (deviceId, limit) {
    if (!this.isConfigured()) return [];
    limit = limit || 48;
    const url = cleanUrl(this.config.url);
    const table = this.config.table || 'sensor_readings';

    let endpoint = `${url}/rest/v1/${table}?order=recorded_at.desc&limit=${limit}`;
    if (deviceId) {
      endpoint += `&device_id=eq.${encodeURIComponent(deviceId.toUpperCase())}`;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: this._headers(false)
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.reverse() : []; // chronological order
    } catch (_) {
      return [];
    }
  };

  // Instantiate singleton
  E.supabase = new SupabaseSync();
})();
