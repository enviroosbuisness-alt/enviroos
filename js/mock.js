/* EnviroOS — DATA layer.
 * Clean provider abstraction so a future MQTT provider can replace the mock
 * without touching the UI:
 *
 *   const provider = new EnviroOS.MockProvider(profile);
 *   provider.subscribe(snapshot => render(snapshot));
 *
 * A future MqttProvider would implement the same interface:
 *   { subscribe(fn), getCurrent(), getHistory(), dispose() }
 *
 * "Mock Data -> Agricultural Analysis -> UI" (this version).
 * No fake MQTT buttons anywhere.
 */

'use strict';

window.EnviroOS = window.EnviroOS || {};

(function () {
  const E = EnviroOS;

  // --- tiny seeded PRNG (mulberry32) so mock history is stable per day ---
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function smoothNoise(rand, prev, mean, amp, pull) {
    // mean-reverting walk: feels alive, never obviously random
    return prev + (rand() - 0.5) * amp + (mean - prev) * pull;
  }

  // --- temperature history. Full season is synthesized (default 21 days since
  // sowing); the UI displays the last 7 days, while GDD accumulates everything.
  function buildTempHistory(seed, currentMax, currentMin, days) {
    const rand = rng(seed);
    const out = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const last = i === 0;
      const wave = Math.sin((days - 1 - i) * 0.55) * 1.1;
      const tmax = last ? currentMax : currentMax + wave + (rand() - 0.5) * 2.2;
      const tmin = last ? currentMin : currentMin + wave * 0.6 + (rand() - 0.5) * 1.6;
      out.push({
        label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
        tmax: Math.round(tmax * 10) / 10,
        tmin: Math.round(tmin * 10) / 10
      });
    }
    return out;
  }

  // --- pressure history: gentle drift ending near current value ---
  function buildPressureHistory(seed, currentHpa, points) {
    points = points || 25; // ~ every 15 min over 6h
    const rand = rng(seed + 7);
    const now = Date.now();
    const out = [];
    let v = currentHpa + 3.6; // started higher, drifting down => visible "changing" trend
    for (let i = points - 1; i >= 0; i--) {
      const last = i === 0;
      v = last ? currentHpa : smoothNoise(rand, v, currentHpa + 1.8, 0.5, 0.05);
      out.push({ t: now - i * 15 * 60 * 1000, hpa: Math.round(v * 10) / 10 });
    }
    return out;
  }

  // --- moisture / sunlight / generic daily series for History screen ---
  function buildSeries(seed, base, amp, n, decimals, drift) {
    const rand = rng(seed);
    const out = [];
    let v = base;
    for (let i = 0; i < n; i++) {
      v = smoothNoise(rand, v, base + (drift || 0) * i, amp, 0.08);
      out.push(Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals));
    }
    // pin the last point near a realistic "today" value
    out[n - 1] = Math.round((base + (drift || 0) * (n - 1)) * 10) / 10;
    return out;
  }

  // Realistic midday-ish Jodhpur scenario for Bajra (matches the brief):
  // dry soil, high heat, strong sun, falling pressure.
  const DEFAULT_READING = {
    n: 42, p: 18, k: 96,
    moisture: 28, ph: 6.8,
    lux: 64820, tempC: 37, tmax: 39.5, tmin: 26.5,
    pressureHpa: 1004, humidity: 34
  };

  function MockProvider(profile, opts) {
    this.profile = profile || {};
    this.opts = opts || {};
    this.listeners = [];
    this.timer = null;
    this.tick = 0;
    this.seed = this.opts.seed || 20260920;
    this.reading = Object.assign({}, DEFAULT_READING, this.opts.reading || {});
    this.seasonDays = this.opts.seasonDays || 21;
    const fullTemp = buildTempHistory(this.seed, this.reading.tmax, this.reading.tmin, this.seasonDays);
    // GDD offset: heat accumulated before the displayed 7-day window.
    const crop0 = E.getCrop((profile || {}).cropId || 'bajra');
    this.gddOffset = fullTemp.slice(0, -7).reduce(
      (sum, d) => sum + E.agri.dailyGDD(d.tmin, d.tmax, crop0.gddBase, crop0.gddUpper), 0);
    this.gddOffset = Math.round(this.gddOffset * 10) / 10;
    this.tempHistory = fullTemp.slice(-7);
    this.pressureHistory = buildPressureHistory(this.seed, this.reading.pressureHpa, 25);
    // 7-day series for history charts (monotonic-ish drying soil)
    this.series = {
      moisture: buildSeries(this.seed + 11, 34, 1.6, 7, 1, -1.0),
      temp: buildSeries(this.seed + 22, 34.5, 1.4, 7, 1, 0.4),
      lux: buildSeries(this.seed + 33, 58000, 9000, 7, 0, 900),
      pressure: buildSeries(this.seed + 44, 1009, 1.6, 7, 1, -0.8),
      gdd: null // filled from tempHistory cumulative
    };
    this.series.gdd = cumulativeFromTempHistory(this.tempHistory, this.profile.cropId, this.gddOffset);
  }

  function cumulativeFromTempHistory(tempHistory, cropId, offset) {
    const crop = E.getCrop(cropId || 'bajra');
    const out = [];
    let sum = offset || 0;
    for (const d of tempHistory) {
      sum += E.agri.dailyGDD(d.tmin, d.tmax, crop.gddBase, crop.gddUpper);
      out.push(Math.round(sum * 10) / 10);
    }
    return out;
  }

  MockProvider.prototype.snapshot = function () {
    const p = this.profile;
    return {
      cropId: p.cropId || 'bajra',
      stage: p.stage || 'vegetative',
      n: this.reading.n, p: this.reading.p, k: this.reading.k,
      moisture: this.reading.moisture, ph: this.reading.ph,
      lux: this.reading.lux, tempC: this.reading.tempC,
      pressureHpa: this.reading.pressureHpa, humidity: this.reading.humidity,
      tmax: this.reading.tmax, tmin: this.reading.tmin,
      tempHistory: this.tempHistory.map(d => ({ ...d })),
      gddOffset: this.gddOffset,
      pressureHistory: this.pressureHistory.map(d => ({ ...d })),
      series: JSON.parse(JSON.stringify(this.series)),
      takenAt: Date.now(),
      source: 'mock'
    };
  };

  MockProvider.prototype.subscribe = function (fn) {
    this.listeners.push(fn);
    fn(this.snapshot()); // immediate first value
    // Gentle live drift every 30s: soil dries slowly, heat shimmers.
    if (!this.timer) {
      this.timer = setInterval(() => this._drift(), 30000);
    }
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  };

  MockProvider.prototype._drift = function () {
    const rand = rng(this.seed + (++this.tick) * 101);
    const r = this.reading;
    r.moisture = Math.round(Math.min(48, Math.max(18, smoothNoise(rand, r.moisture, 27.5, 0.7, 0.05))) * 10) / 10;
    r.tempC = Math.round(Math.min(43, Math.max(30, smoothNoise(rand, r.tempC, 37, 0.5, 0.05))) * 10) / 10;
    r.lux = Math.round(Math.min(95000, Math.max(20000, smoothNoise(rand, r.lux, 64820, 4200, 0.05))));
    r.pressureHpa = Math.round(Math.min(1020, Math.max(995, smoothNoise(rand, r.pressureHpa, 1004, 0.4, 0.04))) * 10) / 10;
    r.humidity = Math.round(Math.min(60, Math.max(15, smoothNoise(rand, r.humidity, 33, 1.6, 0.05))));
    // keep today's temp-history entry in sync
    const last = this.tempHistory[this.tempHistory.length - 1];
    last.tmax = Math.round((r.tempC + 2.5) * 10) / 10;
    last.tmin = Math.round((r.tempC - 10.5) * 10) / 10;
    this.pressureHistory.push({ t: Date.now(), hpa: r.pressureHpa });
    if (this.pressureHistory.length > 48) this.pressureHistory.shift();
    const snap = this.snapshot();
    try { localStorage.setItem('enviroos.lastSnapshot', JSON.stringify(snap)); } catch (_) { /* private mode */ }
    this.listeners.forEach(fn => { try { fn(snap); } catch (_) { /* listener error */ } });
  };

  MockProvider.prototype.getCurrent = function () { return this.snapshot(); };
  MockProvider.prototype.getHistory = function () { return this.series; };
  MockProvider.prototype.dispose = function () {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listeners = [];
  };

  E.MockProvider = MockProvider;
})();
