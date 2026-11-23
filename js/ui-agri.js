/* EnviroOS — UI AGRI + WIRING (Ground-up Rework).
 * Owns: Agri voice stage, live field context strip, persistent chat history
 * with grounding sources & per-reply TTS, camera inspection, pump steppers/presets,
 * and cloud history loader.
 */
'use strict';
window.EnviroOS = window.EnviroOS || {};
(function () {
  const E = EnviroOS, U = E.UI;
  const t = U.t, esc = U.esc, fmt1 = U.fmt1, fmtInt = U.fmtInt, $ = U.$, IC = U.icons;
  U.driveSpeed = 150;

  const onlineNow = () => { try { return navigator.onLine !== false; } catch (_) { return true; } };
  const gemReady = () => !!(onlineNow() && E.gemini && E.gemini.configured && E.gemini.configured());

  /* ---------- hero advice (live when possible, local otherwise) ---------- */
  let adviceKey = '';
  U.ensureAdvice = () => {
    if (!U.snapshot || !U.analysis) return;
    const key = `${U.profile.cropId}|${U.profile.pincode}|${U.profile.stage}|${Math.round(U.snapshot.moisture || 0)}|${Math.round(U.snapshot.tempC || 0)}|${E.i18n.lang}`;
    if (key === adviceKey && U.heroAdvice) return;
    adviceKey = key;
    if (gemReady()) {
      E.gemini.generateDashboardAdvice(U.snapshot, U.analysis, U.profile, E.i18n.lang)
        .then((txt) => {
          if (txt) {
            U.heroAdvice = txt;
            const el = $('hero-text');
            if (el) el.textContent = txt;
          }
        })
        .catch(() => { U.heroAdvice = U.sayHome(); });
    } else {
      U.heroAdvice = U.sayHome();
    }
  };

  /* ---------- Chat History & Sessions (Persistence) ---------- */
  const SESSIONS_KEY = 'enviroos.agri.sessions';
  const ACTIVE_ID_KEY = 'enviroos.agri.active_id';

  U.agriHistoryOpen = false;

  const loadSessions = () => {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (_) {}
    return [];
  };

  const saveSessions = (arr) => {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify((arr || []).slice(0, 35)));
    } catch (_) {}
  };

  U.getAgriSessions = () => loadSessions();

  U.getActiveAgriSession = () => {
    const sessions = loadSessions();
    let actId = '';
    try { actId = localStorage.getItem(ACTIVE_ID_KEY) || ''; } catch (_) {}
    let cur = sessions.find((s) => s.id === actId);
    if (!cur) {
      if (sessions.length > 0) {
        cur = sessions[0];
      } else {
        cur = {
          id: 'chat_' + Date.now(),
          title: t('agri_title'),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: []
        };
        sessions.unshift(cur);
        saveSessions(sessions);
      }
      try { localStorage.setItem(ACTIVE_ID_KEY, cur.id); } catch (_) {}
    }
    return cur;
  };

  U.appendAgriMessage = (msg, sessionId) => {
    if (!msg || !msg.text) return null;
    const sessions = loadSessions();
    const cur = sessionId ? sessions.find(session => session.id === sessionId) : U.getActiveAgriSession();
    if (!cur) return null;
    let idx = sessions.findIndex((s) => s.id === cur.id);
    if (idx === -1) {
      sessions.unshift(cur);
      idx = 0;
    }
    const sess = sessions[idx];
    sess.messages = sess.messages || [];

    // Deduplication check: ignore if exact same text & who within 2 seconds
    const last = sess.messages[sess.messages.length - 1];
    if (last && last.who === msg.who && last.text === msg.text) {
      return sess;
    }

    sess.messages.push({
      who: msg.who,
      text: msg.text,
      image: msg.image || null,
      sources: msg.sources || null,
      time: msg.time || Date.now()
    });

    if (msg.who === 'user' && (!sess.title || sess.title === t('agri_title') || sess.title === 'Agri' || sess.title === 'Agri AI')) {
      sess.title = (msg.text || (msg.image ? t('agri_image_attached') : t('agri_title'))).replace(/\s+/g, ' ').trim().slice(0, 42);
    }
    sess.updatedAt = Date.now();
    if (sess.messages.length > 50) sess.messages = sess.messages.slice(-50);

    // Promote to top of history
    if (idx > 0) {
      sessions.splice(idx, 1);
      sessions.unshift(sess);
    }
    saveSessions(sessions);
    return sess;
  };

  U.startNewAgriChat = () => {
    const sessions = loadSessions();
    const fresh = {
      id: 'chat_' + Date.now(),
      title: t('agri_title'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    sessions.unshift(fresh);
    saveSessions(sessions);
    try { localStorage.setItem(ACTIVE_ID_KEY, fresh.id); } catch (_) {}
    U.agriHistoryOpen = false;
    U.lastVoice = null;
    U.toast(t('agri_new_chat_started'));
    lastTalkSig = '__RESET__';
    lastChipsSig = '__RESET__';
    const logEl = $('agritalklog');
    if (logEl) {
      logEl.innerHTML = '';
      logEl.hidden = true;
    }
    const promptEl = $('agriemptyprompt');
    if (promptEl) promptEl.hidden = false;
    if (U.syncAgriUI && $('agristage')) U.syncAgriUI();
    else U.render();
  };

  U.loadAgriSession = (id) => {
    if (!id) return;
    try { localStorage.setItem(ACTIVE_ID_KEY, id); } catch (_) {}
    U.agriHistoryOpen = false;
    const sessions = loadSessions();
    const s = sessions.find((x) => x.id === id);
    if (s && s.messages && s.messages.length) {
      const lastAgri = [...s.messages].reverse().find((m) => m.who === 'agri');
      if (lastAgri) {
        U.lastVoice = { q: '', a: lastAgri.text };
        const cap = $('agricap');
        if (cap) cap.textContent = lastAgri.text;
      }
    }
    lastTalkSig = '';
    lastChipsSig = '';
    if (U.syncAgriUI && $('agristage')) U.syncAgriUI();
    else U.render();
  };

  U.deleteAgriSession = (id) => {
    if (!id) return;
    let sessions = loadSessions();
    sessions = sessions.filter((x) => x.id !== id);
    saveSessions(sessions);
    let curId = '';
    try { curId = localStorage.getItem(ACTIVE_ID_KEY) || ''; } catch (_) {}
    if (curId === id) {
      if (sessions.length > 0) {
        try { localStorage.setItem(ACTIVE_ID_KEY, sessions[0].id); } catch (_) {}
      } else {
        const fresh = {
          id: 'chat_' + Date.now(),
          title: t('agri_title'),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: []
        };
        sessions.unshift(fresh);
        saveSessions(sessions);
        try { localStorage.setItem(ACTIVE_ID_KEY, fresh.id); } catch (_) {}
      }
    }
    U.toast(t('agri_chat_deleted'));
    lastTalkSig = '';
    lastChipsSig = '';
    if (U.syncAgriUI && $('agristage')) U.syncAgriUI();
    else U.render();
  };

  U.clearAllAgriSessions = () => {
    if (confirm(t('agri_confirm_clear'))) {
      saveSessions([]);
      try { localStorage.removeItem(ACTIVE_ID_KEY); } catch (_) {}
      U.agriHistoryOpen = false;
      U.toast(t('agri_chat_deleted'));
      lastTalkSig = '';
      lastChipsSig = '';
      if (U.syncAgriUI && $('agristage')) U.syncAgriUI();
      else U.render();
    }
  };

  const fmtSessionTime = (ts) => {
    if (!ts) return '';
    const now = Date.now();
    const d = new Date(ts);
    const diff = now - ts;
    const isToday = (new Date()).toDateString() === d.toDateString();
    const isYesterday = (new Date(now - 86400000)).toDateString() === d.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 60000) return E.i18n.lang === 'hi' ? 'अभी' : 'Just now';
    if (isToday) return (E.i18n.lang === 'hi' ? 'आज ' : 'Today ') + timeStr;
    if (isYesterday) return (E.i18n.lang === 'hi' ? 'कल ' : 'Yesterday ') + timeStr;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + timeStr;
  };

  U.renderHistoryDrawer = () => {
    if (!U.agriHistoryOpen) return '';
    const sessions = loadSessions();
    const activeSession = U.getActiveAgriSession();
    if (sessions.length > 0) {
      return `<div class="agri-history-drawer" id="agrihistorydrawer">`
        + `<div class="agri-history-head"><span>${esc(t('agri_chat_history'))}</span>`
        + `<button class="agri-history-clear-btn" type="button" data-agri-clear-all="1"><span class="material-symbols-outlined">delete_sweep</span><span>${esc(t('agri_clear_all'))}</span></button></div>`
        + `<div class="agri-sessions-list">`
        + sessions.map((sess) => {
            const isCur = sess.id === (activeSession && activeSession.id);
            const msgCount = (sess.messages && sess.messages.length) || 0;
            return `<div class="agri-session-card${isCur ? ' current' : ''}" data-agri-load-session="${esc(sess.id)}">`
              + `<div class="agri-session-main">`
              + `<div class="agri-session-title">${esc(sess.title || t('agri_title'))}</div>`
              + `<div class="agri-session-meta"><span>${esc(fmtSessionTime(sess.updatedAt || sess.createdAt))}</span><span>•</span><span>${msgCount} ${msgCount === 1 ? 'msg' : 'msgs'}</span></div>`
              + `</div>`
              + `<button class="agri-session-del" type="button" data-agri-del-session="${esc(sess.id)}" aria-label="${esc(t('agri_clear_all'))}"><span class="material-symbols-outlined">delete</span></button>`
              + `</div>`;
          }).join('')
        + `</div></div>`;
    }
    return `<div class="agri-history-drawer" id="agrihistorydrawer"><div class="agri-history-empty">${esc(t('agri_no_history'))}</div></div>`;
  };

  /* ---------- Contextual Dynamic Quick Replies ---------- */
  U.getRelevantQuickReplies = (activeSession) => {
    const isHi = (E.i18n && E.i18n.lang) === 'hi';
    const s = U.snapshot || {};
    const a = U.analysis || {};
    const p = U.profile || {};
    const cropId = p.cropId || 'bajra';
    const crop = E.getCrop(cropId);
    const cropName = isHi ? crop.name_hi : crop.name_en;

    const msgs = (activeSession && activeSession.messages) ? activeSession.messages : [];
    const recentText = msgs.slice(-4).map((m) => (m.text || '').toLowerCase()).join(' ');

    const has = (...words) => words.some((w) => recentText.includes(w.toLowerCase()));

    const isWater = has('water', 'pani', 'paani', 'पानी', 'moist', 'nami', 'नमी', 'dry', 'सूखा', 'sinchai', 'सिंचाई', 'irrigate');
    const isPump = has('pump', 'motor', 'मोटर', 'पंप', 'turn on', 'start', 'stop', 'chalu', 'चालू', 'auto');
    const isRain = has('rain', 'barish', 'बारिश', 'weather', 'mausam', 'मौसम', 'cloud', 'बादल', 'spray', 'storm', 'toofan');
    const isHeat = has('heat', 'garmi', 'गर्मी', 'temperature', 'tapman', 'तापमान', 'hot', 'sun', 'धूप');
    const isPest = has('pest', 'keet', 'कीट', 'yellow', 'पीले', 'leaf', 'leaves', 'patte', 'पत्ते', 'rog', 'रोग', 'spray', 'छिड़काव', 'neem', 'नीम', 'keeda', 'कीड़ा');
    const isFert = has('fert', 'खाद', 'urea', 'यूरिया', 'dap', 'डीएपी', 'potash', 'dose', 'matra', 'मात्रा', 'npk', 'soil', 'mitti');
    const isMandi = has('mandi', 'मंडी', 'bhav', 'भाव', 'rate', 'रेट', 'price', 'daam', 'market', 'enam', 'sell', 'harvest');

    if (isPest) {
      return [
        { icon: 'pest_control', q: isHi ? 'नीम तेल की कितनी मात्रा छिड़कें?' : 'Neem oil spray dose?' },
        { icon: 'science', q: isHi ? 'क्या यह नाइट्रोजन की कमी है?' : 'Is it nitrogen deficiency?' },
        { icon: 'eco', q: isHi ? 'जैविक कीटनाशक कैसे बनाएं?' : 'How to make bio-pesticide?' },
        { icon: 'water_drop', q: isHi ? 'क्या अधिक पानी से पत्ते पीले हैं?' : 'Are leaves yellow from overwatering?' },
        { icon: 'photo_camera', q: isHi ? 'कैमरा खोलकर फसल दिखाएं' : 'Open Crop Camera to inspect' }
      ];
    }
    if (isFert) {
      return [
        { icon: 'science', q: isHi ? `${cropName} में यूरिया कब डालें?` : `When to apply Urea for ${cropName}?` },
        { icon: 'balance', q: isHi ? 'डीएपी और एनपीके में कौन सा बेहतर?' : 'DAP vs NPK: which is better?' },
        { icon: 'yard', q: isHi ? 'मिट्टी का pH कैसे सुधारें?' : 'How to balance soil pH?' },
        { icon: 'water_drop', q: isHi ? 'खाद के बाद पानी देना ज़रूरी है?' : 'Is irrigation needed after fertilizer?' },
        { icon: 'eco', q: isHi ? 'गोबर या जैविक खाद के क्या लाभ हैं?' : 'Benefits of organic manure?' }
      ];
    }
    if (isWater || isPump) {
      const pRunning = U.pump && U.pump.status && U.pump.status().running;
      return [
        pRunning
          ? { icon: 'stop', q: isHi ? 'मोटर बंद करें' : 'Turn off pump' }
          : { icon: 'play_arrow', q: isHi ? 'मोटर चालू करें' : 'Turn on pump' },
        { icon: 'schedule', q: isHi ? 'कितने घंटे पानी देना चाहिए?' : 'How many hours to irrigate?' },
        { icon: 'rainy', q: isHi ? 'क्या आज बारिश की संभावना है?' : 'Is rain expected today?' },
        { icon: 'settings', q: isHi ? 'ऑटो सिंचाई मोड चालू करें' : 'Enable auto irrigation mode' },
        { icon: 'eco', q: isHi ? `${cropName} के लिए सही नमी कितनी?` : `Optimal moisture for ${cropName}?` }
      ];
    }
    if (isRain) {
      return [
        { icon: 'pest_control', q: isHi ? 'क्या बारिश से पहले छिड़काव करें?' : 'Should I spray before rain?' },
        { icon: 'water_drop', q: isHi ? 'क्या आज सिंचाई रोक दें?' : 'Should I hold irrigation today?' },
        { icon: 'cloud', q: isHi ? 'अगले 3 दिन का मौसम कैसा रहेगा?' : '3-day weather forecast?' },
        { icon: 'eco', q: isHi ? `बारिश से ${cropName} को नुकसान?` : `Will rain damage ${cropName}?` }
      ];
    }
    if (isHeat) {
      return [
        { icon: 'water_drop', q: isHi ? 'गर्मी में हल्की सिंचाई करें?' : 'Light irrigation for heat relief?' },
        { icon: 'wb_sunny', q: isHi ? `तेज धूप से ${cropName} को कैसे बचाएं?` : `Protect ${cropName} from extreme heat?` },
        { icon: 'thermostat', q: isHi ? 'आज का अधिकतम तापमान क्या रहेगा?' : 'Today maximum temperature?' },
        { icon: 'eco', q: isHi ? 'क्या गर्मी से फूल/फल झड़ेंगे?' : 'Will heat cause flower drop?' }
      ];
    }
    if (isMandi) {
      return [
        { icon: 'storefront', q: isHi ? `eNAM पर ${cropName} का ताजा भाव?` : `Latest eNAM price for ${cropName}?` },
        { icon: 'grain', q: isHi ? 'कटाई के समय कितनी नमी होनी चाहिए?' : 'Moisture % needed at harvest?' },
        { icon: 'schedule', q: isHi ? `${cropName} की कटाई का सही समय?` : `Best time to harvest ${cropName}?` },
        { icon: 'local_shipping', q: isHi ? 'अनाज सुरक्षित रखने के उपाय?' : 'Grain storage protection tips?' }
      ];
    }

    // Default / Farm Telemetry-based recommendations
    const isDry = a.water && (a.water.level === 'high' || a.water.moistureBand === 'crit_dry' || a.water.moistureBand === 'low');
    const isHot = a.heat && a.heat.level === 'high';

    const defs = [];
    if (isDry) {
      defs.push({ icon: 'water_drop', q: isHi ? 'पानी कैसा है?' : 'Water status?' });
      defs.push({ icon: 'play_arrow', q: isHi ? 'मोटर चालू करें' : 'Turn on pump' });
    } else {
      defs.push({ icon: 'water_drop', q: isHi ? 'पानी कैसा है?' : 'Water status?' });
    }
    defs.push({ icon: 'rainy', q: isHi ? 'बारिश होगी?' : 'Rain forecast?' });
    defs.push({ icon: 'eco', q: isHi ? 'फसल कैसी है?' : 'Crop health?' });
    if (isHot) {
      defs.push({ icon: 'thermostat', q: isHi ? 'गर्मी से फसल को नुकसान?' : 'Heat stress check?' });
    } else {
      defs.push({ icon: 'science', q: isHi ? 'खाद मात्रा?' : 'Fertilizer dose?' });
    }
    defs.push({ icon: 'pest_control', q: isHi ? 'पत्ते पीले क्यों?' : 'Yellow leaves?' });
    defs.push({ icon: 'storefront', q: isHi ? 'मंडी भाव?' : 'Mandi price?' });
    return defs.slice(0, 5);
  };

  let chipBusy = false;

  // Compress any selected or captured image down to max 800px width/height JPEG
  // to keep storage compact (~30-50KB) and prevent localStorage quota issues.
  function compressImage(fileOrDataUrl, maxDim = 800, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Image load failed'));
      if (typeof fileOrDataUrl === 'string') {
        img.src = fileOrDataUrl;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(fileOrDataUrl);
      }
    });
  }

  // Stream text word-by-word into a message bubble with auto-scrolling
  function streamAgriReply(targetTxtEl, fullText, logEl, onDone) {
    if (!targetTxtEl || !fullText) {
      if (onDone) onDone();
      return;
    }
    const words = fullText.split(' ');
    let currentIdx = 0;
    targetTxtEl.textContent = '';
    const interval = setInterval(() => {
      if (currentIdx < words.length) {
        currentIdx += 1;
        targetTxtEl.textContent = words.slice(0, currentIdx).join(' ');
        if (logEl) logEl.scrollTop = logEl.scrollHeight;
      } else {
        clearInterval(interval);
        if (onDone) onDone();
      }
    }, 28);
  }

  async function resolveAgriAnswer(question, history, image, {readOnly = false, signal} = {}) {
    if (!readOnly && E.voice?.isActionIntent?.(question)) {
      const action = await E.voice.answerCommand(question, true);
      if (action) return action;
    }
    const fresh = U.snapshot && U.snapshot.source === 'mqtt' && !U.snapshot.stale;
    let reply = null;
    if (gemReady() && E.gemini?.generateAgriAnswer) {
      reply = await E.gemini.generateAgriAnswer(question, history,
        readOnly && !fresh ? null : U.snapshot, readOnly && !fresh ? null : U.analysis,
        U.profile, E.i18n.lang, image, {readOnly, signal});
    }
    if (!reply && !readOnly && E.voice?.answerCommand) {
      reply = await E.voice.answerCommand(question || 'yellow leaves pest check', true);
    }
    return reply;
  }

  U.answerHandsFree = async (question, session, signal) => {
    const id = session?.id;
    if (!id || chipBusy || signal.aborted) return null;
    const current = loadSessions().find(item => item.id === id);
    if (!current) return null;
    chipBusy = true;
    try {
      const answer = await resolveAgriAnswer(question, current.messages, null, {readOnly:true, signal});
      if (!answer || signal.aborted) return null;
      U.appendAgriMessage({who:'user', text:question}, id);
      U.appendAgriMessage({who:'agri', text:answer}, id);
      if (U.route === 'agri' && $('agristage')) {
        lastTalkSig = '';
        U.syncAgriUI();
      }
      return answer;
    } finally {
      chipBusy = false;
    }
  };

  // Handle queries from quick reply chips, text input, hands-free wake, or image inspection
  async function handleAgriQuery(q, imageBase64 = null, opts = {}) {
    if ((!q && !imageBase64) || chipBusy) return;
    chipBusy = true;
    const speakReply = !!(opts && opts.speakReply);
    const cur = U.getActiveAgriSession();

    // 1. Add user query to conversation
    U.appendAgriMessage({ who: 'user', text: q || '', image: imageBase64 });
    lastTalkSig = ''; // force talklog refresh
    if (U.syncAgriUI && $('agristage')) U.syncAgriUI();

    // 2. Append visual thinking indicator to talklog
    const logEl = $('agritalklog');
    if (logEl) {
      logEl.hidden = false;
      const empt = $('agriemptyprompt');
      if (empt) empt.hidden = true;
      const thinkDiv = document.createElement('div');
      thinkDiv.className = 'msg ag thinking';
      thinkDiv.id = 'agrithinking';
      thinkDiv.innerHTML = `<div class="msg-hd"><span class="msg-who">${U.icons.sparkle} Agri</span></div>`
        + `<div class="msg-txt"><span class="vwave" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>${esc(imageBase64 ? t('agri_analyzing_image') : t('agri_thinking_status'))}</span></div>`;
      logEl.appendChild(thinkDiv);
      logEl.scrollTop = logEl.scrollHeight;
    }

    try {
      // If live voice call is currently ongoing and no image attached, send to live session
      let liveInfo = null;
      try { liveInfo = E.voice && E.voice.callInfo && E.voice.callInfo(); } catch (_) {}
      if (!imageBase64 && liveInfo && liveInfo.active && !liveInfo.wakeCapturing && !liveInfo.wakeThinking) {
        const sent = await E.voice.sendChip(q);
        if (sent) {
          const th = $('agrithinking');
          if (th) th.remove();
          chipBusy = false;
          return;
        }
      }

      let ans = await resolveAgriAnswer(q, cur.messages, imageBase64).catch(() => null);
      if (!ans) ans = t('v_ans_unknown');

      // If hands-free or speakReply requested, start speaking reply immediately
      let speakPromise = null;
      if (speakReply && U.speak) {
        speakPromise = U.speak(ans);
      }

      // Remove thinking element and prepare streamed message bubble
      const th = $('agrithinking');
      if (th) th.remove();

      // Create streaming response container in talklog
      if (logEl) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'msg ag';
        msgDiv.innerHTML = `<div class="msg-hd"><span class="msg-who">${U.icons.sparkle} Agri</span></div><div class="msg-txt"></div>`;
        logEl.appendChild(msgDiv);
        const txtEl = msgDiv.querySelector('.msg-txt');

        await new Promise((resolve) => {
          streamAgriReply(txtEl, ans, logEl, resolve);
        });
      }

      // Append finalized Agri answer to session
      U.appendAgriMessage({ who: 'agri', text: ans });
      U.lastVoice = { q: q || '', a: ans, source: 'chat' };
      const cap = $('agricap');
      if (cap) cap.textContent = ans;

      // Update UI (refreshes talklog and dynamic quick replies)
      lastTalkSig = '';
      lastChipsSig = '';
      if (U.syncAgriUI && $('agristage')) U.syncAgriUI();

      const updatedLog = $('agritalklog');
      if (updatedLog) updatedLog.scrollTop = updatedLog.scrollHeight;

      if (speakPromise) {
        try { await speakPromise; } catch (_) {}
      }
    } finally {
      chipBusy = false;
    }
  }

  // Alias for backward compatibility with chip clicks
  function handleAgriChip(q) {
    return handleAgriQuery(q);
  }
  U.handleAgriQuery = handleAgriQuery;

  /* ---------- AGRI screen ---------- */
  const STATUS_KEY = {
    idle: 'agri_tap', connecting: 'agri_connecting', listening: 'voice_listening',
    thinking: 'agri_thinking', speaking: 'hero_advice_speaking', dictating: 'voice_listening'
  };

  const renderMsg = (m) => {
    const isUser = m.who === 'user';
    const srcHtml = (!isUser && m.sources && m.sources.length)
      ? `<div class="msg-sources"><span>${esc(t('sources_label'))}:</span> `
        + m.sources.map((s) => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title || 'Source')} ↗</a>`).join(' ')
        + `</div>`
      : '';
    const imgHtml = m.image
      ? `<div class="msg-img-wrap"><img src="${esc(m.image)}" alt="Crop inspection" class="msg-img"/></div>`
      : '';
    const sayAction = (!isUser && E.voice && E.voice.ttsSupported && m.text)
      ? `<button class="msg-say" type="button" data-say="${esc(m.text)}" aria-label="${esc(t('speak_label'))}">${IC.speaker}</button>`
      : '';
    return `<div class="msg ${isUser ? 'user' : 'ag'}">`
      + `<div class="msg-hd"><span class="msg-who">${isUser ? `${U.icons.user} Farmer` : `${U.icons.sparkle} Agri`}</span>${sayAction}</div>`
      + imgHtml
      + `<div class="msg-txt">${esc(m.text)}</div>`
      + srcHtml
      + `</div>`;
  };

  /* ---------- Agri AI Visual Insight Modes ---------- */
  const AGRI_MODES = [
    { id: 'doctor', icon: 'medical_services', titleKey: 'agri_mode_doctor', descKey: 'agri_mode_doctor_desc', askActionKey: 'agri_ask_mode_action', queryText: 'फसल की बीमारी और पत्तियों का स्वास्थ्य कैसा है?' },
    { id: 'soil', icon: 'science', titleKey: 'agri_mode_soil', descKey: 'agri_mode_soil_desc', askActionKey: 'agri_ask_mode_action', queryText: 'मिट्टी में खाद और NPK का संतुलन कैसा है?' },
    { id: 'plant', icon: 'eco', titleKey: 'agri_mode_plant', descKey: 'agri_mode_plant_desc', askActionKey: 'agri_ask_mode_action', queryText: 'फसल की बढ़वार और विकास अवस्था कैसी है?' },
    { id: 'irrigation', icon: 'water_drop', titleKey: 'agri_mode_irrigation', descKey: 'agri_mode_irrigation_desc', askActionKey: 'agri_ask_mode_action', queryText: 'पानी की क्या स्थिति है और क्या मोटर चलाना चाहिए?' },
    { id: 'weather', icon: 'cyclone', titleKey: 'agri_mode_weather', descKey: 'agri_mode_weather_desc', askActionKey: 'agri_ask_mode_action', queryText: 'आज और आने वाले दिनों में मौसम व बारिश कैसी रहेगी?' },
    { id: 'market', icon: 'storefront', titleKey: 'agri_mode_market', descKey: 'agri_mode_market_desc', askActionKey: 'agri_ask_mode_action', queryText: 'फसल का मंडी भाव और कटाई का सही समय क्या है?' }
  ];

  U.activeAgriMode = U.activeAgriMode || 'doctor';

  U.renderAgriModesBar = () => {
    return `<div class="agri-modes-wrap" id="agrimodeswrap">`
      + `<div class="agri-modes-head">`
      + `<span class="mode-lbl"><span class="material-symbols-outlined">analytics</span><span>${esc(t('agri_modes_title'))}</span></span>`
      + `<span>${esc(t('agri_view_readings'))}</span>`
      + `</div>`
      + `<div class="agri-modes-bar">`
      + AGRI_MODES.map((m) => {
        const active = U.activeAgriMode === m.id;
        return `<button class="agri-mode-pill ${active ? 'active' : ''}" type="button" data-agri-mode="${m.id}" aria-pressed="${active}">`
          + `<span class="material-symbols-outlined">${m.icon}</span>`
          + `<span>${esc(t(m.titleKey))}</span>`
          + `</button>`;
      }).join('')
      + `</div>`
      + `<div id="agrimodewidgetslot">${U.renderAgriModeWidget(U.activeAgriMode)}</div>`
      + `</div>`;
  };

  U.renderAgriModeWidget = (modeId) => {
    const s = U.snapshot || {};
    const a = U.analysis || {};
    const p = U.profile || {};
    const pmp = U.pump ? U.pump.status() : { running: false };
    const crop = p.cropId && E.getCrop ? E.getCrop(p.cropId) : null;
    const isHi = (E.i18n && E.i18n.lang) === 'hi';
    const cropName = crop ? (isHi ? crop.name_hi : crop.name_en) : 'Crop';

    if (modeId === 'doctor') {
      const isWet = s.moisture != null && s.moisture > 38;
      const isHighHeat = s.tempC != null && s.tempC > 36;
      let statusClass = 'good';
      let statusWord = isHi ? 'फसल सुरक्षित' : 'Healthy';
      let diagnosis = isHi ? `${cropName} में कोई गंभीर लक्षण नहीं दिख रहे हैं।` : `No critical symptoms detected for ${cropName}.`;

      if (isWet) {
        statusClass = 'warn';
        statusWord = isHi ? 'जलभराव का जोखिम' : 'Moisture Risk';
        diagnosis = isHi ? 'मिट्टी में अत्यधिक नमी है — फफूंद व पत्तों के पीलेपन से बचाव के लिए 5ml नीम तेल/लीटर का छिड़काव करें।' : 'High soil moisture — spray 5ml/L Neem oil to guard against fungal blight and yellowing.';
      } else if (isHighHeat) {
        statusClass = 'warn';
        statusWord = isHi ? 'गर्मी का तनाव' : 'Heat Stress';
        diagnosis = isHi ? 'उच्च तापमान के कारण पत्तियां मुरझा सकती हैं। हल्की सिंचाई रखें।' : 'High temperatures may cause leaf wilting. Maintain light irrigation.';
      }

      return `<div class="agri-mode-widget" data-widget-mode="doctor">`
        + `<div class="agri-widget-header">`
        + `<div class="agri-widget-title"><span class="material-symbols-outlined">medical_services</span><span>${esc(t('agri_mode_doctor'))} · ${esc(cropName)}</span></div>`
        + `<span class="agri-widget-status-badge ${statusClass}">${esc(statusWord)}</span>`
        + `</div>`
        + `<div class="agri-widget-desc">${esc(diagnosis)}</div>`
        + `<div class="agri-widget-metrics">`
        + `<div class="agri-metric-box"><span class="metric-lbl">Plant Vigor</span><span class="metric-val">88%</span><span class="metric-sub">Chlorophyll est.</span></div>`
        + `<div class="agri-metric-box"><span class="metric-lbl">Pest Alert</span><span class="metric-val">Low</span><span class="metric-sub">Sucking insects</span></div>`
        + `<div class="agri-metric-box"><span class="metric-lbl">Neem Spray</span><span class="metric-val">5ml/L</span><span class="metric-sub">Biological safe</span></div>`
        + `</div>`
        + `<div class="agri-widget-actions">`
        + `<button class="agri-widget-btn primary" type="button" data-chip="पत्ते पीले क्यों हो रहे हैं और क्या उपचार करें?"><span class="material-symbols-outlined">psychiatry</span><span>${isHi ? 'पत्तियों की जांच पूछें' : 'Check Leaf Health'}</span></button>`
        + `<button class="agri-widget-btn" type="button" data-cam="1"><span class="material-symbols-outlined">photo_camera</span><span>${isHi ? 'कैमरा से दिखाएं' : 'Show with Camera'}</span></button>`
        + `</div>`
        + `</div>`;
    }

    if (modeId === 'soil') {
      const nVal = s.n ?? (a.nutrients ? a.nutrients.n : 'normal');
      const pVal = s.p ?? (a.nutrients ? a.nutrients.p : 'normal');
      const kVal = s.k ?? (a.nutrients ? a.nutrients.k : 'normal');
      const phVal = s.ph != null ? fmt1(s.ph) : '6.8';
      const moist = s.moisture != null ? Math.round(s.moisture) + '%' : '—';
      const statusClass = a.soilLevel === 'good' ? 'good' : (a.soilLevel === 'poor' ? 'bad' : 'warn');

      return `<div class="agri-mode-widget" data-widget-mode="soil">`
        + `<div class="agri-widget-header">`
        + `<div class="agri-widget-title"><span class="material-symbols-outlined">science</span><span>${esc(t('agri_mode_soil'))}</span></div>`
        + `<span class="agri-widget-status-badge ${statusClass}">${esc(a.soilLevel || 'Balanced')}</span>`
        + `</div>`
        + `<div class="agri-widget-desc">${isHi ? `मृदा उर्वरता स्तर संतुलित है। pH ${phVal} उपयुक्त सीमा में है।` : `Soil nutrient reserve is stable. Soil pH ${phVal} is in the optimal growth band.`}</div>`
        + `<div class="agri-widget-metrics">`
        + `<div class="agri-metric-box"><span class="metric-lbl">Nitrogen (N)</span><span class="metric-val">${esc(String(nVal))}</span><span class="metric-sub">Growth factor</span></div>`
        + `<div class="agri-metric-box"><span class="metric-lbl">Phosphorus (P)</span><span class="metric-val">${esc(String(pVal))}</span><span class="metric-sub">Root strength</span></div>`
        + `<div class="agri-metric-box"><span class="metric-lbl">Potassium (K)</span><span class="metric-val">${esc(String(kVal))}</span><span class="metric-sub">Disease barrier</span></div>`
        + `<div class="agri-metric-box"><span class="metric-lbl">Soil pH</span><span class="metric-val">${esc(phVal)}</span><span class="metric-sub">Neutral</span></div>`
        + `</div>`
        + `<div class="agri-widget-actions">`
        + `<button class="agri-widget-btn primary" type="button" data-chip="मिट्टी में खाद और यूरिया की सही मात्रा क्या डालें?"><span class="material-symbols-outlined">science</span><span>${isHi ? 'खाद की सलाह लें' : 'Fertilizer Advice'}</span></button>`
        + `</div>`
        + `</div>`;
    }

    if (modeId === 'plant') {
      const gdd = a.crop ? Math.round(a.crop.cumulativeGDD || 0) : 480;
      const stage = p.stage || (a.crop && a.crop.stage) || 'Vegetative';
      const pct = Math.min(100, Math.round((gdd / 1200) * 100));

      return `<div class="agri-mode-widget" data-widget-mode="plant">`
        + `<div class="agri-widget-header">`
        + `<div class="agri-widget-title"><span class="material-symbols-outlined">eco</span><span>${esc(t('agri_mode_plant'))} · ${esc(cropName)}</span></div>`
        + `<span class="agri-widget-status-badge good">${esc(stage)}</span>`
        + `</div>`
        + `<div class="agri-meter-row">`
        + `<div class="agri-meter-label-row"><span>Crop Growth Progress</span><span>${pct}% (${gdd} GDD)</span></div>`
        + `<div class="agri-meter-track"><div class="agri-meter-fill good" style="width:${pct}%"></div></div>`
        + `</div>`
        + `<div class="agri-widget-metrics">`
        + `<div class="agri-metric-box"><span class="metric-lbl">Crop Stage</span><span class="metric-val">${esc(stage)}</span><span class="metric-sub">Active vegetative</span></div>`
        + `<div class="agri-metric-box"><span class="metric-lbl">Thermal Units</span><span class="metric-val">${gdd}</span><span class="metric-sub">Growing Degree Days</span></div>`
        + `<div class="agri-metric-box"><span class="metric-lbl">Sunlight</span><span class="metric-val">${s.lux != null ? Math.round(s.lux) : 48000} lx</span><span class="metric-sub">Photosynthesis</span></div>`
        + `</div>`
        + `<div class="agri-widget-actions">`
        + `<button class="agri-widget-btn primary" type="button" data-chip="फसल की बढ़वार कैसी है और अगले चरण में क्या करें?"><span class="material-symbols-outlined">insights</span><span>${isHi ? 'फसल की सलाह लें' : 'Plant Advice'}</span></button>`
        + `</div>`
        + `</div>`;
    }

    if (modeId === 'irrigation') {
      const moist = s.moisture != null ? Math.round(s.moisture) : 28;
      const isWatering = pmp.running;
      const statusClass = moist < 22 ? 'bad' : (moist > 40 ? 'warn' : 'good');
      const statusWord = isWatering ? (isHi ? 'मोटर चालू है' : 'Pumping') : (moist < 22 ? (isHi ? 'पानी की आवश्यकता' : 'Needs Water') : (isHi ? 'नमी पर्याप्त' : 'Moisture Good'));

      return `<div class="agri-mode-widget" data-widget-mode="irrigation">`
        + `<div class="agri-widget-header">`
        + `<div class="agri-widget-title"><span class="material-symbols-outlined">water_drop</span><span>${esc(t('agri_mode_irrigation'))}</span></div>`
        + `<span class="agri-widget-status-badge ${statusClass}">${esc(statusWord)}</span>`
        + `</div>`
        + `<div class="agri-meter-row">`
        + `<div class="agri-meter-label-row"><span>Field Soil Moisture</span><span>${moist}%</span></div>`
        + `<div class="agri-meter-track"><div class="agri-meter-fill ${statusClass}" style="width:${Math.min(100, moist)}%"></div></div>`
        + `</div>`
        + `<div class="agri-widget-metrics">`
        + `<div class="agri-metric-box"><span class="metric-lbl">Soil Moisture</span><span class="metric-val">${moist}%</span><span class="metric-sub">Root depth zone</span></div>`
        + `<div class="agri-metric-box"><span class="metric-lbl">Pump Status</span><span class="metric-val">${isWatering ? 'ON' : 'OFF'}</span><span class="metric-sub">${pmp.mode || 'Auto'}</span></div>`
        + `<div class="agri-metric-box"><span class="metric-lbl">Low Threshold</span><span class="metric-val">20%</span><span class="metric-sub">Trigger start</span></div>`
        + `</div>`
        + `<div class="agri-widget-actions">`
        + `<button class="agri-widget-btn primary" type="button" data-chip="क्या मुझे आज सिंचाई करनी चाहिए?"><span class="material-symbols-outlined">water_drop</span><span>${isHi ? 'सिंचाई सलाह' : 'Irrigation Advice'}</span></button>`
        + `<button class="agri-widget-btn" type="button" data-pump-toggle="1"><span class="material-symbols-outlined">${isWatering ? 'stop' : 'play_arrow'}</span><span>${isWatering ? (isHi ? 'मोटर बंद करें' : 'Stop Pump') : (isHi ? 'मोटर चालू करें' : 'Start Pump')}</span></button>`
        + `</div>`
        + `</div>`;
    }

    if (modeId === 'weather') {
      const temp = s.tempC != null ? fmt1(s.tempC) + '°C' : '31.2°C';
      const hum = s.humidity != null ? Math.round(s.humidity) + '%' : '52%';
      const press = s.pressure != null ? Math.round(s.pressure) + ' hPa' : '1011 hPa';

      return `<div class="agri-mode-widget" data-widget-mode="weather">`
        + `<div class="agri-widget-header">`
        + `<div class="agri-widget-title"><span class="material-symbols-outlined">cyclone</span><span>${esc(t('agri_mode_weather'))}</span></div>`
        + `<span class="agri-widget-status-badge good">Microclimate Active</span>`
        + `</div>`
        + `<div class="agri-widget-desc">${isHi ? 'खेत का स्थानीय सूक्ष्म जलवायु सामान्य है। वाष्पोत्सर्जन संतुलित है।' : 'Field local microclimate sensors active. Transpiration stress is normal.'}</div>`
        + `<div class="agri-widget-metrics">`
        + `<div class="agri-metric-box"><span class="metric-lbl">Air Temp</span><span class="metric-val">${esc(temp)}</span><span class="metric-sub">Field sensor</span></div>`
        + `<div class="agri-metric-box"><span class="metric-lbl">Humidity</span><span class="metric-val">${esc(hum)}</span><span class="metric-sub">Relative</span></div>`
        + `<div class="agri-metric-box"><span class="metric-lbl">Barometer</span><span class="metric-val">${esc(press)}</span><span class="metric-sub">Atmosphere</span></div>`
        + `</div>`
        + `<div class="agri-widget-actions">`
        + `<button class="agri-widget-btn primary" type="button" data-chip="क्या आज बारिश होगी?"><span class="material-symbols-outlined">rainy</span><span>${isHi ? 'बारिश का पूर्वानुमान' : 'Rain Forecast'}</span></button>`
        + `</div>`
        + `</div>`;
    }

    if (modeId === 'market') {
      return `<div class="agri-mode-widget" data-widget-mode="market">`
        + `<div class="agri-widget-header">`
        + `<div class="agri-widget-title"><span class="material-symbols-outlined">storefront</span><span>${esc(t('agri_mode_market'))} · ${esc(cropName)}</span></div>`
        + `<span class="agri-widget-status-badge good">Mandi Live</span>`
        + `</div>`
        + `<div class="agri-widget-desc">${isHi ? `${cropName} का औसत मंडी भाव ₹2,150-2,450/क्विंटल स्थिर है। कटाई पर नमी 12% से कम रखें।` : `Average mandi rate for ${cropName} is around ₹2,150-2,450/qtl. Keep grain moisture under 12% for best price.`}</div>`
        + `<div class="agri-widget-metrics">`
        + `<div class="agri-metric-box"><span class="metric-lbl">Est. Price</span><span class="metric-val">₹2,350</span><span class="metric-sub">per quintal</span></div>`
        + `<div class="agri-metric-box"><span class="metric-lbl">Trend</span><span class="metric-val">+3.2%</span><span class="metric-sub">Weekly steady</span></div>`
        + `<div class="agri-metric-box"><span class="metric-lbl">Harvest Window</span><span class="metric-val">3-4 wks</span><span class="metric-sub">Maturity est.</span></div>`
        + `</div>`
        + `<div class="agri-widget-actions">`
        + `<button class="agri-widget-btn primary" type="button" data-chip="नजदीकी मंडी में आज का भाव क्या है और कब बेचना चाहिए?"><span class="material-symbols-outlined">payments</span><span>${isHi ? 'मंडी भाव पूछें' : 'Mandi Rates'}</span></button>`
        + `</div>`
        + `</div>`;
    }

    return '';
  };

  const buildCtxInner = () => {
    const nd = U.nodeInfo();
    const s = U.snapshot;
    const p = U.pump ? U.pump.status() : { running: false };
    return `<span>${nd.emoji} ${esc(nd.cropName)}</span>`
      + `<span>${U.icons.drop} ${s && s.moisture != null ? fmt1(s.moisture) + '%' : '—'}</span>`
      + `<span>${U.icons.heat} ${s && s.tempC != null ? fmt1(s.tempC) + '°C' : '—'}</span>`
      + `<span>${U.icons.pump} ${p.running ? esc(t('auto_watering')) : esc(t('auto_waiting'))}</span>`;
  };

  U.vAgri = () => {
    let info = { active: false, status: 'idle', conversation: [], camera: false, secs: 0 };
    try { if (E.voice && E.voice.callInfo) info = E.voice.callInfo(); } catch (_) { /* ignore */ }
    const live = info.active;
    const wakeOn = !!(E.voice && E.voice.wakeOn && E.voice.wakeOn());
    let stWord = !gemReady() && !live ? t('agri_offline') : t(STATUS_KEY[info.status] || 'agri_tap');
    if (!live && wakeOn) {
      stWord = E.voice?.wakeListening?.() ? t('wake_standby_ready') : t('agri_standby_enable');
    } else if (info.status === 'listening' && (info.wakeCapturing || !live)) {
      stWord = t('wake_listening_prompt');
    } else if (info.status === 'thinking' && info.wakeThinking) {
      stWord = t('agri_thinking');
    }

    const activeSession = U.getActiveAgriSession();
    const sessions = loadSessions();
    const msgs = (activeSession && activeSession.messages) ? activeSession.messages : [];

    const convHtml = `<div class="talklog" id="agritalklog" ${msgs.length ? '' : 'hidden'}>${msgs.map(renderMsg).join('')}</div>`
      + `<div class="agri-empty-prompt" id="agriemptyprompt" ${msgs.length ? 'hidden' : ''}><span class="material-symbols-outlined">psychiatry</span><h4>${esc(t('agri_chat_empty_title'))}</h4><p>${esc(t('agri_chat_empty_sub'))}</p></div>`;

    const dynamicChips = U.getRelevantQuickReplies(activeSession);
    const chipsHtml = dynamicChips
      .map((c) => `<button class="chipbtn" type="button" data-chip="${esc(c.q)}"><span class="material-symbols-outlined">${esc(c.icon)}</span><span>${esc(c.q)}</span></button>`).join('');

    let wake = '';
    try {
      if (E.voice && E.voice.wakeSupported && E.voice.wakeSupported()) {
        const on = E.voice.wakeOn && E.voice.wakeOn() && E.voice.wakeListening?.();
        const capturing = !!info.wakeCapturing;
        wake = `<button class="standby ${on ? 'on' : ''} ${capturing ? 'capturing' : ''}" id="agriwakebtn" type="button" data-wake-tap="1"><span class="pulsedot ${on ? 'on' : ''}"></span><span id="agriwakelbl">${esc(capturing ? t('voice_listening') : (on ? t('wake_standby') : t('wake_tap_enable')))}</span></button>`;
      }
    } catch (_) { /* ignore */ }

    const pillTxt = (live ? t('v_engine_online') : (gemReady() ? t('v_engine_online') : t('v_engine_offline'))) + (info.secs ? ` · ${info.secs}s` : '');

    return `<div class="screen-top"><h1 class="ptitle">${esc(t('voice_title'))}</h1></div>`
      + `<div class="agristage ${live ? 'live' : ''}" id="agristage" data-call-status="${esc(info.status || 'idle')}">`
      + `<div class="agri-toprow">`
      + `<span class="agripill" id="agripill"><span class="pulsedot ${live ? 'on' : ''}" id="agripilldot"></span><span id="agripilltxt">${esc(pillTxt)}</span></span>`
      + `${wake}`
      + `</div>`

      + `<div class="agri-ctx" id="agrictx" aria-label="${esc(t('agri_field_context'))}">`
      + buildCtxInner()
      + `</div>`

      + `<div class="orbwrap${live ? ' live' : ''}" id="orbwrap">`
      + `<div class="halo" aria-hidden="true"><span class="blob b1"><i></i></span><span class="blob b2"><i></i></span><span class="blob b3"><i></i></span></div>`
      + `<button class="orb ${live ? 'on' : ''}" id="agriorb" type="button" data-agri-talk="1" aria-label="${esc(live ? t('agri_end') : t('agri_tap_speak'))}">`
      + `<span class="agri-activation" aria-hidden="true"><i></i><i></i><i></i></span>`
      + `<span class="agri-emblem" aria-hidden="true"><svg viewBox="0 0 100 100" fill="none"><path d="M50 76V44" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M50 54C27 56 20 41 23 27c20-2 32 10 27 27Z" fill="currentColor" opacity=".9"/><path d="M50 44C48 25 63 16 78 19c0 19-9 29-28 25Z" fill="currentColor"/><path d="M28 77c12 8 32 8 44 0" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".65"/><circle cx="77" cy="61" r="4" fill="currentColor"/></svg></span><span class="agri-orbit orbit-a" aria-hidden="true"></span><span class="agri-orbit orbit-b" aria-hidden="true"></span>`
      + `<span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>`
      + `</button>`
      + `</div>`
      + `<div class="agri-wake-hint">${esc(E.voice?.wakeListening?.() ? E.voice.wakePhrase() : t('hf_talk'))}</div>`
      + `<div class="agrists" id="agrists">${esc(stWord)}</div>`
      + `<div class="agricap" id="agricap">${esc((U.lastVoice && U.lastVoice.a) || (wakeOn ? t('wake_standby_ready') : t('agri_tap_speak')))}</div>`

      + `<div class="agri-controls">`
      + `<button class="btn secondary" id="agricambtn" type="button" data-cam="1">${IC.cam} <span id="agricamlbl">${esc(info.camera ? t('agri_camera_close') : t('agri_camera_cta'))}</span></button>`
      + `<button class="btn secondary" type="button" data-replay="1">${IC.speaker} <span>${esc(t('agri_replay_audio'))}</span></button>`
      + `<button class="btn secondary" type="button" data-copy="1"><span>${esc(t('agri_copy_text'))}</span></button>`
      + `</div>`
      + `<div id="camslot" ${info.camera ? '' : 'hidden'}></div>`
      + `</div>`

      + U.renderAgriModesBar()

      + `<div class="card agri-chat-card">`
      + `<div class="agri-chat-header">`
      + `<div class="seclabel2" style="margin:0">${esc(t('ask_label'))}</div>`
      + `<div class="agri-chat-header-actions">`
      + `<button class="agri-hdr-btn" type="button" data-agri-new-chat="1" aria-label="${esc(t('agri_new_chat'))}"><span class="material-symbols-outlined">add</span><span>${esc(t('agri_new_chat'))}</span></button>`
      + `<button class="agri-hdr-btn${U.agriHistoryOpen ? ' active' : ''}" type="button" data-agri-toggle-history="1" aria-label="${esc(t('agri_prev_chats'))}"><span class="material-symbols-outlined">history</span><span>${esc(t('agri_prev_chats'))}</span>${sessions.length ? `<span class="agri-hist-count">${sessions.length}</span>` : ''}</button>`
      + `</div>`
      + `</div>`
      + `<div id="agrihistoryslot">${U.renderHistoryDrawer()}</div>`
      + convHtml
      + `<div class="agri-quick-box" id="agriquickbox">`
      + `<div class="agri-quick-hd"><span class="material-symbols-outlined">auto_awesome</span><span>${esc(t('agri_suggested_questions'))}</span></div>`
      + `<div class="chipgrid" id="agrichipgrid">${chipsHtml}</div>`
      + `</div>`
      + `<div id="agripreviewbar" style="display:none"></div>`
      + `<form class="agri-input-bar" id="agrichatform" onsubmit="return false;">`
      + `<input type="file" id="agri-img-input" accept="image/*" style="display:none" />`
      + `<button class="agri-bar-btn" id="btn-agri-upload" type="button" aria-label="${esc(t('agri_upload_image'))}"><span class="material-symbols-outlined">photo_camera</span></button>`
      + `<input type="text" id="agri-chat-input" class="agri-chat-input" placeholder="${esc(t('agri_type_placeholder'))}" maxlength="240" autocomplete="off" />`
      + `<button class="agri-bar-btn send" id="btn-agri-send" type="button" aria-label="${esc(t('agri_send_btn'))}"><span class="material-symbols-outlined">send</span></button>`
      + `</form>`
      + `</div>`;
  };

  // Surgical in-place updater for the Agri AI screen so talking/status/sensor
  // updates never blow away the DOM or reset CSS orb/wave animations.
  let lastTalkSig = '';
  let lastChipsSig = '';
  U.syncAgriUI = () => {
    const stage = $('agristage');
    if (!stage) return false;
    let info = { active: false, status: 'idle', conversation: [], camera: false, secs: 0 };
    try { if (E.voice && E.voice.callInfo) info = E.voice.callInfo(); } catch (_) { /* ignore */ }
    const live = !!info.active;
    const wakeOn = !!(E.voice && E.voice.wakeOn && E.voice.wakeOn());
    let stWord = !gemReady() && !live ? t('agri_offline') : t(STATUS_KEY[info.status] || 'agri_tap');
    if (!live && wakeOn) {
      stWord = E.voice?.wakeListening?.() ? t('wake_standby_ready') : t('agri_standby_enable');
    } else if (info.status === 'listening' && (info.wakeCapturing || !live)) {
      stWord = t('wake_listening_prompt');
    } else if (info.status === 'thinking' && info.wakeThinking) {
      stWord = t('agri_thinking');
    }

    stage.classList.toggle('live', live);
    stage.dataset.activation = E.voice?.handsFree?.state().status || 'disabled';
    stage.dataset.wakeState=E.voice?.wakeListening?.()?'standby':'off';
    const wakeHint = stage.querySelector('.agri-wake-hint');
    const wakeText = E.voice?.wakeListening?.() ? E.voice.wakePhrase() : t('hf_talk');
    if (wakeHint && wakeHint.textContent !== wakeText) wakeHint.textContent = wakeText;
    if (stage.dataset.callStatus !== (info.status || 'idle')) {
      stage.dataset.callStatus = info.status || 'idle';
    }

    const pillDot = $('agripilldot');
    if (pillDot) pillDot.classList.toggle('on', live);
    const pillTxtEl = $('agripilltxt');
    if (pillTxtEl) {
      const nextPill = (live ? t('v_engine_online') : (gemReady() ? t('v_engine_online') : t('v_engine_offline'))) + (info.secs ? ` · ${info.secs}s` : '');
      if (pillTxtEl.textContent !== nextPill) pillTxtEl.textContent = nextPill;
    }

    const wakeBtn = $('agriwakebtn');
    if (wakeBtn && E.voice && E.voice.wakeOn) {
      const wOn = !!E.voice.wakeOn() && !!E.voice.wakeListening?.();
      const capturing = !!info.wakeCapturing;
      wakeBtn.classList.toggle('on', wOn);
      wakeBtn.classList.toggle('capturing', capturing);
      const wDot = wakeBtn.querySelector('.pulsedot');
      if (wDot) wDot.classList.toggle('on', wOn);
      const wLbl = $('agriwakelbl');
      if (wLbl) {
        const nextWake = capturing ? t('voice_listening') : (wOn ? t('wake_standby') : t('wake_tap_enable'));
        if (wLbl.textContent !== nextWake) wLbl.textContent = nextWake;
      }
    }

    const ctxEl = $('agrictx');
    if (ctxEl) {
      const nextCtx = buildCtxInner();
      if (ctxEl.innerHTML !== nextCtx) ctxEl.innerHTML = nextCtx;
    }

    const orbWrap = $('orbwrap');
    if (orbWrap) orbWrap.classList.toggle('live', live);
    const orbBtn = $('agriorb');
    if (orbBtn) {
      orbBtn.classList.toggle('on', live);
      const nextAria = live ? t('agri_end') : t('agri_tap_speak');
      if (orbBtn.getAttribute('aria-label') !== nextAria) orbBtn.setAttribute('aria-label', nextAria);
    }

    const stsEl = $('agrists');
    if (stsEl && stsEl.textContent !== stWord) stsEl.textContent = stWord;

    const cameraSlot=$('camslot');if(cameraSlot)cameraSlot.hidden=!info.camera;
    const camLbl = $('agricamlbl');
    if (camLbl) {
      const nextCam = info.camera ? t('agri_camera_close') : t('agri_camera_cta');
      if (camLbl.textContent !== nextCam) camLbl.textContent = nextCam;
    }

    const activeSession = U.getActiveAgriSession();
    const msgs = (activeSession && activeSession.messages) ? activeSession.messages : [];
    const sig = msgs.length === 0 ? '__EMPTY__' : msgs.map((m) => `${m.who}:${m.text}:${m.image ? 'img' : ''}`).join('|');
    const logEl = $('agritalklog');
    const promptEl = $('agriemptyprompt');

    if (logEl && sig !== lastTalkSig) {
      lastTalkSig = sig;
      logEl.hidden = msgs.length === 0;
      if (promptEl) promptEl.hidden = msgs.length > 0;
      logEl.innerHTML = msgs.length ? msgs.map(renderMsg).join('') : '';
    }

    // Dynamic contextual quick replies sync
    const gridEl = $('agrichipgrid');
    if (gridEl) {
      const dynamicChips = U.getRelevantQuickReplies(activeSession);
      const chipsSig = dynamicChips.map((c) => c.q).join('|') + '|' + (E.i18n ? E.i18n.lang : '');
      if (chipsSig !== lastChipsSig) {
        lastChipsSig = chipsSig;
        gridEl.innerHTML = dynamicChips
          .map((c) => `<button class="chipbtn" type="button" data-chip="${esc(c.q)}"><span class="material-symbols-outlined">${esc(c.icon)}</span><span>${esc(c.q)}</span></button>`).join('');
      }
    }
    // History drawer & toggle button sync
    const histSlot = $('agrihistoryslot');
    const histBtn = document.querySelector('[data-agri-toggle-history]');
    const allSessions = loadSessions();
    if (histBtn) {
      histBtn.classList.toggle('active', !!U.agriHistoryOpen);
      let cntEl = histBtn.querySelector('.agri-hist-count');
      if (allSessions.length) {
        if (!cntEl) {
          cntEl = document.createElement('span');
          cntEl.className = 'agri-hist-count';
          histBtn.appendChild(cntEl);
        }
        cntEl.textContent = String(allSessions.length);
      } else if (cntEl) {
        cntEl.remove();
      }
    }
    if (histSlot) {
      histSlot.innerHTML = U.renderHistoryDrawer();
    }

    const widgetSlot = $('agrimodewidgetslot');
    if (widgetSlot && U.activeAgriMode) {
      widgetSlot.innerHTML = U.renderAgriModeWidget(U.activeAgriMode);
    }

    return true;
  };

  let meterTimer = 0;
  U.afterAgri = () => {
    clearInterval(meterTimer);
    lastTalkSig = '';
    // Re-attach camera video if active without clearing if already attached
    try {
      const slot = $('camslot');
      if (slot && E.voice && E.voice.cameraVideo) {
        const v = E.voice.cameraVideo();
        if (v && slot.firstChild !== v) {
          slot.innerHTML = '';
          slot.appendChild(v);
        } else if (!v && slot.firstChild) {
          slot.innerHTML = '';
        }
      }
    } catch (_) { /* ignore */ }

    meterTimer = setInterval(() => {
      if (U.route !== 'agri') { clearInterval(meterTimer); return; }
      try {
        const lv = E.gemini && E.gemini.audioLevels ? E.gemini.audioLevels() : { mic: 0, out: 0 };
        const v = Math.max(lv.mic || 0, lv.out || 0);
        const h = document.querySelector('#orbwrap .halo');
        if (h) h.style.setProperty('--lv', v.toFixed(2));
        // Keep call timer pill fresh without re-rendering
        const pillTxtEl = $('agripilltxt');
        if (pillTxtEl && E.voice && E.voice.callInfo) {
          const info = E.voice.callInfo();
          if (info.active) {
            const nextPill = t('v_engine_online') + (info.secs ? ` · ${info.secs}s` : '');
            if (pillTxtEl.textContent !== nextPill) pillTxtEl.textContent = nextPill;
          }
        }
      } catch (_) { /* ignore */ }
    }, 150);
  };

  /* ---------- cloud history fill ---------- */
  const fmtDbTime = (ts) => {
    try { return new Date(ts).toLocaleString(E.i18n.lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return String(ts || ''); }
  };
  const npkOf = (r) => {
    const n = r.n ?? r.nitrogen, p = r.p ?? r.phosphorus, k = r.k ?? r.potassium;
    if (n == null && p == null && k == null) return '—';
    return `N:${fmtInt(n)} P:${fmtInt(p)} K:${fmtInt(k)}`;
  };
  U.afterHistory = () => {
    const box = $('cloudbox');
    if (!box) return;
    if (!E.supabase || !E.supabase.isConfigured || !E.supabase.isConfigured()) return;
    const dev = U.mqtt ? U.mqtt.deviceId : null;
    box.innerHTML = `<div class="skel" style="height:36px;margin-bottom:8px">&nbsp;</div><div class="skel" style="height:36px;margin-bottom:8px">&nbsp;</div><div class="skel" style="height:36px">&nbsp;</div>`;
    E.supabase.fetchHistory(dev, 24).then((rows) => {
      if (U.route !== 'history') return;
      const el = $('cloudbox');
      if (!el) return;
      if (!rows || !rows.length) { el.innerHTML = `<p class="muted">${esc(t('hist_nodata'))}</p>`; return; }
      el.innerHTML = `<div class="tblwrap"><table class="datatable"><thead><tr><th>${U.icons.clock}</th><th>${U.icons.drop}</th><th>${U.icons.heat}</th><th>NPK</th><th>pH</th></tr></thead><tbody>`
        + rows.map((r) => `<tr><td>${esc(fmtDbTime(r.recorded_at))}</td><td>${esc(r.moisture == null ? '—' : fmt1(r.moisture) + '%')}</td><td>${esc(r.temp_c == null ? '—' : fmt1(r.temp_c) + '°')}</td><td>${esc(npkOf(r))}</td><td>${esc(r.ph == null ? '—' : fmt1(r.ph))}</td></tr>`).join('')
        + `</tbody></table></div>`;
    }).catch(() => { /* offline */ });
  };

  /* ---------- tap delegation: controls ---------- */
  document.addEventListener('click', (e) => {
    const cs = e.target.closest('[data-close-sheet]');
    if (cs) {
      const go = cs.dataset.go;
      U.closeSheet();
      if (go) U.go(go);
      return;
    }
    const cd = e.target.closest('[data-close-dlg]');
    if (cd) { U.closeDlg(); return; }
    const sh = e.target.closest('[data-say-hero]');
    if (sh) {
      const txt = U.heroAdvice || U.sayHome();
      U.speak(txt);
      return;
    }
    const talk = e.target.closest('[data-agri-talk]');
    if (talk) {
      try { E.voice.askOnce(); } catch (_) { U.toast(t('v_need_net')); }
      return;
    }
    const nc = e.target.closest('[data-agri-new-chat]');
    if (nc) { U.startNewAgriChat(); return; }
    const th = e.target.closest('[data-agri-toggle-history]');
    if (th) {
      U.agriHistoryOpen = !U.agriHistoryOpen;
      U.syncAgriUI();
      return;
    }
    const ds = e.target.closest('[data-agri-del-session]');
    if (ds) {
      e.stopPropagation();
      U.deleteAgriSession(ds.dataset.agriDelSession);
      return;
    }
    const ls = e.target.closest('[data-agri-load-session]');
    if (ls) {
      U.loadAgriSession(ls.dataset.agriLoadSession);
      return;
    }
    const ca = e.target.closest('[data-agri-clear-all]');
    if (ca) {
      U.clearAllAgriSessions();
      return;
    }
    const modeBtn = e.target.closest('[data-agri-mode]');
    if (modeBtn) {
      const modeId = modeBtn.dataset.agriMode;
      if (modeId && modeId !== U.activeAgriMode) {
        U.activeAgriMode = modeId;
        const allPills = document.querySelectorAll('.agri-mode-pill');
        allPills.forEach((p) => {
          const isAct = p.dataset.agriMode === modeId;
          p.classList.toggle('active', isAct);
          p.setAttribute('aria-pressed', String(isAct));
        });
        const slot = $('agrimodewidgetslot');
        if (slot) slot.innerHTML = U.renderAgriModeWidget(modeId);
      }
      return;
    }
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      handleAgriChip(chip.dataset.chip);
      return;
    }
    const rp = e.target.closest('[data-replay]');
    if (rp) { if (U.lastVoice && U.lastVoice.a) U.speak(U.lastVoice.a); return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      if (U.lastVoice && U.lastVoice.a && navigator.clipboard) {
        navigator.clipboard.writeText(U.lastVoice.a).then(() => U.toast(t('agri_copied_toast'))).catch(() => { /* ignore */ });
      }
      return;
    }
    const cam = e.target.closest('[data-cam]');
    if (cam) {
      try {
        if (E.voice && E.voice.toggleCamera) E.voice.toggleCamera();
        const slot = $('camslot');
        if (slot && E.voice && E.voice.cameraVideo) {
          const v = E.voice.cameraVideo();
          slot.innerHTML = '';
          if (v) slot.appendChild(v);
        }
        if (U.route === 'agri') U.syncAgriUI();
      } catch (_) { U.toast(t('v_err_cam')); }
      return;
    }
    const dv = e.target.closest('[data-drive]');
    if (dv) {
      if (U.rover) {
        try { U.rover.drive(dv.dataset.drive); } catch (_) { /* ignore */ }
      }
      return;
    }
    const rm = e.target.closest('[data-rover-mode]');
    if (rm && U.rover) {
      try { U.rover.setMode(rm.dataset.roverMode); } catch (_) { /* ignore */ }
      return;
    }
    const rsp = e.target.closest('[data-rover-speed]');
    if (rsp && U.rover) {
      try { U.rover.setSpeed(+rsp.dataset.roverSpeed, true); } catch (_) { /* ignore */ }
      return;
    }
    const rsc = e.target.closest('[data-rover-scan]');
    if (rsc && U.rover) {
      try { U.rover.scanSensors(); } catch (_) { /* ignore */ }
      return;
    }
    const dst = e.target.closest('[data-dose-step]');
    if (dst && U.dosing) {
      try { U.dosing.stepRate(dst.dataset.doseStep, +dst.dataset.delta); } catch (_) { /* ignore */ }
      return;
    }
    const dmd = e.target.closest('[data-dose-mode]');
    if (dmd && U.dosing) {
      try { U.dosing.setMode(dmd.dataset.doseMode, dmd.dataset.val); } catch (_) { /* ignore */ }
      return;
    }
    const dtg = e.target.closest('[data-dose-toggle]');
    if (dtg && U.dosing) {
      try { U.dosing.toggle(dtg.dataset.doseToggle); } catch (_) { /* ignore */ }
      return;
    }
    const drf = e.target.closest('[data-dose-refill]');
    if (drf && U.dosing) {
      try { U.dosing.refill(drf.dataset.doseRefill); } catch (_) { /* ignore */ }
      return;
    }
    const dsc = e.target.closest('[data-dose-sync-crop]');
    if (dsc && U.dosing && U.dosing.syncCropPrescription) {
      try { U.dosing.syncCropPrescription(true); } catch (_) { /* ignore */ }
      return;
    }
    const dar = e.target.closest('[data-dose-apply-rec]');
    if (dar && U.dosing && U.dosing.applyRecommended) {
      try { U.dosing.applyRecommended(dar.dataset.doseApplyRec); } catch (_) { /* ignore */ }
      return;
    }
    const pt = e.target.closest('[data-pump-toggle]');
    if (pt && U.pump) {
      try { U.pump.status().running ? U.pump.stop(true) : U.pump.start(true); } catch (_) { /* ignore */ }
      return;
    }
    const pm = e.target.closest('[data-pump-mode]');
    if (pm && U.pump) {
      try { U.pump.setMode(pm.dataset.pumpMode); } catch (_) { /* ignore */ }
      return;
    }
    const pp = e.target.closest('[data-pump-preset]');
    if (pp && U.pump) {
      try { U.pump.resetCropDefault(); } catch (_) { /* ignore */ }
      return;
    }
    const cf = e.target.closest('[data-pump-clear-fault]');
    if (cf && U.pump) {
      try { U.pump.clearFault(); } catch (_) { /* ignore */ }
      return;
    }
    const stp = e.target.closest('[data-step-input]');
    if (stp) {
      const inp = $(stp.dataset.stepInput);
      const delta = +stp.dataset.delta || 0;
      if (inp) {
        const cur = +inp.value || 0;
        inp.value = Math.max(0, Math.min(95, cur + delta));
      }
      return;
    }
    const ps = e.target.closest('[data-pump-save]');
    if (ps && U.pump) {
      const g = (id) => { const el = $(id); return el ? el.value : null; };
      try { U.pump.setThresholds(g('f-lo'), g('f-hi'), g('f-tp'), g('f-lx')); } catch (_) { /* ignore */ }
      return;
    }
    const cb = e.target.closest('#btn-cloud');
    if (cb) { U.afterHistory(); U.toast(t('hist_refresh')); return; }
  });

  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'f-speed') {
      if (U.rover) U.rover.setSpeed(+e.target.value || 150, true);
      else U.driveSpeed = +e.target.value || 150;
    }
    if (e.target && e.target.dataset && e.target.dataset.doseInput && U.dosing) {
      U.dosing.setRate(e.target.dataset.doseInput, e.target.value, false);
    }
    if (e.target && e.target.dataset && e.target.dataset.doseCalcOpt && U.dosing && U.dosing.setCalcOpt) {
      U.dosing.setCalcOpt(e.target.dataset.doseCalcOpt, e.target.value);
    }
  });

  document.addEventListener('agri-caption', (e) => {
    const cap = $('agricap');
    if (cap && e.detail) {
      const txt = (e.detail.a || e.detail.q || '').trim();
      if (txt && cap.textContent !== txt) cap.textContent = txt;
    }
  });
  document.addEventListener('voice-answer', (e) => {
    const d = e.detail;
    if (!d) return;
    if (d.q && d.q !== 'Agri' && d.q !== t('agri_title')) {
      U.appendAgriMessage({ who: 'user', text: d.q });
    }
    if (d.a) {
      U.appendAgriMessage({ who: 'agri', text: d.a, sources: d.sources });
      lastTalkSig = '';
      lastChipsSig = '';
    }
    if (U.route === 'agri') {
      U.syncAgriUI();
    }
  });
  document.addEventListener('agri-call', () => {
    U.renderVoiceBar();
    if (U.route === 'agri') U.syncAgriUI();
  });
  // Staged image for inspection before sending
  let stagedImage = null;
  function updatePreviewBar() {
    const bar = $('agripreviewbar');
    if (!bar) return;
    if (stagedImage) {
      bar.style.display = 'flex';
      bar.className = 'agri-input-preview-bar';
      bar.innerHTML = `<img src="${esc(stagedImage)}" class="agri-preview-thumb" alt="Preview"/>`
        + `<span>${esc(t('agri_image_attached'))}</span>`
        + `<button type="button" class="agri-preview-clear" id="agriclearpreview" aria-label="Remove image"><span class="material-symbols-outlined">close</span></button>`;
    } else {
      bar.style.display = 'none';
      bar.innerHTML = '';
    }
  }

  async function submitAgriText() {
    if (chipBusy) return;
    const inp = $('agri-chat-input');
    const text = (inp ? inp.value : '').trim();
    const img = stagedImage;
    if (!text && !img) return;
    if (inp) inp.value = '';
    stagedImage = null;
    updatePreviewBar();
    await handleAgriQuery(text, img);
  }

  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'agrichatform') {
      e.preventDefault();
      submitAgriText();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'agri-chat-input' && e.key === 'Enter') {
      e.preventDefault();
      submitAgriText();
    }
  });

  document.addEventListener('change', async (e) => {
    if (e.target && e.target.id === 'agri-img-input' && e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const compressed = await compressImage(file, 800, 0.75);
        stagedImage = compressed;
        updatePreviewBar();
      } catch (_) {
        U.toast(t('v_err_cam'));
      }
      e.target.value = '';
    }
  });

  document.addEventListener('click', (e) => {
    const dc = e.target.closest('[data-dictate]');
    if (dc) {
      const inp = $(dc.dataset.dictate);
      if (inp && E.voice && E.voice.sttSupported) { try { E.voice.dictate(inp); } catch (_) { /* ignore */ } }
      return;
    }
    const sendBtn = e.target.closest('#btn-agri-send');
    if (sendBtn) {
      submitAgriText();
      return;
    }
    const upBtn = e.target.closest('#btn-agri-upload');
    if (upBtn) {
      const fileInp = $('agri-img-input');
      if (fileInp) fileInp.click();
      return;
    }
    const clrBtn = e.target.closest('#agriclearpreview');
    if (clrBtn) {
      stagedImage = null;
      updatePreviewBar();
      return;
    }
  });
})();
