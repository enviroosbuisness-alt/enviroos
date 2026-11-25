/* EnviroOS — minimal MQTT 3.1.1 over WebSocket client (zero dependencies).
 * Speaks just enough protocol for the farm: CONNECT, SUBSCRIBE, PUBLISH
 * (in QoS 0/1, out QoS 0), PUBACK, PINGREQ/PINGRESP, DISCONNECT.
 * Auto-reconnects with backoff and resubscribes. Validated packet codec;
 * see /tmp/opencode test notes. Public-broker friendly, no auth needed. */

'use strict';

window.EnviroOS = window.EnviroOS || {};

(function () {
  // ---------- packet codec (pure, testable) ----------
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function encodeRemainingLength(n) {
    const out = [];
    do {
      let b = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) b |= 0x80;
      out.push(b);
    } while (n > 0);
    return out;
  }

  function decodeRemainingLength(bytes, offset) {
    let mult = 1, value = 0, i = offset, b;
    do {
      if (i >= bytes.length) return null;
      b = bytes[i++];
      value += (b & 0x7f) * mult;
      mult *= 128;
      if (mult > 128 * 128 * 128) return null;
    } while (b & 0x80);
    return { value, next: i };
  }

  function encodeStr(s) {
    const b = enc.encode(s);
    return [b.length >> 8, b.length & 0xff, ...b];
  }

  function concat(...arrs) {
    const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrs) { out.set(a, o); o += a.length; }
    return out;
  }
  const U8 = (a) => (a instanceof Uint8Array ? a : new Uint8Array(a));

  function packetConnect(clientId, keepAlive) {
    const body = concat(
      U8(encodeStr('MQTT')), U8([4, 0x02, keepAlive >> 8, keepAlive & 0xff]),
      U8(encodeStr(clientId))
    );
    return concat(U8([0x10, ...encodeRemainingLength(body.length)]), body);
  }

  let nextPid = 1;
  function packetSubscribe(topics) {
    // topics: [{topic, qos}]
    const pid = (nextPid++ % 0xffff) || 1;
    const parts = [U8([(pid >> 8) & 0xff, pid & 0xff])];
    for (const t of topics) parts.push(U8(encodeStr(t.topic)), U8([t.qos & 1]));
    const body = concat(...parts);
    return { bytes: concat(U8([0x82, ...encodeRemainingLength(body.length)]), body), pid };
  }

  function packetPublish(topic, payloadStr) {
    const t = U8(encodeStr(topic));
    const p = enc.encode(payloadStr);
    const body = concat(t, p);
    return concat(U8([0x30, ...encodeRemainingLength(body.length)]), body);
  }

  function packetPuback(pid) {
    return U8([0x40, 0x02, (pid >> 8) & 0xff, pid & 0xff]);
  }

  function packetUnsubscribe(topics) {
    const pid = (nextPid++ % 0xffff) || 1;
    const parts = [U8([(pid >> 8) & 0xff, pid & 0xff])];
    for (const t of topics) parts.push(U8(encodeStr(t)));
    const body = concat(...parts);
    return { bytes: concat(U8([0xa2, ...encodeRemainingLength(body.length)]), body), pid };
  }

  const packetPingreq = () => U8([0xc0, 0x00]);
  const packetDisconnect = () => U8([0xe0, 0x00]);

  // Parse one packet from buffer; returns {packet, rest} or {packet:null, rest:buf}.
  function parsePacket(buf) {
    const b = U8(buf);
    if (b.length < 2) return { packet: null, rest: b };
    const type = b[0] >> 4;
    const len = decodeRemainingLength(b, 1);
    if (!len) return { packet: null, rest: b };
    if (b.length < len.next + len.value) return { packet: null, rest: b };
    const body = b.slice(len.next, len.next + len.value);
    const rest = b.slice(len.next + len.value);
    const readStr = (o) => {
      if (o + 2 > body.length) return null;
      const n = (body[o] << 8) | body[o + 1];
      if (o + 2 + n > body.length) return null;
      return { s: dec.decode(body.slice(o + 2, o + 2 + n)), next: o + 2 + n };
    };
    if (type === 2) { // CONNACK
      return { packet: { type: 'connack', code: body.length >= 2 ? body[1] : 255 }, rest };
    }
    if (type === 3) { // PUBLISH
      const qos = (b[0] >> 1) & 3;
      const t = readStr(0);
      if (!t) return { packet: { type: 'error', reason: 'bad-topic' }, rest };
      let o = t.next, pid = 0;
      if (qos > 0) {
        if (o + 2 > body.length) return { packet: { type: 'error', reason: 'bad-pid' }, rest };
        pid = (body[o] << 8) | body[o + 1];
        o += 2;
      }
      let payload = '';
      try { payload = dec.decode(body.slice(o)); } catch (_) { payload = ''; }
      return { packet: { type: 'publish', topic: t.s, qos, pid, payload, retained:!!(b[0] & 1) }, rest };
    }
    if (type === 9) return { packet: { type: 'suback' }, rest }; // SUBACK
    if (type === 13) return { packet: { type: 'pingresp' }, rest }; // PINGRESP
    return { packet: { type: 'other', code: type }, rest };
  }

  // ---------- client ----------
  function randomClientId() {
    const hex = '0123456789abcdef';
    let s = 'enviroos-';
    try {
      const r = new Uint8Array(8);
      (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(r) : r.map(() => Math.floor(Math.random() * 256));
      for (const x of r) s += hex[x & 15];
    } catch (_) {
      for (let i = 0; i < 8; i++) s += hex[Math.floor(Math.random() * 16)];
    }
    return s;
  }

  // opts: {url, keepAlive, onState(state), onMessage(topic, payloadStr), log}
  // states: connecting|connected|reconnecting|closed|error:<detail>
  function MqttClient(opts) {
    this.opts = Object.assign({ keepAlive: 60 }, opts || {});
    this.clientId = randomClientId();
    this.ws = null;
    this.buf = new Uint8Array(0);
    this.subs = []; // [{topic, qos}]
    this.state = 'closed';
    this.wantOpen = false;
    this.retryMs = 1000;
    this.pingTimer = null;
    this.connectTimer = null;
    this.retryTimer = null;
    this.lastTraffic = 0;
  }

  MqttClient.prototype.setState = function (s) {
    this.state = s;
    try { this.opts.onState && this.opts.onState(s); } catch (_) { /* ignore */ }
  };

  MqttClient.prototype.open = function () {
    if (this.wantOpen) return;
    this.wantOpen = true;
    this.retryMs = 1000;
    this._connect();
  };

  MqttClient.prototype._connect = function () {
    const self = this;
    if (!self.wantOpen) return;
    self.setState('connecting');
    self.buf = new Uint8Array(0);
    let ws;
    try {
      ws = new WebSocket(self.opts.url);
    } catch (_) {
      self._schedule();
      return;
    }
    try { ws.binaryType = 'arraybuffer'; } catch (_) { /* ignore */ }
    self.ws = ws;
    // A socket may open without ever receiving MQTT CONNACK.
    self.connectTimer = setTimeout(() => {
      if (self.ws === ws && self.state === 'connecting') ws.close();
    }, 6000);
    ws.onopen = () => {
      if (self.ws !== ws) return;
      try { ws.send(packetConnect(self.clientId, self.opts.keepAlive)); } catch (_) { ws.close(); }
    };
    ws.onmessage = (ev) => { if (self.ws === ws) self._onData(ev.data); };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = () => {
      if (self.ws !== ws) return;
      clearTimeout(self.connectTimer);
      self._stopPing();
      self.ws = null;
      if (self.wantOpen) self._schedule();
      else self.setState('closed');
    };
  };

  MqttClient.prototype._schedule = function () {
    const self = this;
    if (!self.wantOpen || self.retryTimer !== null) return;
    self.setState('reconnecting');
    const wait = self.retryMs;
    self.retryMs = Math.min(30000, self.retryMs * 2);
    self.retryTimer = setTimeout(() => {
      self.retryTimer = null;
      if (self.wantOpen) self._connect();
    }, wait);
  };

  MqttClient.prototype._onData = function (data) {
    const self = this;
    self.lastTraffic = Date.now();
    let chunk;
    if (data instanceof ArrayBuffer) chunk = new Uint8Array(data);
    else if (data instanceof Uint8Array) chunk = data;
    else if (typeof Blob !== 'undefined' && data instanceof Blob) {
      data.arrayBuffer().then((ab) => self._onData(ab)).catch(() => {});
      return;
    } else return;
    self.buf = concat(self.buf, chunk);
    for (;;) {
      const r = parsePacket(self.buf);
      if (!r.packet) { self.buf = r.rest; break; }
      self.buf = r.rest;
      self._handle(r.packet);
    }
  };

  MqttClient.prototype._handle = function (p) {
    const self = this;
    if (p.type === 'connack') {
      clearTimeout(self.connectTimer);
      if (p.code !== 0) {
        try { self.opts.log && self.opts.log('conn refused: ' + p.code); } catch (_) {}
        self.setState('error:refused');
        self.wantOpen = false;
        try { self.ws && self.ws.close(); } catch (_) {}
        return;
      }
      self.retryMs = 1000;
      self.setState('connected');
      self._startPing();
      if (self.subs.length) self._sendSub(self.subs);
      return;
    }
    if (p.type === 'publish') {
      if (p.qos === 1 && self.ws) {
        try { self.ws.send(packetPuback(p.pid)); } catch (_) { /* ignore */ }
      }
      try { self.opts.onMessage && self.opts.onMessage(p.topic, p.payload, {retained:p.retained}); } catch (_) { /* ignore */ }
      return;
    }
    // suback / pingresp / other: nothing to do (pingresp resets via traffic time)
  };

  MqttClient.prototype._sendSub = function (subs) {
    try {
      const r = packetSubscribe(subs);
      this.ws.send(r.bytes);
    } catch (_) { /* reconnect will retry */ }
  };

  MqttClient.prototype.subscribe = function (topic, qos) {
    const ex = this.subs.find((s) => s.topic === topic);
    if (ex) ex.qos = qos;
    else this.subs.push({ topic, qos: qos || 0 });
    if (this.state === 'connected' && this.ws) this._sendSub([{ topic, qos: qos || 0 }]);
  };

  MqttClient.prototype.unsubscribe = function (topic) {
    this.subs = this.subs.filter((s) => s.topic !== topic);
    if (this.state === 'connected' && this.ws) {
      try {
        const r = packetUnsubscribe([topic]);
        this.ws.send(r.bytes);
      } catch (_) { /* reconnect will resync */ }
    }
  };

  MqttClient.prototype.publish = function (topic, payloadStr) {
    if (this.state !== 'connected' || !this.ws) return false;
    try {
      this.ws.send(packetPublish(topic, payloadStr));
      this.lastTraffic = Date.now();
      return true;
    } catch (_) { return false; }
  };

  MqttClient.prototype._startPing = function () {
    const self = this;
    self._stopPing();
    const interval = Math.max(15000, (self.opts.keepAlive * 1000 * 3) / 4);
    self.pingTimer = setInterval(() => {
      if (self.state !== 'connected' || !self.ws) return;
      if (Date.now() - self.lastTraffic < interval) return;
      try { self.ws.send(packetPingreq()); } catch (_) { /* onclose handles */ }
    }, 5000);
  };

  MqttClient.prototype._stopPing = function () {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  };

  MqttClient.prototype.close = function () {
    this.wantOpen = false;
    clearTimeout(this.connectTimer);
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this._stopPing();
    const ws = this.ws;
    this.ws = null;
    try {
      if (ws && this.state === 'connected') ws.send(packetDisconnect());
    } catch (_) { /* ignore */ }
    try { ws?.close(); } catch (_) { /* ignore */ }
    this.setState('closed');
  };

  EnviroOS.MqttClient = MqttClient;
  EnviroOS._mqttCodec = {
    packetConnect, packetSubscribe, packetPublish, packetPuback, packetUnsubscribe,
    packetPingreq, packetDisconnect, parsePacket, randomClientId
  };
})();
