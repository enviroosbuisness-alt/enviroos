/* EnviroOS — DATA layer: live ESP32 robot(s) over MQTT (public HiveMQ).
 * Implements the same provider interface as MockProvider:
 *   { subscribe(fn), getCurrent(), getHistory(), dispose() }
 * plus robot extras: sendMotor(dir, speed), requestSensors(), getStatus().
 *
 * Two node flavours (auto-detected from telemetry):
 *   FULL  — NPK sensor + motor control (e.g. node 4493A6470968)
 *   BASIC — soil analog + lux + temp/pressure only, no motor
 *           (e.g. node 149853470968 -> esp32bot/149853470968/sensors)
 * Missing/failed sensors become null -> UI shows NO DATA, never guesses.
 */

'use strict';

window.EnviroOS = window.EnviroOS || {};

(function () {
  const E = EnviroOS;

  const DEFAULT_DEVICE = '4493A6470968';
  const SECOND_DEVICE = '149853470968';
  const KNOWN_DEVICES = [DEFAULT_DEVICE, SECOND_DEVICE];
  const STORE_DEV = 'enviroos.mqtt.dev';
  const STORE_SEASON = 'enviroos.mqtt.season';
  const STORE_DAILY = 'enviroos.mqtt.daily';
  const STORE_PRESS = 'enviroos.mqtt.press';
  const STALE_MS = 30000;

  function urls() {
    const list = ['wss://broker.hivemq.com:8884/mqtt'];
    try {
      if (location.protocol === 'http:') list.push('ws://broker.hivemq.com:8000/mqtt');
    } catch (_) { list.push('ws://broker.hivemq.com:8000/mqtt'); }
    return list;
  }

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    return fallback;
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) { /* ignore */ }
  }

  // Untrusted-payload helpers: finite number or null; never throw.
  function num(v) {
    if (v == null) return null;
    const n = +v;
    return Number.isFinite(n) ? n : null;
  }
  function okBlock(b) {
    return b && typeof b === 'object' && b.ok !== false;
  }

  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function weekdayOf(dateStr) {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short' });
    } catch (_) { return ''; }
  }

  function MqttProvider(profile, opts) {
    this.profile = profile || {};
    this.opts = opts || {};
    const devCfg = load(STORE_DEV, {});
    this.deviceId = (this.opts.deviceId || devCfg.deviceId || DEFAULT_DEVICE).toUpperCase().replace(/[^0-9A-F]/g, '') || DEFAULT_DEVICE;
    this.calDry = (devCfg.calDry != null ? devCfg.calDry : (this.opts.calDry != null ? this.opts.calDry : 3500));
    this.calWet = (devCfg.calWet != null ? devCfg.calWet : (this.opts.calWet != null ? this.opts.calWet : 1200));
    this.listeners = [];
    this.eventListeners = [];
    this.devices = {}; // id -> {id, online, lastSeen, hasNpk, rssi, uptime}
    // Pre-seed both farm nodes so the device switcher shows them even
    // before their first status/sensors frame arrives.
    try {
      for (const kid of KNOWN_DEVICES) this._dev(kid);
      this._dev(DEFAULT_DEVICE).hasNpk = true;
      this._dev(SECOND_DEVICE).hasNpk = false;
    } catch (_) { /* ignore */ }
    this.reading = { n: null, p: null, k: null, moisture: null, ph: null, lux: null, tempC: null, pressureHpa: null, humidity: null, tmax: null, tmin: null };
    this.motor = { direction: 'stopped', speed: 150, at: 0 };
    this.lastTelemetryAt = 0;
    this.season = load(STORE_SEASON, []); // [{date, tmax, tmin}] oldest..newest, <=21
    this.daily = load(STORE_DAILY, { labels: [], moisture: [], temp: [], lux: [], pressure: [], gdd: [] });
    this.pressureHistory = load(STORE_PRESS, []);
    this.client = null;
    this.urlIdx = 0;
    this._connect();
  }

  MqttProvider.prototype.base = function (id) {
    return 'esp32bot/' + (id || this.deviceId);
  };

  MqttProvider.prototype.persistDev = function () {
    save(STORE_DEV, { deviceId: this.deviceId, calDry: this.calDry, calWet: this.calWet });
  };

  MqttProvider.prototype._connect = function () {
    const self = this;
    const list = urls();
    const client = new E.MqttClient({
      url: list[self.urlIdx % list.length],
      keepAlive: 60,
      onState: (s) => {
        if ((s === 'reconnecting' || s.indexOf('error') === 0) && list.length > 1) {
          // rotate broker URL on repeated failure (wss first, ws fallback on http)
          self.urlIdx++;
        }
        self._emit({ type: 'conn', state: s });
      },
      onMessage: (topic, payload, meta) => self._route(topic, payload, meta)
    });
    self.client = client;
    client.open();
    client.subscribe('esp32bot/+/status', 1);
    self._subscribeDevice();
    self._subscribeKnown();
  };

  MqttProvider.prototype._subscribeDevice = function () {
    if (!this.client) return;
    const b = this.base();
    this.client.subscribe(b + '/sensors', 0);
    this.client.subscribe(b + '/motor', 0);
    this.client.subscribe(b + '/status', 1);
  };

  // Keep the other known farm node(s) tracked for the device switcher,
  // even while the selected node drives the farm readings. Sensors-only
  // (the BASIC node has no motor topic; subscribing to it is harmless but
  // pointless, so we skip it).
  MqttProvider.prototype._subscribeKnown = function () {
    if (!this.client) return;
    try {
      for (const kid of KNOWN_DEVICES) {
        if (!kid || kid === this.deviceId) continue;
        this.client.subscribe('esp32bot/' + kid + '/sensors', 0);
        this.client.subscribe('esp32bot/' + kid + '/status', 1);
      }
    } catch (_) { /* ignore */ }
  };

  MqttProvider.prototype._unsubscribeDevice = function (id) {
    if (!this.client) return;
    const b = this.base(id);
    this.client.unsubscribe(b + '/sensors');
    this.client.unsubscribe(b + '/motor');
    this.client.unsubscribe(b + '/status');
  };

  MqttProvider.prototype._route = function (topic, payload, meta = {}) {
    const parts = String(topic).split('/');
    if (parts.length !== 3 || parts[0] !== 'esp32bot' || !/^[0-9a-f]{12}$/i.test(parts[1])) return;
    // Normalize: topics may use lowercase hex while deviceId is uppercase.
    const id = parts[1].toUpperCase();
    const leaf = parts[2];
    let data = null;
    try { data = JSON.parse(payload); }
    catch (_) {
      const t = String(payload == null ? '' : payload).trim().toLowerCase();
      if (leaf === 'status' && (t === 'online' || t === 'offline')) data = t;
      else return;
    }
    if (leaf === 'status') this._onStatus(id, data);
    else if (leaf === 'sensors') {
      if (meta.retained || !data || (data.device && String(data.device).toUpperCase() !== id)) return;
      if (id !== this.deviceId) { this._noteSensorsDiscovery(id, data); return; }
      this._onSensors(data);
    }
    else if (leaf === 'motor') {
      if (id !== this.deviceId) return;
      this._onMotor(data);
    }
  };

  // Sensors frame from a non-selected known node: record its flavour +
  // signal for the device switcher, but never touch the live readings
  // (those always come from the selected node only).
  MqttProvider.prototype._noteSensorsDiscovery = function (id, d) {
    try {
      if (!d || typeof d !== 'object') return;
      const dev = this._dev(id);
      const npk = d.npk && typeof d.npk === 'object' ? d.npk : null;
      if (npk) dev.hasNpk = true;
      else if (dev.hasNpk !== true) dev.hasNpk = false;
      if (num(d.wifi_rssi) != null) dev.rssi = num(d.wifi_rssi);
      if (num(d.uptime_s) != null) dev.uptime = num(d.uptime_s);
      dev.lastSeen = Date.now();
      this._emit({ type: 'devices' });
    } catch (_) { /* never break telemetry on discovery */ }
  };

  MqttProvider.prototype._dev = function (id) {
    if (!this.devices[id]) this.devices[id] = { id, online: false, lastSeen: 0, hasNpk: null, rssi: null, uptime: null };
    return this.devices[id];
  };

  MqttProvider.prototype._onStatus = function (id, data) {
    const d = this._dev(id);
    const on = data === 'online' || (data && data.online === true);
    d.online = !!on;
    d.lastSeen = Date.now();
    this._emit({ type: 'devices' });
    if (id === this.deviceId) this._push();
  };

  MqttProvider.prototype.analogPct = function (raw) {
    const r = num(raw);
    if (r == null) return null;
    const span = this.calDry - this.calWet;
    if (!span) return null;
    return Math.min(100, Math.max(0, ((this.calDry - r) / span) * 100));
  };

  MqttProvider.prototype._onSensors = function (d) {
    if (!d || typeof d !== 'object') return;
    const r = this.reading;
    // NPK block (may be {ok:false} or absent on basic nodes)
    const npk = d.npk && typeof d.npk === 'object' ? d.npk : null;
    const npkOk = okBlock(npk);
    r.n = npkOk ? num(npk.n_mgkg) : null;
    r.p = npkOk ? num(npk.p_mgkg) : null;
    r.k = npkOk ? num(npk.k_mgkg) : null;
    r.ph = npkOk ? num(npk.ph) : null;
    if (d.device) {
      const rawDev = String(d.device);
      const devId = rawDev.toUpperCase().replace(/[^0-9A-F]/g, '') || rawDev;
      const dev = this._dev(devId);
      dev.hasNpk = !!npk;
      if (num(d.wifi_rssi) != null) dev.rssi = num(d.wifi_rssi);
      if (num(d.uptime_s) != null) dev.uptime = num(d.uptime_s);
    }
    // Moisture: NPK % preferred, else average of valid analog channels
    const npkMoist = npkOk ? num(npk.moisture_pct) : null;
    let analogMoist = null;
    try {
      const raws = d.soil_analog && d.soil_analog.raw;
      if (Array.isArray(raws)) {
        const vals = raws.map((x) => this.analogPct(x)).filter((v) => v != null);
        if (vals.length) analogMoist = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
    } catch (_) { /* ignore */ }
    r.moisture = npkMoist != null ? npkMoist : analogMoist;
    // Environment
    const bmp = d.bmp280 && typeof d.bmp280 === 'object' ? d.bmp280 : null;
    const bmpOk = okBlock(bmp);
    const luxBlock = d.bh1750 && typeof d.bh1750 === 'object' ? d.bh1750 : null;
    r.tempC = bmpOk ? num(bmp.temperature_c) : (npkOk ? num(npk.temperature_c) : null);
    r.pressureHpa = bmpOk ? num(bmp.pressure_hpa) : null;
    r.lux = (luxBlock && luxBlock.ok !== false) ? num(luxBlock.lux) : null;
    r.humidity = null; // no humidity sensor on either node (optional/future)
    // Embedded motor echo
    if (d.motor && typeof d.motor === 'object') this._applyMotor(d.motor);
    this.lastTelemetryAt = Date.now();
    this._rollHistory();
    this._push();
    this._emit({ type: 'devices' });
  };

  MqttProvider.prototype._applyMotor = function (m) {
    const dirs = ['forward', 'backward', 'left', 'right', 'stopped'];
    if (dirs.includes(m.direction)) this.motor.direction = m.direction;
    const sp = num(m.speed);
    if (sp != null) this.motor.speed = Math.min(255, Math.max(0, Math.round(sp)));
    this.motor.at = Date.now();
    this._emit({ type: 'motor' });
  };

  MqttProvider.prototype._onMotor = function (d) {
    if (!d || typeof d !== 'object') return;
    this._applyMotor(d);
    this._push();
  };

  MqttProvider.prototype._rollHistory = function () {
    const r = this.reading;
    const now = Date.now();
    // Pressure: rolling ~6h at 5s cadence (cap 48 points like mock spacing)
    if (r.pressureHpa != null) {
      this.pressureHistory.push({ t: now, hpa: Math.round(r.pressureHpa * 10) / 10 });
      while (this.pressureHistory.length > 72) this.pressureHistory.shift();
      save(STORE_PRESS, this.pressureHistory.slice(-72));
    }
    // Temperature season: one entry per day with min/max
    const key = todayKey();
    let today = this.season.length ? this.season[this.season.length - 1] : null;
    if (!today || today.date !== key) {
      today = { date: key, tmax: r.tempC, tmin: r.tempC };
      this.season.push(today);
      while (this.season.length > 21) this.season.shift();
      this._closeYesterday();
    }
    if (r.tempC != null) {
      if (today.tmax == null || r.tempC > today.tmax) today.tmax = r.tempC;
      if (today.tmin == null || r.tempC < today.tmin) today.tmin = r.tempC;
      r.tmax = today.tmax;
      r.tmin = today.tmin;
    }
    save(STORE_SEASON, this.season);
    // Daily series for history charts (running averages, closed daily)
    this._accumulateDaily();
  };

  MqttProvider.prototype._closeYesterday = function () {
    // Fold the previous open day into the 7-day series.
    try {
      const crop = E.getCrop((this.profile || {}).cropId || 'bajra');
      const prev = this.season.length >= 2 ? this.season[this.season.length - 2] : null;
      const acc = this._dayAcc;
      if (prev && prev.tmax != null && prev.tmin != null) {
        const g = E.agri.dailyGDD(prev.tmin, prev.tmax, crop.gddBase, crop.gddUpper);
        const lastG = this.daily.gdd.length ? this.daily.gdd[this.daily.gdd.length - 1] : 0;
        this._pushDaily(weekdayOf(prev.date),
          acc && acc.n ? acc.m / acc.n : null,
          (prev.tmax + prev.tmin) / 2,
          acc && acc.n ? acc.l / acc.n : null,
          acc && acc.n ? acc.p / acc.n : null,
          lastG + g);
      } else if (acc && acc.n) {
        this._pushDaily(weekdayOf(todayKey()), acc.m / acc.n, acc.t / acc.n, acc.l / acc.n, acc.p / acc.n,
          this.daily.gdd.length ? this.daily.gdd[this.daily.gdd.length - 1] : 0);
      }
      this._dayAcc = null;
      save(STORE_DAILY, this.daily);
    } catch (_) { /* never break telemetry on history bookkeeping */ }
  };

  MqttProvider.prototype._accumulateDaily = function () {
    const r = this.reading;
    if (!this._dayAcc) this._dayAcc = { n: 0, m: 0, t: 0, l: 0, p: 0 };
    const a = this._dayAcc;
    if (r.moisture != null) { a.m += r.moisture; }
    if (r.tempC != null) { a.t += r.tempC; }
    if (r.lux != null) { a.l += r.lux; }
    if (r.pressureHpa != null) { a.p += r.pressureHpa; }
    if (r.moisture != null || r.tempC != null) a.n++;
  };

  MqttProvider.prototype._pushDaily = function (label, m, t, l, p, g) {
    const d = this.daily;
    const r1 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
    d.labels.push(label || '');
    d.moisture.push(r1(m)); d.temp.push(r1(t));
    d.lux.push(l == null ? null : Math.round(l)); d.pressure.push(r1(p));
    d.gdd.push(g == null ? null : Math.round(g * 10) / 10);
    while (d.labels.length > 7) {
      d.labels.shift(); d.moisture.shift(); d.temp.shift();
      d.lux.shift(); d.pressure.shift(); d.gdd.shift();
    }
  };

  MqttProvider.prototype._seasonOffset = function () {
    try {
      const crop = E.getCrop((this.profile || {}).cropId || 'bajra');
      const older = this.season.slice(0, -7);
      return older.reduce((sum, day) => {
        if (day.tmax == null || day.tmin == null) return sum;
        return sum + E.agri.dailyGDD(day.tmin, day.tmax, crop.gddBase, crop.gddUpper);
      }, 0);
    } catch (_) { return 0; }
  };

  MqttProvider.prototype._displayTempHistory = function () {
    const last7 = this.season.slice(-7);
    return last7.map((d) => ({
      label: weekdayOf(d.date),
      tmax: d.tmax != null ? Math.round(d.tmax * 10) / 10 : 0,
      tmin: d.tmin != null ? Math.round(d.tmin * 10) / 10 : 0,
      _empty: d.tmax == null
    }));
  };

  MqttProvider.prototype.snapshot = function () {
    const p = this.profile;
    const stale = !this.lastTelemetryAt || (Date.now() - this.lastTelemetryAt > STALE_MS);
    return {
      cropId: p.cropId || 'bajra',
      stage: p.stage || 'vegetative',
      n: this.reading.n, p: this.reading.p, k: this.reading.k,
      moisture: this.reading.moisture, ph: this.reading.ph,
      lux: this.reading.lux, tempC: this.reading.tempC,
      pressureHpa: this.reading.pressureHpa, humidity: null,
      tmax: this.reading.tmax, tmin: this.reading.tmin,
      tempHistory: this._displayTempHistory(),
      gddOffset: Math.round(this._seasonOffset() * 10) / 10,
      pressureHistory: this.pressureHistory.map((d) => ({ ...d })),
      series: JSON.parse(JSON.stringify(this.daily)),
      takenAt: this.lastTelemetryAt || Date.now(),
      stale,
      source: 'mqtt',
      deviceId: this.deviceId
    };
  };

  MqttProvider.prototype.subscribe = function (fn) {
    this.listeners.push(fn);
    fn(this.snapshot());
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  };

  MqttProvider.prototype._push = function () {
    const snap = this.snapshot();
    try { localStorage.setItem('enviroos.lastSnapshot', JSON.stringify(snap)); } catch (_) { /* ignore */ }
    this.listeners.forEach((fn) => { try { fn(snap); } catch (_) { /* ignore */ } });
  };

  MqttProvider.prototype.onEvent = function (fn) {
    this.eventListeners.push(fn);
    return () => { this.eventListeners = this.eventListeners.filter((l) => l !== fn); };
  };

  MqttProvider.prototype._emit = function (ev) {
    this.eventListeners.forEach((fn) => { try { fn(ev); } catch (_) { /* ignore */ } });
  };

  MqttProvider.prototype.getCurrent = function () { return this.snapshot(); };
  MqttProvider.prototype.getHistory = function () { return this.daily; };

  MqttProvider.prototype.getStatus = function () {
    const dev = this.devices[this.deviceId] || { id: this.deviceId, online: false, lastSeen: 0, hasNpk: null, rssi: null, uptime: null };
    const fresh = !!this.lastTelemetryAt && (Date.now() - this.lastTelemetryAt <= STALE_MS);
    return {
      conn: this.client ? this.client.state : 'closed',
      online: !!dev.online,
      fresh,
      lastTelemetryAt: this.lastTelemetryAt,
      device: dev,
      devices: Object.keys(this.devices).map((id) => this.devices[id]),
      motor: { ...this.motor }
    };
  };

  MqttProvider.prototype.selectDevice = function (id) {
    id = String(id || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    if (!id || id === this.deviceId || this.opts.deviceId) return;
    this._unsubscribeDevice(this.deviceId);
    this.deviceId = id;
    this.persistDev();
    this._subscribeDevice();
    this._subscribeKnown();
    // Switching nodes: old readings belong to the previous node. Mark the
    // feed stale until the new node delivers, so the UI shows WAITING /
    // NO DATA instead of the other node's numbers.
    this.lastTelemetryAt = 0;
    this.reading = { n: null, p: null, k: null, moisture: null, ph: null, lux: null, tempC: null, pressureHpa: null, humidity: null, tmax: null, tmin: null };
    this.motor = { direction: 'stopped', speed: this.motor ? this.motor.speed : 150, at: 0 };
    this._emit({ type: 'devices' });
    this._push();
  };

  MqttProvider.prototype.setCalibration = function (dry, wet) {
    if (dry > 0 && wet >= 0 && dry !== wet) {
      this.calDry = dry;
      this.calWet = wet;
      this.persistDev();
    }
  };

  // Motor commands: plain text "forward 150" (QoS 0). Speed 0-255.
  MqttProvider.prototype.sendMotor = function (dir, speed) {
    const dirs = ['forward', 'backward', 'left', 'right', 'stop', 'standby', 'wake', 'status', 'sensors'];
    if (!dirs.includes(dir)) return false;
    if (!this.client) return false;
    let cmd = dir;
    if (dir !== 'stop' && speed != null) {
      const sp = Math.min(255, Math.max(0, Math.round(+speed)));
      if (Number.isFinite(sp)) cmd += ' ' + sp;
    }
    const ok = this.client.publish(this.base() + '/cmd', cmd);
    if (ok && ['forward', 'backward', 'left', 'right', 'stop'].includes(dir)) {
      this.motor.direction = dir === 'stop' ? 'stopped' : dir;
      if (speed != null && Number.isFinite(+speed)) this.motor.speed = Math.min(255, Math.max(0, Math.round(+speed)));
      this.motor.at = Date.now();
      this._emit({ type: 'motor' });
      this._push();
    }
    return ok;
  };

  MqttProvider.prototype.requestSensors = function () {
    return this.sendMotor('sensors');
  };

  MqttProvider.prototype.getDevices = function () {
    return Object.keys(this.devices).map((id) => this.devices[id]);
  };

  MqttProvider.prototype.getHistory = function () { return this.daily; };

  MqttProvider.prototype.dispose = function (stopMotor = true) {
    if (stopMotor) this.sendMotor('stop');
    try { this.client && this.client.close(); } catch (_) { /* ignore */ }
    this.client = null;
    this.listeners = [];
    this.eventListeners = [];
  };

  E.MqttProvider = MqttProvider;
  E.MQTT_DEFAULT_DEVICE = DEFAULT_DEVICE;
  E.MQTT_SECOND_DEVICE = SECOND_DEVICE;
  E.MQTT_KNOWN_DEVICES = KNOWN_DEVICES.slice();
})();
