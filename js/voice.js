import {createHandsFree, matchWake} from './hands-free.js';
/* EnviroOS — VOICE layer (Gemini Live is the single voice engine).
 *
 * There is NO phone speech-recognition loop and NO phone text-to-speech here
 * anymore — that old logic made the mic connect/disconnect in seconds.
 * Instead:
 *   - Tap the mic -> ONE Live call opens, mic streams to Gemini, Gemini's
 *     voice answers through the speaker. Tap again (or 90s idle) hangs up.
 *     The mic is open exactly once per call: steady on, steady off.
 *   - Dictation + screen summaries + spoken alerts each use a short Live
 *     session (transcription or Gemini TTS), then close.
 *   - Offline: answers still appear as silent text cards via the built-in
 *     intent engine. Voice needs internet — stated honestly in the UI.
 */

'use strict';

window.EnviroOS = window.EnviroOS || {};

(function () {
  const E = EnviroOS;
  const t = (k) => E.i18n.t(k);

  const ASSISTANT_NAME = 'Agri';

  const store = {
    get enabled() { try { return localStorage.getItem('enviroos.voice') === '1'; } catch (_) { return false; } },
    set enabled(v) { try { localStorage.setItem('enviroos.voice', v ? '1' : '0'); } catch (_) { /* ignore */ } }
  };

  // App-registered live bindings (set by UI layer).
  const bindings = {
    getState: () => null,          // -> { snapshot, analysis, profile }
    getOutlook: async () => null   // -> liveWeather outlook
  };

  // ---------------- state + error events ----------------
  let lastVoiceState = '';
  function emitState(state) {
    if (state === lastVoiceState) return;
    lastVoiceState = state;
    document.dispatchEvent(new CustomEvent('voice-state', { detail: { state } }));
  }

  function emitError(kind) {
    try { document.dispatchEvent(new CustomEvent('voice-error', { detail: { kind } })); }
    catch (_) { /* ignore */ }
  }

  function localCard(text) {
    document.dispatchEvent(new CustomEvent('voice-answer', { detail: { q: ASSISTANT_NAME, a: text, source: 'local' } }));
  }

  // ---------------- capability ----------------
  function audioCaps() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const mic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      return { ctx: !!AC, mic };
    } catch (_) { return { ctx: false, mic: false }; }
  }

  function onlineNow() {
    try { return typeof navigator === 'undefined' || navigator.onLine !== false; }
    catch (_) { return true; }
  }

  // True if the mic may be used. A denied permission is caught here — before
  // listening starts — instead of dying mid-call.
  function micAllowed() {
    try {
      if (navigator && navigator.permissions && navigator.permissions.query) {
        return navigator.permissions.query({ name: 'microphone' }).then(
          (st) => !st || st.state !== 'denied',
          () => true
        );
      }
    } catch (_) { /* fall through */ }
    return Promise.resolve(true);
  }

  function geminiReady() {
    try {
      const caps = audioCaps();
      return !!(E.gemini && E.gemini.configured() && caps.ctx && onlineNow());
    } catch (_) { return false; }
  }

  async function liveContext() {
    const st = bindings.getState ? bindings.getState() : null;
    let outlook = null;
    try {
      if (bindings.getOutlook) {
        outlook = await Promise.race([
          bindings.getOutlook(),
          new Promise((res) => setTimeout(() => res(null), 3000))
        ]);
      }
    } catch (_) { outlook = null; }
    return {
      snapshot: st && st.snapshot, analysis: st && st.analysis,
      profile: st && st.profile, outlook, lang: E.i18n.lang
    };
  }

  // ---------------- tap-to-talk call ----------------
  // Mic opens once, stays open for the whole call, closes on hangup.
  // No loop, no recycling, no flicker.
  let callSession = null;
  let inCommand = false; // a call is opening / active
  let busySince = 0;

  // Links from the last web_search, attached as Sources under Agri's reply.
  let pendingSearchSources = [];

  // ---------- Agri call state (drives the Agri AI tab) ----------
  // idle -> connecting -> listening <-> thinking <-> speaking -> idle
  let callStatus = 'idle';
  let conversation = []; // [{who:'user'|'agri', text}] of the current call
  let callStartAt = 0;
  let silenceTimer = null;
  let pendingChip = null;

  function setCallStatus(s, force) {
    const changed = callStatus !== s;
    callStatus = s;
    emitState(s === 'idle' ? 'idle' : 'live');
    if (changed || force) {
      try { document.dispatchEvent(new CustomEvent('agri-call', { detail: callInfo() })); }
      catch (_) { /* ignore */ }
    }
  }

  function callInfo() {
    const live = !!(callSession && E.gemini && E.gemini.alive(callSession));
    return {
      active: live || inCommand,
      status: live ? callStatus : inCommand ? 'connecting' : 'idle',
      wakeCapturing: false,
      wakeThinking: false,
      conversation: conversation.slice(-30),
      camera: camOn,
      secs: callStartAt ? Math.max(0, Math.floor((Date.now() - callStartAt) / 1000)) : 0
    };
  }

  function armSilenceTimer() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      // User went quiet and no reply audio yet: Agri is thinking.
      if (callStatus === 'listening') setCallStatus('thinking');
    }, 1600);
  }

  function resetCall() {
    clearTimeout(silenceTimer);
    callSession = null;
    inCommand = false;
    busySince = 0;
    callStartAt = 0;
    setCallStatus('idle');
    resumeWake();
  }

  function beep(kind) {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      const ctx = new C();
      const now = ctx.currentTime;
      if (kind === 'ack') {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.connect(g); g.connect(ctx.destination);
        o.frequency.setValueAtTime(740, now);
        o.frequency.exponentialRampToValueAtTime(587.33, now + 0.16);
        g.gain.setValueAtTime(0.05, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        o.start(now);
        o.stop(now + 0.19);
      } else {
        // Two-tone rising wake chime (D5 -> A5)
        const o1 = ctx.createOscillator(), g1 = ctx.createGain();
        o1.type = 'sine';
        o1.connect(g1); g1.connect(ctx.destination);
        o1.frequency.setValueAtTime(587.33, now);
        o1.frequency.setValueAtTime(880, now + 0.11);
        g1.gain.setValueAtTime(0.07, now);
        g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);
        o1.start(now);
        o1.stop(now + 0.31);
      }
      setTimeout(() => { try { ctx.close(); } catch (_) { /* ignore */ } }, 500);
    } catch (_) { /* silent */ }
  }

  async function askOnce() {
    stopSpeak();
    if (callSession && E.gemini && E.gemini.alive(callSession)) {
      try { callSession.close('hangup'); } catch (_) { /* ignore */ }
      return; // onEnd finishes the rest
    }
    if (inCommand) {
      // Safety: no tap may die silent. Every path below frees this within
      // ~35s, but a stuck one is force-cleared here so the button revives.
      if (Date.now() - busySince > 40000) {
        try { callSession && callSession.close('stuck'); } catch (_) { /* ignore */ }
        callSession = null;
        inCommand = false;
      } else return;
    }
    store.enabled = true;
    // When browser SpeechRecognition is available and camera is not streaming,
    // use the unified hands-free voice question listener so spoken questions
    // transcribe live on screen, answer in chat + voice, and re-arm standby.
    if (browserSttSupported() && !camOn) {
      startManualVoiceQuestion();
      return;
    }
    const caps = audioCaps();
    if (!caps.ctx || !caps.mic) { localCard(t('voice_unsupported')); return; }
    if (!onlineNow() || !(E.gemini && E.gemini.configured())) {
      if (browserSttSupported()) { startManualVoiceQuestion(); return; }
      localCard(t('v_need_net'));
      return;
    }
    if (!(await micAllowed())) { localCard(t('v_err_mic')); return; }
    inCommand = true;
    busySince = Date.now();
    try { pauseWake(); } catch (_) { /* Live call owns the mic now */ }
    conversation = [];
    pendingChip = null;
    beep('wake');
    setCallStatus('connecting');
    let preStream = null;
    try {
      if (!await handsFree.waitForRelease()) throw Error('mic');
      preStream = await E.gemini.warmMic(15000);
    } catch (_) {
      localCard(t('v_err_mic'));
      resetCall();
      return;
    }
    try {
      const ctx = await liveContext();
      callSession = await E.gemini.connect(ctx, {
        onAnswer: (m) => {
          // Server grounding chunks + our own web_search links, deduplicated.
          const seen = new Set();
          const sources = [].concat(m.sources || [], pendingSearchSources).filter((s) => {
            if (!s || !s.uri || seen.has(s.uri)) return false;
            seen.add(s.uri);
            return true;
          }).slice(0, 3);
          pendingSearchSources = [];
          if (m.q) conversation.push({ who: 'user', text: m.q });
          conversation.push({ who: 'agri', text: m.a, sources });
          setCallStatus('listening');
          document.dispatchEvent(new CustomEvent('voice-answer', { detail: { q: m.q, a: m.a, source: 'live', sources } }));
        },
        onInputText: () => {
          // Farmer is speaking now.
          if (callStatus !== 'speaking') setCallStatus('listening');
          armSilenceTimer();
        },
        onAudioStart: () => {
          // First sound of the reply: Agri is speaking.
          clearTimeout(silenceTimer);
          if (callStatus !== 'idle') setCallStatus('speaking');
        },
        onPartial: (p) => {
          // Streaming caption fuel for the Agri tab (no re-render storm;
          // the UI paints just the caption node).
          try { document.dispatchEvent(new CustomEvent('agri-caption', { detail: { q: p.q || '', a: p.a || '' } })); }
          catch (_) { /* ignore */ }
        },
        onEnd: () => { resetCall(); }
      }, { needMic: true, preStream });
      callStartAt = Date.now();
      setCallStatus('listening');
      if (pendingChip) {
        const c = pendingChip;
        pendingChip = null;
        conversation.push({ who: 'user', text: c });
        document.dispatchEvent(new CustomEvent('agri-call', { detail: callInfo() }));
        try { callSession.sendText(c); } catch (_) { /* ignore */ }
      }
    } catch (err) {
      try { if (preStream) preStream.getTracks().forEach((tr) => tr.stop()); } catch (_) { /* ignore */ }
      if (browserSttSupported()) {
        inCommand = false;
        busySince = 0;
        startManualVoiceQuestion();
        return;
      }
      const em = (err && err.message) || '';
      let msg;
      if (em === 'mic') msg = t('v_err_mic');
      else if (!onlineNow()) msg = t('v_need_net');
      else if (em.indexOf('server:') === 0) msg = t('v_srv_err').replace('{m}', em.slice(7));
      else msg = t('v_srv_err').replace('{m}', t('v_slow_net'));
      localCard(msg);
      resetCall();
    }
  }

  // ---------------- TTS: spoken answers, summaries, alerts ----------------
  let speechSession = null;
  let speechPendingResolve = null;
  let cachedVoices = [];

  function refreshVoices() {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const v = window.speechSynthesis.getVoices();
        if (v && v.length) cachedVoices = v;
      }
    } catch (_) {}
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    refreshVoices();
    try { window.speechSynthesis.onvoiceschanged = refreshVoices; } catch (_) {}
  }

  function cleanSpeechText(raw) {
    if (!raw) return '';
    let s = String(raw);
    // Strip markdown links [text](url) -> text
    s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    // Strip bare URLs
    s = s.replace(/https?:\/\/\S+/gi, '');
    // Strip code blocks and inline code
    s = s.replace(/```[\s\S]*?```/g, '');
    s = s.replace(/`([^`]+)`/g, '$1');
    // Strip markdown formatting bold/italics
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
    s = s.replace(/\*([^*]+)\*/g, '$1');
    s = s.replace(/__([^_]+)__/g, '$1');
    s = s.replace(/_([^_]+)_/g, '$1');
    // Strip markdown headers
    s = s.replace(/^#+\s+/gm, '');
    // Strip blockquotes >
    s = s.replace(/^>\s+/gm, '');
    // Replace bullet points with pause/comma
    s = s.replace(/^[\s*•-]+\s*/gm, ', ');
    // Natural word replacements for units & symbols (English only — other
    // languages' voices already read "%" and "°C" correctly in their own words)
    const enSpeech = !E.i18n || E.i18n.lang === 'en';
    if (enSpeech) {
      s = s.replace(/(\d+(?:\.\d+)?)\s*°C\b/gi, '$1 degrees Celsius');
      s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, '$1 percent');
      s = s.replace(/₹\s*(\d+(?:,\d+)*(?:\.\d+)?)/g, '$1 Rupees');
      s = s.replace(/\bkg\/ac\b/gi, 'kilograms per acre');
      s = s.replace(/\bkg\/ha\b/gi, 'kilograms per hectare');
      s = s.replace(/\bmL\b/g, 'milliliters');
      s = s.replace(/\bhPa\b/gi, 'hectopascals');
    }
    s = s.replace(/\bvpd\b/gi, 'VPD');
    // Remove emojis
    s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
    // Collapse extra whitespace
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  // ---- Voice picking (simple + cached) ----
  // One clear rule per language: prefer a natural/neural voice, prefer a male
  // voice for English (American accent). The choice is cached per language so
  // every reply sounds identical and starts instantly.
  const MALE_RE = /(guy|christopher|eric|steffan|andrew|brian|roger|davis|tony|jason|alex|tom|david|mark|aaron|fred|male)/i;
  const FEMALE_RE = /(jenny|aria|ava|emma|michelle|ana|samantha|victoria|zira|susan|karen|catherine|linda|hazel|heera|female)/i;
  const NATURAL_RE = /(natural|neural|online|enhanced|premium)/i;
  const voiceCache = {};

  function pickVoice(targetLang) {
    if (voiceCache[targetLang]) return voiceCache[targetLang];
    refreshVoices();
    const voices = cachedVoices.length ? cachedVoices : [];
    if (!voices.length) return null;
    const want = targetLang.toLowerCase();
    const prefix = want.split('-')[0];
    const norm = (v) => (v.lang || '').replace('_', '-').toLowerCase();
    let pool = voices.filter((v) => norm(v) === want);
    if (!pool.length) pool = voices.filter((v) => norm(v).startsWith(prefix));
    if (!pool.length) return null;
    const isEn = prefix === 'en';
    const score = (v) => {
      const n = v.name || '';
      let s = 0;
      if (NATURAL_RE.test(n)) s += 50;
      if (isEn && MALE_RE.test(n)) s += 30;
      if (isEn && FEMALE_RE.test(n)) s -= 30;
      if (/compact|espeak|legacy/i.test(n)) s -= 40;
      return s;
    };
    pool.sort((a, b) => score(b) - score(a));
    voiceCache[targetLang] = pool[0];
    return pool[0];
  }
  // Voices load async in some browsers -> drop the cache when the list changes.
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.addEventListener) {
      window.speechSynthesis.addEventListener('voiceschanged', () => { Object.keys(voiceCache).forEach((k) => delete voiceCache[k]); });
    }
  } catch (_) { /* ignore */ }

  const LANG_MAP = {
    hi: 'hi-IN', mr: 'mr-IN', gu: 'gu-IN', pa: 'pa-IN', te: 'te-IN', ta: 'ta-IN', kn: 'kn-IN', bn: 'bn-IN',
    en: 'en-US', es: 'es-ES', fr: 'fr-FR', pt: 'pt-BR', it: 'it-IT', zh: 'zh-CN', de: 'de-DE'
  };

  // Split into short sentence chunks. Short utterances play smoothly and avoid
  // the Chrome bug that silently cuts speech after ~15 seconds.
  function chunkText(text, max) {
    max = max || 180;
    const parts = String(text).match(/[^.!?।\n]+[.!?।]*\s*/g) || [String(text)];
    const out = [];
    let cur = '';
    parts.forEach((p) => {
      if ((cur + p).length <= max) { cur += p; return; }
      if (cur.trim()) out.push(cur.trim());
      if (p.length <= max) { cur = p; return; }
      // Very long sentence: break on commas / spaces.
      let rest = p;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(',', max);
        if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
        if (cut < 1) cut = max;
        out.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1);
      }
      cur = rest;
    });
    if (cur.trim()) out.push(cur.trim());
    return out.filter(Boolean);
  }

  function speakWithWebSpeech(text, quiet = false) {
    return new Promise((resolve) => {
      const synth = (typeof window !== 'undefined' && window.speechSynthesis) || null;
      if (!synth) { emitError('tts-failed'); resolve(false); return; }
      const clean = cleanSpeechText(text);
      if (!clean) { resolve(true); return; }

      try { pauseWake(); } catch (_) { /* wake ear stays quiet while speaking */ }
      try { synth.cancel(); } catch (_) { /* ignore */ }

      const curLang = (E.i18n && E.i18n.lang) || 'hi';
      const targetLang = LANG_MAP[curLang] || 'en-US';
      const voice = pickVoice(targetLang);
      const natural = !!(voice && NATURAL_RE.test(voice.name || ''));
      const chunks = chunkText(clean);

      let idx = 0;
      let done = false;
      let keepAlive = null;
      let chunkTimer = null;

      const end = (ok) => {
        if (done) return;
        done = true;
        clearInterval(keepAlive);
        clearTimeout(chunkTimer);
        speechPendingResolve = null;
        if (!quiet) emitState('idle');
        setTimeout(() => {
          try { if (wakeOn() && !inCommand) resumeWake(); } catch (_) { /* ignore */ }
        }, 300);
        resolve(ok);
      };

      const next = () => {
        if (done) return;
        if (idx >= chunks.length) { end(true); return; }
        const part = chunks[idx++];
        const utt = new SpeechSynthesisUtterance(part);
        utt.lang = voice ? voice.lang : targetLang;
        if (voice) utt.voice = voice;
        // Natural/neural voices sound best untouched; only deepen basic voices a little.
        utt.pitch = natural ? 1.0 : 0.92;
        utt.rate = natural ? 1.0 : 0.96;
        utt.volume = 1.0;
        clearTimeout(chunkTimer);
        // Per-chunk safety net only (never cuts a normal sentence short).
        chunkTimer = setTimeout(() => {
          end(false);
          synth.cancel();
        }, Math.max(8000, part.length * 140));
        utt.onend = () => { clearTimeout(chunkTimer); next(); };
        utt.onerror = (e) => {
          clearTimeout(chunkTimer);
          if (e && (e.error === 'interrupted' || e.error === 'canceled')) { end(true); return; }
          end(false);
        };
        try { synth.speak(utt); } catch (_) { end(false); }
      };

      speechPendingResolve = () => end(true);
      if (!quiet) emitState('speaking');
      // Chrome pauses long queues in background tabs; a gentle resume keeps it flowing.
      keepAlive = setInterval(() => { try { if (synth.paused) synth.resume(); } catch (_) { /* ignore */ } }, 5000);
      // Tiny delay after cancel() avoids the first word being clipped in Chrome/Edge.
      setTimeout(next, 60);
    });
  }

  function speak(text) {
    if (!text) return Promise.resolve(false);
    stopSpeak();
    // Prefer instant Web Speech synthesis with the high-quality American voice
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      return speakWithWebSpeech(text);
    }
    if (!geminiReady()) {
      emitError('tts-failed');
      return Promise.resolve(false);
    }
    return new Promise(async (resolve) => {
      let done = false;
      let sess = null;
      try { pauseWake(); } catch (_) { /* ignore */ }
      const finish = (ok) => {
        if (done) return;
        done = true;
        if (speechSession === sess) speechSession = null;
        speechPendingResolve = null;
        emitState('idle');
        setTimeout(() => {
          try { if (wakeOn() && !inCommand) resumeWake(); } catch (_) { /* ignore */ }
        }, 350);
        resolve(ok);
      };
      speechPendingResolve = () => finish(true);
      try {
        const ctx = await liveContext();
        sess = await E.gemini.connect(ctx, {
          onAnswer: () => { /* audio is the answer; transcript not needed */ },
          onEnd: () => { finish(true); }
        }, { needMic: false, modality: 'AUDIO', closeAfterTurn: true });
        speechSession = sess;
        emitState('speaking');
        const clean = cleanSpeechText(text);
        sess.sendText('Speak this in a natural, friendly American accent, saying exactly this and adding nothing: "' + clean + '"');
      } catch (_) {
        emitError('tts-failed');
        finish(false);
      }
    });
  }

  function stopSpeak() {
    try {
      if (speechPendingResolve) {
        const cb = speechPendingResolve;
        speechPendingResolve = null;
        cb();
      }
    } catch (_) {}
    try { if (speechSession) speechSession.close('stop'); } catch (_) { /* ignore */ }
    speechSession = null;
    try { if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) { /* ignore */ }
    try { emitState('idle'); } catch (_) { /* ignore */ }
  }

  // ---------------- Gemini STT: dictation into form fields ----------------
  // One tap = one short transcription session, then it closes by itself.
  let dictSession = null;
  let dictStarting = false;

  async function dictate(inputEl) {
    if (!inputEl || dictStarting || dictSession || inCommand) return false;
    const caps = audioCaps();
    if (!caps.ctx || !caps.mic) { emitError('stt-failed'); return false; }
    if (!onlineNow() || !(E.gemini && E.gemini.configured())) { emitError('stt-failed'); return false; }
    if (!(await micAllowed())) { emitError('mic-blocked'); return false; }
    dictStarting = true;
    stopSpeak();
    handsFree.suspend();
    if (!await handsFree.waitForRelease()) {
      dictStarting = false;
      emitError('mic-blocked');
      resumeWake();
      return false;
    }
    emitState('dictating');
    const safety = setTimeout(() => { try { dictSession && dictSession.close('timeout'); } catch (_) { /* ignore */ } }, 25000);
    // Mic first: prompt appears instantly on tap.
    let preStream = null;
    try {
      preStream = await E.gemini.warmMic(15000);
    } catch (_) {
      clearTimeout(safety);
      dictStarting = false;
      resumeWake();
      emitError('mic-blocked');
      emitState('idle');
      return true;
    }
    try {
      const ctx = await liveContext();
      const sess = await E.gemini.connect(ctx, {
        onAnswer: ({ q }) => {
          if (q) {
            inputEl.value = ((inputEl.value ? inputEl.value + ' ' : '') + q).slice(0, inputEl.maxLength > 0 ? inputEl.maxLength : 120);
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
        },
        onEnd: () => { clearTimeout(safety); if (dictSession === sess) dictSession = null; emitState('idle'); resumeWake(); }
      }, { needMic: true, preStream, modality: 'TEXT', closeAfterTurn: true });
      dictSession = sess;
      dictStarting = false;
      return true;
    } catch (err) {
      try { preStream && preStream.getTracks().forEach((tr) => tr.stop()); } catch (_) { /* ignore */ }
      clearTimeout(safety);
      dictStarting = false;
      resumeWake();
      emitError(err && err.message === 'mic' ? 'mic-blocked' : 'stt-failed');
      emitState('idle');
      return true;
    }
  }

  // ---------------- crop camera (show Agri the field) ----------------
  // One persistent preview element (survives screen re-renders: the UI
  // re-parents it into the Agri tab slot). Frames stream only while a Live
  // call is open, ~1 frame / 2s to spare mobile data; paused when hidden.
  let camStream = null;
  let camTimer = null;
  let camOn = false;
  let camVideoEl = null;
  let camCanvas = null;

  function cameraVideo() {
    if (!camVideoEl) {
      camVideoEl = document.createElement('video');
      camVideoEl.className = 'agri-cam';
      camVideoEl.setAttribute('playsinline', '');
      camVideoEl.muted = true;
    }
    return camVideoEl;
  }

  function stopCameraTracks() {
    try { camStream && camStream.getTracks().forEach((tr) => tr.stop()); } catch (_) { /* ignore */ }
    camStream = null;
    try { if (camVideoEl) camVideoEl.srcObject = null; } catch (_) { /* ignore */ }
  }

  function pumpFrame() {
    if (!camOn) return;
    try {
      const sess = callSession;
      if (!(sess && E.gemini && E.gemini.alive(sess))) return; // preview only, no call
      if (typeof document !== 'undefined' && document.hidden) return;
      const v = camVideoEl;
      if (!v || !v.videoWidth || v.readyState < 2) return; // not actually playing: skip black frames
      if (camStream && camStream.getTracks().some((tr) => tr.readyState === 'ended') && !camStream.getTracks().some((tr) => tr.readyState === 'live')) {
        cameraDied();
        return;
      }
      if (!camCanvas) camCanvas = document.createElement('canvas');
      const scale = Math.min(1, 640 / v.videoWidth);
      camCanvas.width = Math.round(v.videoWidth * scale);
      camCanvas.height = Math.round(v.videoHeight * scale);
      const cx = camCanvas.getContext('2d');
      if (!cx) return;
      cx.drawImage(v, 0, 0, camCanvas.width, camCanvas.height);
      const url = camCanvas.toDataURL('image/jpeg', 0.6);
      const b64 = url.indexOf(',') >= 0 ? url.slice(url.indexOf(',') + 1) : '';
      if (b64) E.gemini.sendVideo(sess, b64);
    } catch (_) { /* drop frame */ }
  }

  // Camera died underneath us (OS took it, permission revoked, device
  // sleep): switch off cleanly so the button never lies about state.
  function cameraDied() {
    if (!camOn) return;
    try { clearInterval(camTimer); } catch (_) { /* ignore */ }
    camTimer = null;
    stopCameraTracks();
    camOn = false;
    emitAgri();
  }

  async function setCamera(on) {
    if (on === camOn) return camOn;
    if (!on) {
      try { clearInterval(camTimer); } catch (_) { /* ignore */ }
      camTimer = null;
      stopCameraTracks();
      camOn = false;
      emitAgri();
      return false;
    }
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { emitError('cam-blocked'); return false; }
      // Preferred constraints first; some devices reject 'ideal' objects,
      // so fall back to a bare request rather than failing the camera.
      let stream = null;
      try {
        // Big preview: ask for HD with a wide 16:9 frame so the farmer sees
        // more of the crop at once. Falls back gracefully on low-end phones.
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 }
          },
          audio: false
        });
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      stopCameraTracks();
      camStream = stream;
      try {
        stream.getTracks().forEach((tr) => {
          try { tr.onended = () => cameraDied(); } catch (_) { /* ignore */ }
        });
      } catch (_) { /* ignore */ }
      const v = cameraVideo();
      try { v.srcObject = stream; } catch (_) { /* ignore */ }
      try { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (_) { /* ignore */ }
      camOn = true;
      try { clearInterval(camTimer); } catch (_) { /* ignore */ }
      camTimer = setInterval(pumpFrame, 2000);
      emitAgri();
      return true;
    } catch (_) {
      stopCameraTracks();
      emitError('cam-blocked');
      return false;
    }
  }

  function toggleCamera() {
    return setCamera(!camOn);
  }

  function emitAgri() {
    try { document.dispatchEvent(new CustomEvent('agri-call', { detail: callInfo() })); }
    catch (_) { /* ignore */ }
  }

  // ---------------- offline intent engine (silent text answers + hardware control) ----------------
  function intentOf(text) {
    const s = String(text || '').toLowerCase();
    const has = (...ws) => ws.some((w) => s.includes(w));
    // Rover & Dosing hardware commands
    const roverW = /(\brover\b|\brobot\b|\bpatrol\b|रोवर|रोबोट|गश्त)/i;
    if (roverW.test(s)) {
      if (/(patrol|auto|गश्त|ऑटो)/i.test(s)) return 'rover_patrol';
      if (/(stop|halt|band|rok|रुको|बंद)/i.test(s)) return 'rover_stop';
      if (/(forward|ahead|front|aage|आगे)/i.test(s)) return 'rover_forward';
      if (/(back|reverse|peeche|पीछे)/i.test(s)) return 'rover_back';
      if (/(left|baye|बाएं)/i.test(s)) return 'rover_left';
      if (/(right|daye|दाएं)/i.test(s)) return 'rover_right';
      return 'rover_patrol';
    }
    if (/(sync.*crop|sync.*dose|apply.*prescription|फसल अनुसार सेट)/i.test(s)) return 'dose_sync';
    // Pump first: "stop motor at 95%" is a threshold command, not a stop.
    // Short English verbs use word boundaries so "running" isn't "run".
    const pumpW = /(pump|motor|tubewell|borewell|irrigat|sinchai|सिंचाई|मोटर|पंप|threshold|limit|seema|सीमा)/i;
    const modeW = /(\bauto\b|\bautomatic\b|\bmanual\b|\bmode\b|मोड|ऑटो|मैनुअल)/i;
    if (pumpW.test(s) || modeW.test(s)) {
      let nums = Array.from(s.matchAll(/(\d+(?:\.\d+)?)\s*%/g)).map((m) => +m[1]);
      // Bare numbers count when threshold words are present ("set limit 20 and 90").
      if (!nums.length && /(threshold|limit|seema|सीमा|low|high|start|stop)/i.test(s)) {
        nums = Array.from(s.matchAll(/(\d+(?:\.\d+)?)/g)).map((m) => +m[1]).filter((n) => n >= 0 && n <= 100);
      }
      const lowW = /(low|start|below|under|minimum|कम|नीचे|चालू)/i;
      const highW = /(high|stop|above|maximum|ज्यादा|ऊपर|बंद)/i;
      if (nums.length >= 2 || (nums.length === 1 && (lowW.test(s) || highW.test(s)))) return 'pump_set';
      if (modeW.test(s)) return 'pump_mode';
      if (/(status|state|halat|हाल|kitna|running|\bis\b|kya|क्या|should|चाहिए|\?)/i.test(s)) return 'pump_status';
      if (/(\bstop\b|\boff\b|band|rok|रुको|बंद|halt|cut)/i.test(s)) return 'pump_off';
      if (/(\bstart\b|\bon\b|\brun\b|chalu|chalao|चालू|खोल)/i.test(s)) return 'pump_on';
      return 'pump_status';
    }
    if (has('rain', 'barish', 'varsha', 'barsaat', 'बारीश', 'बारिश', 'वर्षा', 'monsoon', 'mausam', 'मौसम', 'weather', 'storm', 'toofan', 'lluvia', 'pluie', 'chuva')) return 'rain';
    if (has('water', 'pani', 'paani', 'पानी', 'irrigat', 'sinchai', 'सिंचाई', 'moist', 'nami', 'नमी', 'dry', 'सूखा', 'agua', 'humedad', 'eau', 'humidité', 'água', 'umidade')) return 'water';
    if (has('heat', 'garmi', 'garam', 'गर्मी', 'hot', 'temperature', 'tapman', 'तापमान', 'dhup', 'धूप', 'sun', 'calor', 'temperatura', 'chaleur')) return 'heat';
    if (has('fert', 'urea', 'यूरिया', 'dap', 'डीएपी', 'potash', 'पोटाश', 'dose', 'matra', 'मात्रा', 'npk', 'khad', 'खाद', 'compost', 'engrais', 'fertilizante', 'adubo')) return 'fert';
    if (has('yellow', 'peele', 'पीले', 'pest', 'keet', 'कीट', 'rog', 'रोग', 'keeda', 'कीड़ा', 'spray', 'छिड़काव', 'leaf', 'leaves', 'patte', 'पत्ते', 'bimari', 'बीमारी', 'fungus', 'plaga', 'ravageur', 'praga')) return 'pest';
    if (has('mandi', 'मंडी', 'bhav', 'भाव', 'rate', 'रेट', 'price', 'daam', 'दाम', 'market', 'enam', 'sell', 'bech', 'harvest', 'कटाई', 'precio', 'prix', 'preço')) return 'mandi';
    if (has('care', 'dekhbhal', 'देखभाल', 'organic', 'jaivik', 'जैविक', 'neem', 'नीम', 'upchar', 'उपचार', 'suraksha', 'सुरक्षा')) return 'care';
    if (has('soil', 'mitti', 'मिट्टी', 'nitrogen', 'phosphorus', 'potash', 'nutrient', 'poshak', 'ph', 'suelo', 'sol', 'solo')) return 'soil';
    if (has('crop', 'fasal', 'फसल', 'gdd', 'growth', 'badhwar', 'बढ़वार', 'stage', 'avastha', 'cultivo', 'culture', 'cultura')) return 'crop';
    if (has('pressure', 'dabav', 'दबाव', 'hawa', 'हवा', 'air', 'humid')) return 'air';
    if (has('hello', 'namaste', 'नमस्ते', 'ram ram', 'sat sri', 'good morning', 'kaise ho', 'hola', 'bonjour', 'olá', 'how are you')) return 'greet';
    if (has('help', 'madad', 'मदद', 'what can you', 'kya pooch')) return 'help';
    if (has('trend', 'history', 'record', 'statistic', 'stats', 'data', 'report', 'graph', 'chart', 'average', 'avg', 'week', 'saptah', 'hafta', 'रिकॉर्ड', 'इतिहास', 'आंकड़े', 'रिपोर्ट', 'रुझान', 'सप्ताह')) return 'stats';
    return 'unknown';
  }

  function isActionIntent(text) {
    const it = intentOf(text);
    return it === 'pump_on' || it === 'pump_off' || it === 'pump_mode' || it === 'pump_set' ||
      it.indexOf('rover_') === 0 || it === 'dose_sync';
  }

  function fill(tpl, map) {
    return String(tpl).replace(/\{(\w+)\}/g, (_, k) => (map[k] != null ? map[k] : ''));
  }

  // "set low threshold to 25%" / "stop motor at 95%" / bare numbers.
  // Returns {lo, hi} with nulls for sides not mentioned.
  function pumpNums(text) {
    const s = text.toLowerCase();
    const nums = Array.from(s.matchAll(/(\d+(?:\.\d+)?)\s*%/g)).map((m) => +m[1]);
    const lowW = /(low|start|below|under|minimum|कम|नीचे|चालू)/i;
    const highW = /(high|stop|above|maximum|ज्यादा|ऊपर|बंद)/i;
    let lo = null, hi = null;
    if (nums.length >= 2) { lo = nums[0]; hi = nums[1]; }
    else if (nums.length === 1) {
      const lowFirst = Math.max(s.search(lowW), 0) >= 0 && (s.search(highW) < 0 || s.search(lowW) < s.search(highW));
      if (lowW.test(s) && (lowFirst || !highW.test(s))) lo = nums[0];
      else if (highW.test(s)) hi = nums[0];
      else lo = nums[0];
    }
    return { lo, hi };
  }

  async function answerCommand(text, silentEvent) {
    const st = bindings.getState();
    const intent = intentOf(text);
    let ans = t('v_ans_unknown');
    if (st && st.snapshot && st.analysis) {
      const s = st.snapshot, a = st.analysis, p = st.profile || {};
      const crop = E.getCrop(p.cropId || 'bajra');
      const cropName = t(crop.labelKey);
      const isHi = (E.i18n && E.i18n.lang) === 'hi';
      const stage = p.stage || 'vegetative';

      if (intent === 'water') {
        const mb = a.water.moistureBand;
        ans = a.water.level === 'good'
          ? fill(t('v_ans_water_ok'), { m: Math.round(s.moisture) })
          : mb === 'excess' ? fill(t('v_ans_water_excess'), { m: Math.round(s.moisture) })
          : mb === 'high' ? fill(t('v_ans_water_high'), { m: Math.round(s.moisture) })
          : fill(t('v_ans_water_low'), { m: Math.round(s.moisture) });
      } else if (intent === 'heat') {
        const cropH = E.getCrop(s.cropId);
        const frost = cropH.tempMin != null && s.tempC != null && s.tempC < cropH.tempMin;
        ans = a.heat.level === 'good'
          ? fill(t('v_ans_heat_ok'), { t: Math.round(s.tempC) })
          : frost ? fill(t('v_ans_heat_cold'), { t: Math.round(s.tempC) })
          : fill(t('v_ans_heat_high'), { t: Math.round(s.tempC) });
      } else if (intent === 'fert') {
        const isLowN = a.nutrients && a.nutrients.n === 'low';
        const isHiN = a.nutrients && a.nutrients.n === 'high';
        if (isHi) {
          ans = isLowN
            ? `मिट्टी में नाइट्रोजन कम है। ${cropName} (${stage} अवस्था) के लिए 25-30 किग्रा यूरिया प्रति एकड़ सिंचाई के बाद दें।`
            : isHiN
            ? `नाइट्रोजन पर्याप्त से अधिक है। अभी यूरिया रोकें और संतुलित सिंचाई रखें ताकि पौधे मजबूत रहें।`
            : `${cropName} की ${stage} अवस्था में 20-25 किग्रा यूरिया या 1% NPK 19:19:19 का संतुलित छिड़काव करें।`;
        } else {
          ans = isLowN
            ? `Soil Nitrogen is low. Apply 25-30 kg/acre Urea after watering for ${cropName} in ${stage} stage.`
            : isHiN
            ? `Soil Nitrogen is already high. Hold off on Urea and maintain balanced watering.`
            : `For ${cropName} in ${stage} stage, apply 20-25 kg/acre Urea or spray 1% balanced NPK 19:19:19.`;
        }
      } else if (intent === 'pest') {
        const isWet = s.moisture != null && s.moisture > 38;
        if (isHi) {
          ans = isWet
            ? `पत्ते पीले होने का कारण अधिक नमी व जलभराव हो सकता है। जल निकासी सुधारें और 5ml नीम तेल प्रति लीटर पानी का छिड़काव करें।`
            : `निचले पत्तों का पीलापन नाइट्रोजन कमी या रस चूसक कीट का संकेत है। 5ml नीम तेल प्रति लीटर पानी का छिड़काव करें व कैमरे से पास से जांचें।`;
        } else {
          ans = isWet
            ? `Yellowing leaves may be due to excess soil moisture. Improve field drainage and spray 5ml/L Neem oil.`
            : `Yellowing is commonly due to Nitrogen deficiency or sucking pests. Spray 5ml/L Neem oil and inspect with the Crop Camera.`;
        }
      } else if (intent === 'mandi') {
        if (isHi) {
          ans = `${cropName} का नजदीकी मंडी भाव ₹2,150-2,450/क्विंटल के आसपास है। उच्चतम ग्रेड पाने के लिए कटाई पर दाने की नमी 12% से कम रखें। eNAM पोर्टल पर आज के भाव जांचें।`;
        } else {
          ans = `Current mandi rate for ${cropName} is around ₹2,150-2,450/quintal. Keep grain moisture under 12% for top price. Check the eNAM portal for local APMC prices.`;
        }
      } else if (intent === 'care') {
        if (isHi) {
          ans = `फसल सुरक्षा के लिए 5ml नीम तेल प्रति लीटर पानी में मिलाकर 10-12 दिनों में छिड़कें। सफेद मक्खी व थ्रिप्स से बचाव के लिए खेत में पीले चिपचिपे ट्रैप लगाएं।`;
        } else {
          ans = `Spray Neem oil (5ml/L water) every 10-12 days for biological protection. Place yellow sticky traps against sucking pests.`;
        }
      } else if (intent === 'soil') {
        if (a.soilLevel === 'good') ans = t('v_ans_soil_ok');
        else {
          const f = a.nutrients.focus;
          const nut = f === 'n' ? t('nitrogen_full') : f === 'p' ? t('phosphorus_full') : f === 'k' ? t('potassium_full') : 'pH';
          const band = f === 'n' ? a.nutrients.n : f === 'p' ? a.nutrients.p : f === 'k' ? a.nutrients.k : null;
          ans = fill(t(band === 'high' ? 'v_ans_soil_high' : 'v_ans_soil_low'), { nut });
        }
      } else if (intent === 'crop') {
        ans = fill(t('v_ans_crop'), { crop: cropName, g: Math.round(a.crop.cumulativeGDD) });
      } else if (intent === 'air') {
        ans = fill(t('v_ans_air'), { h: s.humidity == null ? '—' : Math.round(s.humidity) });
      } else if (intent === 'stats') {
        const se = (s.series) || {};
        const tm = E.agri.trendOf(se.moisture || []);
        const tt = E.agri.trendOf(se.temp || []);
        const moist = tm === 'falling' ? t('trend_soil_drying') : t('trend_soil_ok');
        const temp = tt === 'rising' ? t('trend_heat_rising') : t('trend_temp_ok');
        ans = fill(t('v_ans_stats'), {
          moist, temp,
          m: Math.round(s.moisture), t: Math.round(s.tempC),
          g: Math.round(a.crop.cumulativeGDD)
        });
      } else if (intent === 'rain' || intent === 'weather') {
        try {
          const o = await bindings.getOutlook();
          if (o && o.source === 'online' && o.hourly && o.hourly.length) {
            const peak = Math.max.apply(null, o.hourly.map((h) => h.prob == null ? 0 : h.prob));
            ans = fill(t('v_ans_rain_online'), { p: peak, place: o.place || '' });
          } else if (o && o.estimate) {
            ans = fill(t('v_ans_rain_est'), { p: o.estimate.prob });
          } else ans = t('v_ans_rain_none');
        } catch (_) { ans = t('v_ans_rain_none'); }
      } else if (intent === 'greet') {
        ans = t('v_ans_greet');
      } else if (intent === 'help') {
        ans = t('v_ans_help');
      } else if (intent.indexOf('rover_') === 0) {
        const rc = E.roverControl;
        if (rc) {
          if (intent === 'rover_patrol') { rc.setMode('patrol'); ans = isHi ? 'रोवर ऑटो गश्त (Patrol) मोड में चालू हो गया है।' : 'Rover auto-patrol mode started.'; }
          else if (intent === 'rover_stop') { rc.drive('S'); ans = isHi ? 'रोवर रोक दिया गया है।' : 'Rover stopped.'; }
          else if (intent === 'rover_forward') { rc.drive('F'); ans = isHi ? 'रोवर आगे बढ़ रहा है।' : 'Moving rover forward.'; }
          else if (intent === 'rover_back') { rc.drive('B'); ans = isHi ? 'रोवर पीछे जा रहा है।' : 'Moving rover backward.'; }
          else if (intent === 'rover_left') { rc.drive('L'); ans = isHi ? 'रोवर बाएं मुड़ रहा है।' : 'Turning rover left.'; }
          else if (intent === 'rover_right') { rc.drive('R'); ans = isHi ? 'रोवर दाएं मुड़ रहा है।' : 'Turning rover right.'; }
        }
      } else if (intent === 'dose_sync') {
        const dc = E.dosingControl;
        if (dc && dc.syncCropPrescription) {
          dc.syncCropPrescription(true);
          ans = isHi ? `${cropName} के लिए उर्वरक, कंपोस्ट और कीटनाशक की अनुशंसित मात्रा सेट कर दी गई है।` : `Synced recommended fertilizer, compost, and pesticide dosing rates for ${cropName}.`;
        }
      } else if (intent.indexOf('pump') === 0) {
        const pc = E.pumpControl;
        if (!pc) { ans = t('v_ans_pump_cant'); }
        else if (intent === 'pump_on') {
          ans = pc.start().ok ? t('v_ans_pump_on') : t('v_ans_pump_cant');
        } else if (intent === 'pump_off') {
          ans = pc.stop().ok ? t('v_ans_pump_off') : t('v_ans_pump_cant');
        } else if (intent === 'pump_status') {
          const stt = pc.status();
          ans = !stt.available ? t('v_ans_pump_cant')
            : stt.running
              ? fill(t('v_ans_pump_running'), { m: stt.moisture == null ? '—' : Math.round(stt.moisture) })
              : fill(t('v_ans_water_ok'), { m: s.moisture == null ? '—' : Math.round(s.moisture) }) + ' ' + t('v_ans_pump_off');
        } else if (intent === 'pump_mode') {
          const toAuto = /(auto|automatic|ऑटो)/i.test(text);
          const r = pc.setMode(toAuto ? 'auto' : 'manual');
          if (!r.ok) { ans = t('v_ans_pump_cant'); }
          else {
            const c = pc.status();
            ans = fill(t('v_ans_pump_mode'), {
              m: (c.available && c.mode === 'auto') || (!c.available && toAuto) ? t('mode_auto') : t('mode_manual'),
              lo: Math.round(c.available ? c.startBelow : 20),
              hi: Math.round(c.available ? c.stopAbove : 90)
            });
          }
        } else if (intent === 'pump_set') {
          const { lo, hi } = pumpNums(text);
          const r = pc.setThresholds(lo, hi);
          ans = !r.ok ? t('thresholds_invalid')
            : fill(t('v_ans_pump_set'), { lo: Math.round(r.lo), hi: Math.round(r.hi) });
        }
      }
    }
    if (!silentEvent) {
      document.dispatchEvent(new CustomEvent('voice-answer', { detail: { q: text, a: ans, source: 'local' } }));
    }
    return ans;
  }

  // Quick question chips on the Agri tab: asked into the open live call,
  // or handled non-blockingly by the UI layer.
  async function sendChip(text) {
    if (!text) return false;
    if (callSession && E.gemini && E.gemini.alive(callSession)) {
      conversation.push({ who: 'user', text });
      document.dispatchEvent(new CustomEvent('agri-call', { detail: callInfo() }));
      try { callSession.sendText(text); } catch (_) { /* ignore */ }
      return true;
    }
    return false;
  }

  function refreshLang() {
    // A language switch starts Agri fresh: any open call, speech, or
    // dictation closes, because session language is fixed at session start.
    // The next tap speaks the newly selected language.
    try { if (callSession && E.gemini) callSession.close('lang'); } catch (_) { /* ignore */ }
    try { if (dictSession) dictSession.close('lang'); } catch (_) { /* ignore */ }
    dictSession = null;
    conversation = [];
    stopSpeak();
    resetCall();
    handsFree.refreshLanguage();
  }

  function startSpotting() {
    // Arms tap-to-talk + the hands-free "Hey Agri" wake word (while the
    // app is open). The wake word uses the browser's free on-device
    // speech recognition — no Gemini session until it hears "agri".
    store.enabled = true;
    emitState('idle');
    try { startWakeWord(); } catch (_) { /* wake optional */ }
    return true;
  }

  function stopSpotting() {
    store.enabled = false;
    // NOTE: standby ("Hey Agri") keeps listening — it has its own switch.
    // Voice OFF only ends the current call/speech, never the standby ear.
    try { if (callSession && E.gemini) callSession.close('off'); } catch (_) { /* ignore */ }
    try { if (dictSession) dictSession.close('off'); } catch (_) { /* ignore */ }
    dictSession = null;
    try { clearInterval(camTimer); } catch (_) { /* ignore */ }
    camTimer = null;
    stopCameraTracks();
    camOn = false;
    stopSpeak();
    resetCall();
  }

  // One recognizer serves standby and explicit browser voice questions.
  const selectedLanguage = () => E.i18n?.lang || 'en';
  const handsFree = createHandsFree({
    language: selectedLanguage,
    audioBusy: () => inCommand || Boolean(dictSession) || dictStarting
      || Boolean(speechSession || speechPendingResolve || window.speechSynthesis?.speaking),
    speak: text => typeof window.SpeechSynthesisUtterance === 'function' ? speakWithWebSpeech(text, true) : Promise.resolve(false),
    stopSpeech: stopSpeak,
    beginContext: () => E.UI?.getActiveAgriSession?.(),
    answer: (question, context, signal) => E.UI?.answerHandsFree?.(question, context, signal),
  });
  const browserSttSupported = () => handsFree.state().supported;
  const wakeSupported = browserSttSupported;
  const wakeOn = () => handsFree.state().enabled;
  const wakePhrase = () => handsFree.state().phrase || handsFree.state().selectedPhrase;
  const wakeListening = () => handsFree.state().status === 'standby' && handsFree.state().listening;
  const startWakeWord = handsFree.arm;
  const stopWakeWord = handsFree.suspend;
  const setWake = handsFree.setEnabled;
  const pauseWake = handsFree.pauseForAudio;
  const resumeWake = handsFree.arm;
  const startManualVoiceQuestion = handsFree.test;

  // Live farm tools: fresh data on demand inside a Gemini session.
  // Registered once; the engine calls them when Agri needs them.
  try {
    if (E.gemini && E.gemini.registerTool) {
      const num = (v) => (v == null ? null : +(+v).toFixed(1));
      const lvl = (o) => (o && o.level) || 'unknown';
      const state = () => {
        const st = bindings.getState ? bindings.getState() : null;
        return { s: (st && st.snapshot) || {}, a: (st && st.analysis) || {}, p: (st && st.profile) || {} };
      };
      E.gemini.registerTool('get_field_readings', async () => {
        const { s, a } = state();
        return {
          moisture_pct: num(s.moisture), nitrogen_mgkg: num(s.n), phosphorus_mgkg: num(s.p),
          potassium_mgkg: num(s.k), ph: num(s.ph), temp_c: num(s.tempC), lux: num(s.lux),
          pressure_hpa: num(s.pressureHpa), humidity_pct: s.humidity,
          water: lvl(a.water), heat: lvl(a.heat), soil: a.soilLevel || 'unknown', weather: lvl(a.weather),
          gdd_total: a.crop && a.crop.cumulativeGDD != null ? Math.round(a.crop.cumulativeGDD) : null
        };
      });
      E.gemini.registerTool('get_rain_outlook', async () => {
        try {
          const o = await Promise.race([
            bindings.getOutlook(),
            new Promise((res) => setTimeout(() => res(null), 3000))
          ]);
          if (!o) return { available: false };
          if (o.source === 'online' && o.hourly && o.hourly.length) {
            return {
              available: true, source: 'online', place: o.place || '',
              peak_prob_pct: Math.max.apply(null, o.hourly.map((h) => (h.prob == null ? 0 : h.prob)))
            };
          }
          return { available: true, source: 'estimate', estimate_prob_pct: o.estimate ? o.estimate.prob : null };
        } catch (_) { return { available: false }; }
      });
      E.gemini.registerTool('get_crop_calendar', async () => {
        const { a, p } = state();
        return {
          crop: p.cropId || 'bajra', stage: p.stage || 'unknown',
          gdd_total: a.crop && a.crop.cumulativeGDD != null ? Math.round(a.crop.cumulativeGDD) : null,
          next_stage: (a.crop && a.crop.nextStage) || 'unknown',
          progress_pct: a.crop ? Math.round(a.crop.progress * 100) : null
        };
      });
      // Web search for outside knowledge (server-side search tools hang
      // this Live endpoint, so the app searches directly: Wikipedia in the
      // farmer's language with English fallback, plus DuckDuckGo abstracts).
      // Found links are saved and attached as Sources under Agri's reply.
      E.gemini.registerTool('web_search', async (args) => {
        pendingSearchSources = [];
        const q = String((args && args.query) || '').slice(0, 120).trim();
        if (!q) return { results: [], addresses: [] };
        const uiLang = (E.i18n && E.i18n.lang) || 'en';
        const wikis = uiLang === 'en' ? ['en'] : [uiLang, 'en'];
        const out = [];
        const addr = [];
        const seenAddr = new Set();
        const fetchJson = (url, ms) => {
          const ctl = new AbortController();
          const to = setTimeout(() => { try { ctl.abort(); } catch (_) { /* ignore */ } }, ms || 7000);
          return fetch(url, { signal: ctl.signal }).then((r) => {
            if (!r.ok) throw new Error('http ' + r.status);
            return r.json();
          }).finally(() => clearTimeout(to));
        };
        const cleanHtml = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
        // 1. Wikipedia article text (not just the snippet — full intro).
        for (const w of wikis) {
          try {
            const j = await fetchJson('https://' + w + '.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
              encodeURIComponent(q) + '&format=json&srlimit=3&origin=*');
            const hits = (j && j.query && j.query.search) || [];
            if (!hits.length) continue;
            const top = hits[0].title;
            let intro = cleanHtml(hits[0].snippet);
            try {
              const e = await fetchJson('https://' + w + '.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=' +
                encodeURIComponent(top) + '&format=json&origin=*', 6000);
              const pages = (e && e.query && e.query.pages) || {};
              const pg = pages[Object.keys(pages)[0] || ''];
              if (pg && pg.extract) intro = String(pg.extract).replace(/\s+/g, ' ').trim().slice(0, 600);
            } catch (_) { /* snippet stands */ }
            out.push({
              title: top, snippet: intro,
              url: 'https://' + w + '.wikipedia.org/wiki/' + encodeURIComponent(top.replace(/ /g, '_'))
            });
            break;
          } catch (_) { /* try next wiki */ }
        }
        // 2. Street addresses with PIN codes (OpenStreetMap).
        const farmDistrict = (() => {
          try {
            const st = bindings.getState ? bindings.getState() : null;
            return (st && st.profile && (st.profile.district || st.profile.village)) || '';
          } catch (_) { return ''; }
        })();
        const addrQueries = farmDistrict && q.toLowerCase().indexOf(farmDistrict.toLowerCase()) < 0
          ? [q, q + ' ' + farmDistrict] : [q];
        for (const aq of addrQueries) {
          try {
            const hits = await fetchJson('https://nominatim.openstreetmap.org/search?q=' +
              encodeURIComponent(aq) + '&format=jsonv2&limit=3', 7000);
            for (const h of (hits || []).slice(0, 3)) {
              const name = [h.name, h.display_name].filter(Boolean).join(' — ');
              if (!h.display_name || seenAddr.has(h.display_name)) continue;
              seenAddr.add(h.display_name);
              addr.push({
                name: (h.name || '').slice(0, 80),
                address: h.display_name,
                url: (h.osm_type && h.osm_id) ? 'https://www.openstreetmap.org/' + h.osm_type + '/' + h.osm_id : ''
              });
            }
          } catch (_) { /* addresses optional */ }
          if (addr.length) break;
        }
        // 3. DuckDuckGo abstract as backup.
        try {
          const d = await fetchJson('https://api.duckduckgo.com/?q=' + encodeURIComponent(q) +
            '&format=json&no_html=1&skip_disambig=1&t=enviroos');
          if (d && d.AbstractText) {
            out.push({ title: d.Heading || q, snippet: String(d.AbstractText).slice(0, 300), url: d.AbstractURL || '' });
          }
        } catch (_) { /* abstracts optional */ }
        const results = out.slice(0, 3);
        const addresses = addr.slice(0, 3);
        pendingSearchSources = results.filter((r) => r.url).map((r) => ({ title: r.title, uri: r.url }))
          .concat(addresses.filter((a) => a.url).map((a) => ({ title: a.name || 'Map', uri: a.url })));
        return { results, addresses };
      });
      // Real Google addresses + map links (needs the Maps key in config).
      // Appends to Sources without wiping web_search links from this turn.
      E.gemini.registerTool('find_place', async (args) => {
        const q = String((args && args.query) || '').slice(0, 120).trim();
        if (!q || !E.mapsKey) return { places: [] };
        let district = '';
        try {
          const st = bindings.getState ? bindings.getState() : null;
          district = (st && st.profile && (st.profile.district || st.profile.village)) || '';
        } catch (_) { /* ignore */ }
        const query = (district && q.toLowerCase().indexOf(district.toLowerCase()) < 0) ? q + ' ' + district : q;
        const uiLang = (E.i18n && E.i18n.lang) || 'en';
        try {
          const ctl = new AbortController();
          const to = setTimeout(() => { try { ctl.abort(); } catch (_) { /* ignore */ } }, 9000);
          const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            signal: ctl.signal,
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': E.mapsKey,
              'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.rating'
            },
            body: JSON.stringify({ textQuery: query, languageCode: uiLang === 'hi' ? 'hi' : 'en', maxResultCount: 3 })
          }).finally(() => clearTimeout(to));
          if (!r.ok) return { places: [] };
          const j = await r.json();
          const places = ((j && j.places) || []).slice(0, 3).map((p) => ({
            name: p.displayName && p.displayName.text,
            address: p.formattedAddress,
            lat: p.location && p.location.latitude,
            lon: p.location && p.location.longitude,
            rating: p.rating,
            url: p.googleMapsUri
          }));
          for (const pl of places) {
            if (pl.url) pendingSearchSources.push({ title: pl.name || 'Map', uri: pl.url });
          }
          return { places };
        } catch (_) {
          return { places: [] };
        }
      });
      // Pump control by voice: same guards as the on-screen buttons.
      // Every action pauses auto for 30 minutes, like a manual tap.
      E.gemini.registerTool('control_pump', async (args) => {
        const pc = E.pumpControl;
        if (!pc) return { ok: false, reason: 'unavailable' };
        const action = String((args && args.action) || '').toLowerCase();
        if (action === 'status') {
          const s = pc.status();
          return s.available
            ? { ok: true, running: s.running, mode: s.mode, moisture: s.moisture, startBelow: s.startBelow, stopAbove: s.stopAbove, tempAbove: s.tempAbove, luxAbove: s.luxAbove, health: s.health }
            : { ok: false, reason: 'unavailable' };
        }
        if (action === 'auto' || action === 'manual') {
          const r = pc.setMode(action);
          const s = pc.status();
          return { ok: r.ok, mode: action, startBelow: s.startBelow, stopAbove: s.stopAbove };
        }
        if (action === 'set') {
          const r = pc.setThresholds(args && args.low, args && args.high, args && args.temp, args && args.lux);
          return r.ok ? { ok: true, lo: r.lo, hi: r.hi, tempAbove: r.tempAbove, luxAbove: r.luxAbove } : { ok: false, reason: 'invalid thresholds (need 0-100, low below high)' };
        }
        if (action === 'off' || action === 'stop') {
          const r = pc.stop();
          return { ok: r.ok };
        }
        if (action === 'on' || action === 'start') {
          const r = pc.start();
          return { ok: r.ok };
        }
        return { ok: false, reason: 'unknown action (on, off, status, auto, manual, set)' };
      });
    }
  } catch (_) { /* tools optional; prompt + readings still ground Agri */ }

  E.voice = {
    get supported() {
      const c = audioCaps();
      return c.ctx && c.mic;
    },
    get sttSupported() {
      const c = audioCaps();
      return c.ctx && c.mic;
    },
    get ttsSupported() {
      const c = audioCaps();
      return (c.ctx && c.mic) || (typeof window !== 'undefined' && 'speechSynthesis' in window);
    },
    get isSpeaking() {
      return !!(speechSession || (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking));
    },
    get enabled() { return store.enabled; },
    handsFree,
    bindings, speak, stopSpeak, dictate,
    startSpotting: () => { store.enabled = true; return startSpotting(); },
    stopSpotting: () => { store.enabled = false; stopSpotting(); },
    askOnce, answerCommand, isActionIntent, refreshLang, callInfo, sendChip,
    setCamera, toggleCamera, cameraVideo,
    wakeSupported, wakeOn, wakePhrase, setWake, startWakeWord, stopWakeWord, wakeListening,
    startManualVoiceQuestion,
    cleanSpeechText, pickVoice, chunkText,
    _wakeHeard: text => matchWake(text, selectedLanguage()) !== null,
    _extractWakeQuestion: text => matchWake(text, selectedLanguage()) ?? String(text || '').trim()
  };
})();
