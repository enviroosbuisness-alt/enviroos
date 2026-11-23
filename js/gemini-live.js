/* EnviroOS — GEMINI LIVE engine (realtime speech with farm context).
 * Opens a bidirectional session only while the farmer is talking to Agri
 * (standby wake-word stays local and free). Sends live farm readings as the
 * system context, streams the farmer's voice in, plays Gemini's spoken reply
 * out (Gemini TTS — that IS Agri's voice now), and returns transcripts.
 * Any failure (no key, offline, quota, mic) throws so the caller can fall
 * back to the built-in offline engine. Idle sessions auto-close (~90s). */

'use strict';

window.EnviroOS = window.EnviroOS || {};

(function () {
  const E = EnviroOS;

  const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';
  const IN_RATE = 16000;
  const OUT_RATE = 24000;
  const IDLE_MS = 90000;

  function configured() {
    return !!(E.geminiKey && E.geminiKey.length > 20);
  }

  // ---------- audio codecs ----------
  function f32ToB64(floats) {
    const d = new DataView(new ArrayBuffer(floats.length * 2));
    for (let i = 0; i < floats.length; i++) {
      const s = Math.max(-1, Math.min(1, floats[i]));
      d.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    const bytes = new Uint8Array(d.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function b64ToF32(b64) {
    const bin = atob(b64);
    const d = new DataView(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) d.setUint8(i, bin.charCodeAt(i));
    const out = new Float32Array(bin.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = d.getInt16(i * 2, true) / 0x8000;
    return out;
  }

  function resample(floats, from, to) {
    if (from === to) return floats;
    const ratio = from / to;
    const out = new Float32Array(Math.floor(floats.length / ratio));
    for (let i = 0; i < out.length; i++) out[i] = floats[Math.floor(i * ratio)];
    return out;
  }

  // ---------- farm context (what Gemini knows) ----------
  // Agri speaks the farmer's selected language — every supported one,
  // not just Hindi. The model hears any language; this sets its reply.
  function replyLang(uiLang) {
    switch (uiLang) {
      case 'hi': return 'Hindi (simple, spoken-friendly words)';
      case 'mr': return 'Marathi (simple, spoken-friendly words)';
      case 'gu': return 'Gujarati (simple, spoken-friendly words)';
      case 'pa': return 'Punjabi (simple, spoken-friendly words)';
      case 'ta': return 'Tamil (simple, spoken-friendly words)';
      case 'te': return 'Telugu (simple, spoken-friendly words)';
      case 'kn': return 'Kannada (simple, spoken-friendly words)';
      case 'bn': return 'Bengali (simple, spoken-friendly words)';
      case 'es': return 'Spanish (simple, spoken-friendly words)';
      case 'fr': return 'French (simple, spoken-friendly words)';
      case 'pt': return 'Portuguese (simple, spoken-friendly words)';
      case 'it': return 'Italian (simple, spoken-friendly words)';
      case 'zh': return 'Mandarin Chinese (simple, spoken-friendly words)';
      case 'de': return 'German (simple, spoken-friendly words)';
      default: return 'very simple English (short words, the farmer may have low literacy)';
    }
  }

  function buildContext(st) {
    // Defensive: any missing reading becomes "unknown", never a crash
    // (a crashed context looks like "no internet" to the farmer).
    st = st || {};
    const s = st.snapshot || {}, a = st.analysis || {}, p = st.profile || {};
    const unk = (v, suffix) => (v == null || v === '' ? 'unknown' : String(v) + (suffix || ''));
    const lvl = (o) => (o && o.level) || 'unknown';
    const cropName = (E.getCrop ? E.getCrop(p.cropId || 'bajra').name_en : (p.cropId || 'bajra'));
    const trend = (a.weather && a.weather.trend && a.weather.trend.changeHpa != null)
      ? (+a.weather.trend.changeHpa).toFixed(1) : 'unknown';
    const gdd = (a.crop && a.crop.cumulativeGDD != null) ? Math.round(a.crop.cumulativeGDD) : 'unknown';
    const vpd = (a.vpdKpa != null) ? (+a.vpdKpa).toFixed(1) + ' kPa' : 'unknown';
    const lines = [
      `Farm: ${cropName} at stage ${p.stage || 'unknown'}, pincode ${p.pincode || 'unknown'}, ${p.sizeValue || ''} ${p.sizeUnit || 'acres'}.`,
      `Live sensor readings: soil moisture ${unk(s.moisture, '%')}, nitrogen ${unk(s.n, ' mg/kg')}, phosphorus ${unk(s.p, ' mg/kg')}, potassium ${unk(s.k, ' mg/kg')}, soil pH ${unk(s.ph)}.`,
      `Air: ${unk(s.tempC, ' C')}, sunlight ${unk(s.lux, ' lux')}, pressure ${unk(s.pressureHpa, ' hPa')} (3-hour change ${trend}), humidity ${s.humidity == null ? 'unknown' : s.humidity + '%'}, VPD ${vpd}.`,
      `Field status now: water=${lvl(a.water)}, heat=${lvl(a.heat)}, soil=${a.soilLevel || 'unknown'}, weather=${lvl(a.weather)}. Crop development on track, total Growing Degree Days ${gdd}.`
    ];
    const o = st.outlook;
    if (o && o.source === 'online' && o.hourly && o.hourly.length) {
      const peak = Math.max.apply(null, o.hourly.map((h) => (h.prob == null ? 0 : h.prob)));
      lines.push(`Rain forecast for ${o.place}: up to ${peak}% chance in the next hours.`);
    } else if (o && o.estimate) {
      lines.push(`No online forecast. Field estimate only: rain chance about ${o.estimate.prob}% (an estimate, not a promise).`);
    }
    return [
      'ROLE: You are Agri, a trusted agricultural expert and companion for an Indian farmer standing in the field. You know THIS farm (readings below). You give REAL, practical, direct advice — never brush the farmer off to a fictional adviser. Warm, respectful, clear, and reassuring.',
      `LANGUAGE: Reply in ${replyLang(st.lang)}. Short spoken sentences, simple everyday words — the farmer may have low literacy. Say numbers and dosages plainly.`,
      'ACTIONABLE FARMING ADVICE — BE A REAL ADVISER:',
      '- When asked about fertilizers, give specific, practical doses (e.g. Urea, DAP, MOP in kg per acre or spoonfuls per plant) tailored to the crop stage.',
      '- When asked about plant health or yellow/spotted leaves, diagnose probable causes (e.g. nitrogen deficiency, blight, sucking pests) and give immediate actionable remedies (e.g. Neem oil spray 5ml/L, Trichoderma, Mancozeb/fungicide, or irrigation adjust).',
      '- Give definite guidance on whether to irrigate today based on the live moisture reading and rain forecast.',
      '- Pump control: the farmer can ask you to run the water pump ("start the pump", "stop", "auto mode", "set low threshold to 25%"). Use control_pump for these — never claim to run the pump without calling it, and always speak what you did.',
      '- Camera: when the farmer shows leaves or pests, describe what you observe and state the most likely issue and immediate remedy.',
      'GROUNDING — USE YOUR TOOLS, DO NOT GUESS:',
      '- Farm numbers: call get_field_readings / get_rain_outlook / get_crop_calendar for anything current. Prefer tool results over session-start readings.',
      '- Outside knowledge (Krishi Vigyan Kendra addresses, schemes, market prices): call web_search or find_place. For prices add that they change daily at the mandi.',
      'SAFETY RULES:',
      '- Never invent sensor numbers; say "unknown" when sensor data is missing.',
      '- Rain: describe as "संभावना" (chance/likelihood), never a guaranteed certainty.',
      'Readings at session start: ' + lines.join(' ')
    ].join('\n');
  }

  // Live tool implementations, registered by the voice layer
  // (it owns the farm bindings). Engine calls them on server toolCall.
  const liveTools = {};

  function registerTool(name, fn) {
    liveTools[name] = fn;
  }

  // ---------- session ----------
  function alive(sess) {
    return !!(sess && !sess.closed && sess.ws && sess.ws.readyState === 1);
  }

  // Static declarations sent in every Live setup (with Google Search).
  const TOOL_DECLARATIONS = [
    {
      name: 'get_field_readings',
      description: 'Fresh live sensor readings and field status (water, heat, soil, weather). Call whenever the farmer asks about current conditions.',
      parameters: { type: 'OBJECT', properties: {} }
    },
    {
      name: 'get_rain_outlook',
      description: 'Fresh rain forecast for the farm: online probability or field estimate. Call for any rain/weather question.',
      parameters: { type: 'OBJECT', properties: {} }
    },
    {
      name: 'get_crop_calendar',
      description: 'Crop development: GDD total, growth stage, progress to next stage. Call for growth/development questions.',
      parameters: { type: 'OBJECT', properties: {} }
    },
    {
      name: 'web_search',
      description: 'Search the web for outside knowledge the farm sensors cannot answer: Krishi Vigyan Kendra info AND full street addresses, crop varieties, pest and disease information, government schemes, market prices, weather news. Returns article text plus postal addresses with PIN codes. Call it, then answer from its results.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Short search query in English, e.g. "Krishi Vigyan Kendra Jodhpur address"' }
        },
        required: ['query']
      }
    },
    {
      name: 'find_place',
      description: 'Find a REAL place with its full postal address, map link and location: Krishi Vigyan Kendra, mandis, shops, towns. MUST call this for any "where is / address of" question. Returns Google addresses, not guesses.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Place query in English, e.g. "Krishi Vigyan Kendra Jodhpur"' }
        },
        required: ['query']
      }
    },
    {
      name: 'control_pump',
      description: 'Control the farm water pump by voice: start it, stop it, read its status, switch manual/auto mode, or set auto thresholds (soil moisture %, heat °C, sunlight lux). Every pump start/stop pauses auto mode for 30 minutes like a manual tap. Use for "start/stop the pump", "auto mode", "set low threshold to 25%", "start above 38 degrees".',
      parameters: {
        type: 'OBJECT',
        properties: {
          action: { type: 'STRING', description: 'One of: on, off, status, auto, manual, set' },
          low: { type: 'NUMBER', description: 'Auto-start below this soil % (with action set)' },
          high: { type: 'NUMBER', description: 'Auto-stop above this soil % (with action set)' },
          temp: { type: 'NUMBER', description: 'Also auto-start at/above this air temperature in °C (with action set). Omit to leave unchanged.' },
          lux: { type: 'NUMBER', description: 'Also auto-start at/above this sunlight in lux (with action set). Omit to leave unchanged.' }
        },
        required: ['action']
      }
    }
  ];

  // One live camera frame into an open session (JPEG, called ~every 2s by
  // the voice layer while the farmer shows the crop).
  function sendVideo(sess, b64) {
    if (!alive(sess) || !b64) return false;
    try {
      sess.ws.send(JSON.stringify({ realtimeInput: { video: { mimeType: 'image/jpeg', data: b64 } } }));
      return true;
    } catch (_) { return false; }
  }

  function connect(ctx, handlers, opts) {
    handlers = handlers || {};
    opts = opts || {};
    const needMic = opts.needMic !== false;
    // modality: 'AUDIO' (spoken replies) or 'TEXT' (transcription only).
    // closeAfterTurn: hang up right after the first answered turn
    // (dictation, one-shot speech) instead of waiting out the idle timer.
    const modality = opts.modality === 'TEXT' ? 'TEXT' : 'AUDIO';
    const closeAfterTurn = !!opts.closeAfterTurn;
    // idleMs: standby sessions (wake-word ear) pass 0 = never auto-close;
    // otherwise the shared 90s idle hang-up applies. systemText overrides
    // the farm-context prompt (a silent transcriber needs no farm briefing).
    return new Promise((resolve, reject) => {
      if (!configured()) { reject(new Error('key')); return; }
      let ws;
      try {
        ws = new WebSocket(WS_URL + '?key=' + encodeURIComponent(E.geminiKey));
      } catch (_) { reject(new Error('socket')); return; }

      const sess = {
        ws, closed: false, mic: null, player: null, outCtx: null,
        inBuf: '', outBuf: '', sources: [], idleTimer: null, done: false,
        keepStream: !!opts.keepStream,
        _handlers: handlers,
        close(reason) {
          if (sess.closed) return;
          sess.closed = true;
          try { liveSessions.delete(sess); } catch (_) { /* ignore */ }
          clearTimeout(sess.idleTimer);
          try {
            if (sess.mic) {
              try { sess.mic.proc.disconnect(); } catch (_) { /* ignore */ }
              // keepStream: the caller owns this MediaStream (the app's one
              // persistent mic — never killed between wake-ups and calls).
              // Tear down only this session's graph, leave the track alive.
              if (!sess.keepStream) {
                try { sess.mic.stream.getTracks().forEach((tr) => tr.stop()); } catch (_) { /* ignore */ }
              }
              try { sess.mic.ctx.close(); } catch (_) { /* ignore */ }
            }
          } catch (_) { /* ignore */ }
          sess.mic = null;
          // Never cut scheduled audio on a natural ending (turn done / idle):
          // the tail of the reply is often still playing. Only a deliberate
          // hang-up stops the speaker at once.
          const hardStop = (reason !== 'turn-done' && reason !== 'idle');
          try { if (sess.player && hardStop) sess.player.stop(); } catch (_) { /* ignore */ }
          try { if (sess.outCtx && hardStop) sess.outCtx.close(); } catch (_) { /* ignore */ }
          if (!hardStop) {
            // Release the speaker context once the tail finishes (no leak
            // across many short sessions), without touching playback.
            const cleanup = () => {
              if (sess.closed !== true) return;
              const busy = sess.player && sess.player.active;
              if (!busy) {
                try { sess.outCtx && sess.outCtx.close(); } catch (_) { /* ignore */ }
                sess.outCtx = null; sess.player = null;
              } else setTimeout(cleanup, 5000);
            };
            setTimeout(cleanup, 15000);
          }
          try { ws.close(); } catch (_) { /* ignore */ }
          if (handlers.onEnd && !sess.silentEnd) { try { handlers.onEnd(reason || 'closed'); } catch (_) { /* ignore */ } }
        },
        sendText(text) {
          if (!alive(sess) || !text) return false;
          touchIdle();
          try {
            ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }));
            return true;
          } catch (_) { return false; }
        }
      };
      function touchIdle() {
        clearTimeout(sess.idleTimer);
        sess.idleTimer = null;
        const idleMs = (opts.idleMs == null ? IDLE_MS : +opts.idleMs);
        if (!(idleMs > 0)) return; // standby ear: lives until closed
        sess.idleTimer = setTimeout(() => { sess.silentEnd = false; sess.close('idle'); }, idleMs);
      }

      const fail = (why) => {
        if (sess.done) return;
        sess.done = true;
        sess.failed = true;
        sess.silentEnd = true;
        try { ws.close(); } catch (_) { /* ignore */ }
        reject(new Error(why));
      };

      // Farm networks are slow: allow a long time for the first reply.
      const setupTimer = setTimeout(() => fail(new Error('slow')), 25000);

      ws.onopen = () => {
        touchIdle();
        try {
          ws.send(JSON.stringify({
            setup: {
              model: 'models/' + (E.geminiModel || 'gemini-2.0-flash-live-001'),
              generationConfig: {
                responseModalities: [modality],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: E.geminiVoice || 'Fenrir' } } }
              },
              systemInstruction: { parts: [{ text: opts.systemText || buildContext(ctx) }] },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              // NOTE: the googleSearch tool hangs setup on this Live model
              // (server never answers). Farm function tools only.
              // Wake-word ears pass noTools to keep setup light (STT only).
              tools: opts.noTools ? [] : [{ functionDeclarations: TOOL_DECLARATIONS }]
            }
          }));
        } catch (_) { fail('setup'); }
      };

      ws.onerror = () => { if (!sess.done) fail('socket'); };

      ws.onclose = () => {
        if (!sess.done) { sess.done = true; fail('socket'); }
        if (!sess.closed && !sess.failed) {
          sess.closed = true;
          if (handlers.onEnd) { try { handlers.onEnd('closed'); } catch (_) { /* ignore */ } }
        }
      };

      try { ws.binaryType = 'arraybuffer'; } catch (_) { /* ignore */ }

      const handleJson = (raw) => {
        let msg = null;
        try { msg = JSON.parse(raw); } catch (_) { return; }
        if (!msg) return;
        if (msg.error) {
          // Server rejections (quota, overload, bad voice...) must surface
          // instantly with their real reason — never sit out the timeout
          // and never masquerade as "no internet".
          const em = String((msg.error && msg.error.message) || msg.error.status || 'server refused');
          fail(new Error('server:' + em.slice(0, 160)));
          return;
        }
        if (msg.setupComplete) {
          clearTimeout(setupTimer);
          sess.done = true;
          touchIdle();
          if (needMic) {
            startMic(sess, opts.preStream).then(() => { liveSessions.add(sess); resolve(sess); }).catch(() => {
              sess.silentEnd = true;
              try { ws.close(); } catch (_) { /* ignore */ }
              reject(new Error('mic'));
            });
          } else { liveSessions.add(sess); resolve(sess); }
          return;
        }
        // Server function calls: run the local farm tool, answer back.
        if (msg.toolCall && msg.toolCall.functionCalls) {
          touchIdle();
          handleToolCalls(sess, ws, msg.toolCall.functionCalls);
          return;
        }
        const sc = msg.serverContent;
        if (!sc) return;
        if (sc.interrupted) {
          try { if (sess.player) sess.player.stop(); } catch (_) { /* ignore */ }
          sess.inBuf = '';
          sess.outBuf = '';
          sess.sources = [];
          touchIdle();
          return;
        }
        if (sc.inputTranscription && sc.inputTranscription.text) {
          sess.inBuf += sc.inputTranscription.text + ' ';
          touchIdle();
          try { handlers.onInputText && handlers.onInputText(sc.inputTranscription.text); } catch (_) { /* ignore */ }
          try { handlers.onPartial && handlers.onPartial({ q: sess.inBuf.trim(), a: sess.outBuf.trim() }); } catch (_) { /* ignore */ }
        }
        if (sc.outputTranscription && sc.outputTranscription.text) {
          sess.outBuf += sc.outputTranscription.text + ' ';
          touchIdle();
          try { handlers.onPartial && handlers.onPartial({ q: sess.inBuf.trim(), a: sess.outBuf.trim() }); } catch (_) { /* ignore */ }
        }
        const parts = sc.modelTurn && sc.modelTurn.parts;
        if (parts) {
          for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
              touchIdle();
              sess._lastChunk = Date.now();
              playChunk(sess, part.inlineData.data);
            } else if (typeof part.text === 'string' && part.text) {
              // TEXT modality replies arrive as text parts.
              sess.outBuf += part.text + ' ';
              touchIdle();
            }
          }
        }
        // Search grounding: collect web sources cited this turn (shown
        // under Agri's reply so results stay verifiable).
        const gm = sc.groundingMetadata || (sc.modelTurn && sc.modelTurn.groundingMetadata);
        const chunks = gm && gm.groundingChunks;
        if (chunks) {
          sess.sources = sess.sources || [];
          for (const c of chunks) {
            const web = c && c.web;
            if (web && web.uri && !sess.sources.some((s) => s.uri === web.uri)) {
              sess.sources.push({ title: web.title || web.uri, uri: web.uri });
            }
          }
        }
        if (sc.turnComplete) {
          const q = sess.inBuf.trim(), a = sess.outBuf.trim();
          const sources = (sess.sources || []).slice(0, 3);
          sess.inBuf = '';
          sess.outBuf = '';
          sess.sources = [];
          touchIdle();
          if (a && handlers.onAnswer) { try { handlers.onAnswer({ q, a, sources }); } catch (_) { /* ignore */ } }
          if (closeAfterTurn) scheduleDrainClose(sess);
        }
      };

      // Binary frames (Blob/ArrayBuffer): some networks/servers deliver audio
      // outside JSON. Try JSON text first, else play raw 16-bit PCM @ 24kHz.
      const handleBinary = (buf) => {
        try {
          const txt = new TextDecoder().decode(buf);
          if (/^\s*\{/.test(txt)) { handleJson(txt); return; }
        } catch (_) { /* not text: fall through to PCM */ }
        try {
          const dv = new DataView(buf);
          const n = Math.floor(buf.byteLength / 2);
          if (!n) return;
          const f = new Float32Array(n);
          for (let i = 0; i < n; i++) f[i] = dv.getInt16(i * 2, true) / 0x8000;
          touchIdle();
          sess._lastChunk = Date.now();
          playSamples(sess, f);
        } catch (_) { /* drop frame */ }
      };

      ws.onmessage = (ev) => {
        const d = ev.data;
        if (typeof d === 'string') { handleJson(d); return; }
        if (!d) return;
        const p = (typeof Blob !== 'undefined' && d instanceof Blob)
          ? d.arrayBuffer() : Promise.resolve(d);
        p.then(handleBinary).catch(() => { /* drop frame */ });
      };
    });
  }

  // Runs server-requested farm tools and answers with their results.
  function handleToolCalls(sess, ws, calls) {
    if (!alive(sess) || !calls || !calls.length) return;
    const answers = calls.map((c) => {
      const fn = liveTools[c.name];
      if (!fn) return Promise.resolve({ name: c.name, id: c.id, result: { error: 'unknown tool' } });
      let args = {};
      try { args = c.args || {}; } catch (_) { /* ignore */ }
      return Promise.resolve()
        .then(() => fn(args))
        .then((result) => ({ name: c.name, id: c.id, result: result || {} }))
        .catch(() => ({ name: c.name, id: c.id, result: { error: 'tool failed' } }));
    });
    Promise.all(answers).then((functionResponses) => {
      if (!alive(sess)) return;
      const clean = functionResponses.map((fr) => {
        const o = { name: fr.name, response: fr.result };
        if (fr.id != null) o.id = fr.id;
        return o;
      });
      try {
        ws.send(JSON.stringify({ toolResponse: { functionResponses: clean } }));
      } catch (_) { /* ignore */ }
    });
  }

  // Requests the microphone FIRST, before any network round-trips, so the
  // permission prompt appears the instant the farmer taps. Rejects on deny,
  // timeout, or missing API. The caller owns the returned stream: either
  // hand it to connect() via opts.preStream, or stop its tracks.
  function warmMic(timeoutMs) {
    return new Promise((resolve, reject) => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { reject(new Error('mic')); return; }
        let done = false;
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          reject(new Error('mic'));
        }, timeoutMs || 15000);
        navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        }).then((stream) => {
          if (done) { try { stream.getTracks().forEach((tr) => tr.stop()); } catch (_) { /* ignore */ } return; }
          done = true;
          clearTimeout(timer);
          resolve(stream);
        }).catch(() => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(new Error('mic'));
        });
      } catch (_) { reject(new Error('mic')); }
    });
  }

  // Live sessions, newest last — powers audioLevels().
  const liveSessions = new Set();

  function audioLevels() {
    const out = { mic: 0, out: 0 };
    try {
      const arr = Array.from(liveSessions);
      const s = arr.length ? arr[arr.length - 1] : null;
      if (!s || !alive(s)) return out;
      if (s.micAn) out.mic = levelOf(s.micAn);
      if (s.outAn) out.out = levelOf(s.outAn);
    } catch (_) { /* ignore */ }
    return out;
  }

  function levelOf(an) {
    try {
      const buf = new Uint8Array(an.fftSize);
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i += 2) {
        const v = Math.abs(buf[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      return Math.min(1, peak * 1.6);
    } catch (_) { return 0; }
  }

  function startMic(sess, preStream) {
    return new Promise((resolve, reject) => {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { reject(new Error('mic')); return; }
      const buildGraph = (stream) => {
        const actx = new AC({ sampleRate: IN_RATE });
        // Best effort: when a user gesture is in progress this starts the
        // context running at once; otherwise the app resumes it on the next
        // tap (see voice.js resumeAllMics) — a suspended context would
        // otherwise stream silence.
        try { if (actx.state === 'suspended') actx.resume(); } catch (_) { /* resumed later on gesture */ }
        const src = actx.createMediaStreamSource(stream);
        const proc = actx.createScriptProcessor(4096, 1, 1);
        const sink = actx.createGain();
        sink.gain.value = 0; // hear nothing locally; processor still runs
        try {
          const an = actx.createAnalyser();
          an.fftSize = 256;
          src.connect(an);
          sess.micAn = an;
        } catch (_) { /* levels unavailable; audio still streams */ }
          proc.onaudioprocess = (ev) => {
            if (!alive(sess)) return;
            try {
              const ch = ev.inputBuffer.getChannelData(0);
              const pcm = resample(ch, ev.inputBuffer.sampleRate, IN_RATE);
              sess.ws.send(JSON.stringify({
                realtimeInput: { audio: { data: f32ToB64(pcm), mimeType: 'audio/pcm;rate=' + IN_RATE } }
              }));
            } catch (_) { /* drop frame */ }
          };
          src.connect(proc);
          proc.connect(sink);
          sink.connect(actx.destination);
          sess.mic = { stream, ctx: actx, proc };
          resolve(true);
      };
      if (preStream) {
        // Mic already granted up-front (instant prompt on tap).
        try { buildGraph(preStream); }
        catch (_) { reject(new Error('mic')); }
        return;
      }
      let done = false;
      const timer = setTimeout(() => {
        // Permission prompt swiped away / device hung: never settle silently.
        if (done) return;
        done = true;
        reject(new Error('mic'));
      }, 20000);
      navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      }).then((stream) => {
        if (done) { try { stream.getTracks().forEach((tr) => tr.stop()); } catch (_) { /* ignore */ } return; }
        done = true;
        clearTimeout(timer);
        try { buildGraph(stream); }
        catch (_) { reject(new Error('mic')); }
      }).catch(() => { if (!done) { done = true; clearTimeout(timer); } reject(new Error('mic')); });
    });
  }

  // After a one-shot turn, hang up once the spoken reply has drained
  // (never cutting it off), with a hard cap so it always terminates.
  function scheduleDrainClose(sess) {
    const born = Date.now();
    const check = () => {
      if (sess.closed) return;
      const playing = !!(sess.player && sess.player.active);
      const quietFor = Date.now() - (sess._lastChunk || 0);
      if ((!playing && quietFor > 800) || (Date.now() - born > 30000)) {
        sess.close('turn-done');
        return;
      }
      setTimeout(check, 400);
    };
    setTimeout(check, 400);
  }
  // Phones keep the speaker locked until a tap unlocks it. Call this from
  // every tap that may lead to audio (mic button, test button) so later
  // playback is allowed to make sound.
  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = new AC();
      const run = () => { try { ctx.resume(); } catch (_) { /* ignore */ } };
      if (ctx.state === 'suspended') run();
      // Silent blip cements the unlock on strict phones.
      try {
        const o = ctx.createOscillator(), g = ctx.createGain();
        g.gain.value = 0.0001;
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.1);
      } catch (_) { /* ignore */ }
      setTimeout(() => { try { ctx.close(); } catch (_) { /* ignore */ } }, 1000);
      return true;
    } catch (_) { return false; }
  }

  function ensurePlayer(sess) {
    if (sess.player && sess.outCtx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      let outCtx = null;
      try { outCtx = new AC({ sampleRate: OUT_RATE }); }
      catch (_) { outCtx = new AC(); } // phone runs another rate: resample below
      const rate = outCtx.sampleRate || OUT_RATE;
      try { if (outCtx.state === 'suspended') outCtx.resume(); } catch (_) { /* ignore */ }
      try {
        const an = outCtx.createAnalyser();
        an.fftSize = 256;
        an.connect(outCtx.destination);
        sess.outAn = an;
      } catch (_) { /* levels unavailable; audio still plays */ }
      let next = 0;
      const live = new Set();
      sess.outCtx = outCtx;
      sess.player = {
        push(f32) {
          const data = (rate === OUT_RATE) ? f32 : resample(f32, OUT_RATE, rate);
          const buf = outCtx.createBuffer(1, data.length, rate);
          buf.getChannelData(0).set(data);
          const src = outCtx.createBufferSource();
          src.buffer = buf;
          try {
            if (sess.outAn) { src.connect(sess.outAn); }
            else src.connect(outCtx.destination);
          } catch (_) { try { src.connect(outCtx.destination); } catch (_) { /* ignore */ } }
          const t = Math.max(next, outCtx.currentTime + 0.03);
          try { src.start(t); } catch (_) { return; }
          next = t + buf.duration;
          live.add(src);
          src.onended = () => live.delete(src);
        },
        stop() {
          live.forEach((s) => { try { s.stop(); } catch (_) { /* ignore */ } });
          live.clear();
          next = 0;
        },
        get active() { return live.size > 0; }
      };
      return true;
    } catch (_) { return false; }
  }

  function playChunk(sess, b64) {
    try {
      playSamples(sess, b64ToF32(b64));
    } catch (_) { /* drop chunk */ }
  }

  function playSamples(sess, f32) {
    try {
      if (!ensurePlayer(sess)) return;
      try { sess._handlers && sess._handlers.onAudioStart && sess._handlers.onAudioStart(); } catch (_) { /* ignore */ }
      sess.player.push(f32);
    } catch (_) { /* drop chunk */ }
  }

  // ---------------- Dashboard AI Advice (Gemini REST) ----------------
  const adviceCache = { key: '', text: '', time: 0 };

  async function generateDashboardAdvice(snapshot, analysis, profile, lang) {
    lang = lang || (E.i18n && E.i18n.lang) || 'hi';
    profile = profile || {};
    snapshot = snapshot || {};
    const crop = E.getCrop ? E.getCrop(profile.cropId || 'bajra') : { name_en: 'Bajra', name_hi: 'बाजरा' };
    const cropName = lang === 'hi' ? (crop.name_hi || crop.name_en) : crop.name_en;
    const cacheKey = `${profile.cropId}_${profile.pincode}_${profile.stage}_${Math.round(snapshot.moisture || 0)}_${Math.round(snapshot.tempC || 0)}_${lang}`;

    // Return cache if under 10 minutes old
    const now = Date.now();
    if (adviceCache.key === cacheKey && (now - adviceCache.time) < 600000 && adviceCache.text) {
      return adviceCache.text;
    }

    function fallbackAdvice() {
      const issues = (analysis && analysis.issues) || [];
      const m = snapshot.moisture;
      if (issues.includes('water')) {
        if (m != null && m < 15) {
          return lang === 'hi'
            ? `${cropName} में मिट्टी बहुत सूखी है (नमी ${Math.round(m)}%)। आज ही खेत में हल्की सिंचाई करें।`
            : `Soil is very dry for ${cropName} (${Math.round(m)}% moisture). Irrigate your field today.`;
        }
        return lang === 'hi'
          ? `खेत में पानी की कमी हो रही है। शाम तक या कल सुबह पानी लगाने की तैयारी करें।`
          : `Moisture is dipping in your field. Plan to irrigate this evening or tomorrow morning.`;
      }
      if (issues.includes('heat')) {
        return lang === 'hi'
          ? `आज तापमान अधिक है। दोपहर के समय फसल पर नज़र रखें और नमी बनाए रखने के लिए शाम को हल्का पानी दें।`
          : `High temperatures today. Keep an eye on the crop and consider light evening watering.`;
      }
      if (issues.includes('soil')) {
        return lang === 'hi'
          ? `मिट्टी में पोषण की कमी है। फसल बढ़वार के लिए संतुलित यूरिया या डीएपी खाद डालें।`
          : `Nutrient levels are low. Apply balanced Urea or DAP to support healthy growth.`;
      }
      return lang === 'hi'
        ? `${profile.pincode ? profile.pincode + ' पिन कोड वाले ' : ''}${cropName} की स्थिति बहुत अच्छी है। नमी पर्याप्त है, आज कोई काम करने की जरूरत नहीं।`
        : `Your ${cropName} field ${profile.pincode ? 'in ' + profile.pincode : ''} is looking great. Moisture is optimal; no action needed today.`;
    }

    if (!configured() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      const text = fallbackAdvice();
      adviceCache.key = cacheKey;
      adviceCache.text = text;
      adviceCache.time = now;
      return text;
    }

    try {
      const prompt = `You are Agri, an agricultural expert for Indian smallholder farmers.
Crop: ${cropName} (${profile.stage || 'vegetative'} stage) in India (Pincode: ${profile.pincode || 'unknown'}).
Sensor readings: Soil Moisture: ${snapshot.moisture != null ? Math.round(snapshot.moisture) + '%' : 'unknown'}, Air Temp: ${snapshot.tempC != null ? Math.round(snapshot.tempC) + '°C' : 'unknown'}, Sunlight: ${snapshot.lux != null ? Math.round(snapshot.lux) + ' lux' : 'unknown'}.
Field status: Water=${analysis ? analysis.water.level : 'unknown'}, Heat=${analysis ? analysis.heat.level : 'unknown'}, Soil=${analysis ? analysis.soilLevel : 'unknown'}.
Task: Give a very practical, 1-to-2 sentence action advice for TODAY in ${replyLang(lang)}.
Rules:
- Be warm, direct, and actionable. State plainly what the farmer should do today (e.g. irrigate today or wait, fertilizer dose, heat check).
- DO NOT refer to any external "agri-adviser" or "consult an expert". You ARE the advisor.
- Keep it under 35 words.`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${encodeURIComponent(E.geminiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 120, temperature: 0.3 }
        })
      });

      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const candidate = data.candidates && data.candidates[0];
      const text = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;
      if (text && text.trim()) {
        const clean = text.trim().replace(/^["']|["']$/g, '');
        adviceCache.key = cacheKey;
        adviceCache.text = clean;
        adviceCache.time = now;
        return clean;
      }
      throw new Error('Empty response');
    } catch (err) {
      console.warn('[EnviroOS] Dashboard advice fallback:', err);
      const text = fallbackAdvice();
      adviceCache.key = cacheKey;
      adviceCache.text = text;
      adviceCache.time = now;
      return text;
    }
  }

  // Community: Agri drafts a reply to a farmer's post (text only, one shot).
  // Returns null when offline/unconfigured so the UI can use the local engine.
  async function generateCommunityAnswer(post, lang) {
    lang = lang || (E.i18n && E.i18n.lang) || 'hi';
    if (!post || !configured() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
    const crop = post.crop_id && E.getCrop ? E.getCrop(post.crop_id) : null;
    const r = post.readings || null;
    const langName = ((E.i18n && E.i18n.LANGS) || []).find((l) => l.id === lang);
    const readingsLine = r
      ? `Farmer's live sensor readings: moisture ${r.moisture != null ? Math.round(r.moisture) + '%' : 'n/a'}, temp ${r.tempC != null ? Math.round(r.tempC) + '°C' : 'n/a'}, N ${r.n ?? 'n/a'}, P ${r.p ?? 'n/a'}, K ${r.k ?? 'n/a'} mg/kg, pH ${r.ph ?? 'n/a'}, stage ${r.stage || 'n/a'}.`
      : 'No sensor readings attached.';
    const prompt = `You are Agri, a farming assistant replying inside a farmers' community forum in India.
Topic: ${post.topic}. Crop: ${crop ? crop.name_en : 'not stated'}. Region pincode prefix: ${post.region || 'unknown'}.
Question title: ${String(post.title || '').slice(0, 200)}
Details: ${String(post.body || '').slice(0, 1200)}
${readingsLine}
Write a reply in ${langName ? langName.label : 'Hindi'} using very simple words a farmer with limited reading can follow.
Rules:
- 2 to 4 short practical steps, under 80 words total.
- Never invent mandi prices, yields or scheme amounts; tell them to check eNAM or the local mandi for today's rate.
- For pesticides or fungicides, name the type only and say to follow the label dose or ask the local KVK before spraying.
- If a photo is needed to be sure, say so. No markdown, no headings.`;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${encodeURIComponent(E.geminiKey)}`;
      const ctl = new AbortController();
      const to = setTimeout(() => { try { ctl.abort(); } catch (_) { /* ignore */ } }, 15000);
      const res = await fetch(url, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 260, temperature: 0.3 } })
      }).finally(() => clearTimeout(to));
      if (!res.ok) return null;
      const data = await res.json();
      const c = data.candidates && data.candidates[0];
      const text = c && c.content && c.content.parts && c.content.parts.map((p) => p.text || '').join('').trim();
      return text ? text.replace(/[*#]+/g, '').trim() : null;
    } catch (_) {
      return null;
    }
  }

  // Agri: Generates quick conversational answer grounded in live farm context
  async function generateAgriAnswer(query, history, snapshot, analysis, profile, lang, imageBase64, options = {}) {
    lang = lang || (E.i18n && E.i18n.lang) || 'hi';
    if ((!query && !imageBase64) || options.signal?.aborted) return null;
    if (!configured() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
    const crop = profile && profile.cropId && E.getCrop ? E.getCrop(profile.cropId) : null;
    const cropName = crop ? (lang === 'hi' ? crop.name_hi : crop.name_en) : 'Crop';
    const s = snapshot || {};
    const a = analysis || {};
    const recent = (history || []).slice(-4).map((m) => `${m.who === 'user' ? 'Farmer' : 'Agri'}: ${m.text}`).join('\n');
    const prompt = `You are Agri, an agricultural expert assistant for smallholder farmers in India.
Current farm profile:
- Crop: ${cropName} (${profile && profile.stage ? profile.stage : 'vegetative'} stage)
- Soil moisture: ${s.moisture != null ? Math.round(s.moisture) + '%' : 'unknown'} (Status: ${a.water ? a.water.level : 'unknown'})
- Air temperature: ${s.tempC != null ? Math.round(s.tempC) + '°C' : 'unknown'}
- Sunlight: ${s.lux != null ? Math.round(s.lux) + ' lux' : 'unknown'}
- Nutrients: N=${s.n ?? 'unknown'}, P=${s.p ?? 'unknown'}, K=${s.k ?? 'unknown'}, pH=${s.ph ?? 'unknown'}
${recent ? 'Recent conversation:\n' + recent + '\n' : ''}
${imageBase64 ? '[Farmer has attached a crop/leaf photo to inspect]' : ''}
Farmer question: "${query || (lang === 'hi' ? 'कृपया इस पौधे / पत्ते की जांच करें और समस्या बताएं' : 'Please inspect this plant/leaf and advise')}"
Task: Give a very practical, direct reply in ${replyLang(lang)} unless the farmer explicitly requests a different language.
Rules:
- 2 to 3 short sentences, under 60 words total.
- Clear and actionable advice suitable for a farmer.
- Ground your answer in available live sensor readings. If a reading or equipment status is unknown, say it is unavailable. Never invent sensor readings or claim to have operated physical equipment.
${options.readOnly ? '- Answer questions only. No hardware operation is authorized by this request.' : ''}
- If an image is provided, identify probable disease, pest or nutrient deficiency (e.g. blight, sucking pests, nitrogen deficiency) and recommend immediate remedy (e.g. Neem oil 5ml/L, Trichoderma, Mancozeb/fungicide).
- For pests/diseases, mention safe remedies like Neem oil (5ml/L) and checking drainage or label doses.
- Do NOT use markdown symbols, bold asterisks, bullet points or headings. Plain text only.`;

    try {
      const parts = [{ text: prompt }];
      if (imageBase64) {
        // Strip data:image/...;base64, prefix if present
        const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
        const mimeType = (imageBase64.match(/^data:(image\/[a-z]+);base64,/) || [])[1] || 'image/jpeg';
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64
          }
        });
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${encodeURIComponent(E.geminiKey)}`;
      const ctl = new AbortController();
      const abort = () => ctl.abort();
      options.signal?.addEventListener('abort', abort, {once:true});
      const to = setTimeout(() => { try { ctl.abort(); } catch (_) { /* ignore */ } }, 12000);
      const res = await fetch(url, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { maxOutputTokens: 240, temperature: 0.3 }
        })
      }).finally(() => { clearTimeout(to); options.signal?.removeEventListener('abort', abort); });
      if (!res.ok) return null;
      const data = await res.json();
      const c = data.candidates && data.candidates[0];
      const text = c && c.content && c.content.parts && c.content.parts.map((p) => p.text || '').join('').trim();
      return text ? text.replace(/[*#]+/g, '').trim() : null;
    } catch (_) {
      return null;
    }
  }

  E.gemini = { configured, connect, alive, buildContext, warmMic, unlockAudio, sendVideo, registerTool, audioLevels, generateDashboardAdvice, generateCommunityAnswer, generateAgriAnswer };
})();
