// Standby never uses remote recognition. Browser speech services are allowed
// only for a bounded question started by an explicit tap.
export const wakeLanguages = {
  en: ['en-US', 'Hey Agri', 'Hey Agri', 'Hi Agri', 'Hey Aggri', 'Hey Aggie', 'Hey A G R I'],
  hi: ['hi-IN', 'हे एग्री', 'हे एग्री', 'हे एगरी', 'हे अग्री', 'हे अगरी'],
  mr: ['mr-IN', 'हे एग्री', 'हे एग्री', 'हे अग्री'],
  gu: ['gu-IN', 'હે એગ્રી', 'હે એગ્રી', 'હે અગ્રી'],
  pa: ['pa-IN', 'ਹੇ ਅਗਰੀ', 'ਹੇ ਅਗਰੀ', 'ਹੇ ਐਗਰੀ'],
  ta: ['ta-IN', 'ஹே அக்ரி', 'ஹே அக்ரி', 'ஹாய் அக்ரி'],
  te: ['te-IN', 'హే అగ్రి', 'హే అగ్రి', 'హే ఎగ్రి'],
  kn: ['kn-IN', 'ಹೇ ಅಗ್ರಿ', 'ಹೇ ಅಗ್ರಿ'],
  bn: ['bn-IN', 'হে অ্যাগ্রি', 'হে অ্যাগ্রি', 'হে আগ্রি'],
  es: ['es-ES', 'Hola Agri', 'Hola Agri', 'Oye Agri'],
  fr: ['fr-FR', 'Salut Agri', 'Salut Agri', 'Bonjour Agri'],
  pt: ['pt-BR', 'Olá Agri', 'Olá Agri', 'Ola Agri', 'Oi Agri'],
  it: ['it-IT', 'Ciao Agri', 'Ciao Agri'],
  zh: ['zh-CN', '嘿阿格里', '嘿阿格里', '嘿 阿格里', '你好阿格里'],
  de: ['de-DE', 'Hallo Agri', 'Hallo Agri', 'Hey Agri'],
};

export const voiceTiming = { silenceMs: 850, questionMs: 12000, followUpMs: 8500, restartMs: 500 };

const wakePatterns = Object.fromEntries(Object.entries(wakeLanguages).map(([language, [,, ...aliases]]) => [
  language,
  aliases.map(alias => {
    const words = alias.split(/\s+/u).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const boundary = language === 'zh' ? '' : '(?=$|[\\p{Z}\\p{P}])';
    return new RegExp('^' + words.join('[\\p{Z}\\p{P}]+') + boundary, 'iu');
  }),
]));

export function matchWake(raw, language) {
  const phrase = String(raw || '').normalize('NFC').trim();
  for (const pattern of wakePatterns[language] || wakePatterns.en) {
    const matched = pattern.exec(phrase);
    if (matched) return phrase.slice(matched[0].length).replace(/^[\p{Z}\p{P}]+/u, '').trim();
  }
  return null;
}

export function createHandsFree({ language, audioBusy, speak, stopSpeech, answer, beginContext }) {
  const pref = 'enviroos.wake';
  const speechPref = 'enviroos.wake.spoken';
  function read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch { /* session only */ }
  }
  let enabled = read(pref) === '1';
  let spoken = read(speechPref) !== '0';
  let status = enabled ? 'initializing' : 'disabled';
  let error = '', notice = '', question = '', response = '', preview = '';
  let open = false, listening = false, fallback = false, canInstall = false, blocked = false;
  let permissionDenied = false, permissionState = null, installLanguage = null;
  let wakeLanguage = null, installedLocale = null, recognition = null, initializing = false;
  let generation = 0, check = 0, request = null, context = null, retries = 0;
  let limitTimer, silenceTimer, restartTimer, startTimer, afterRelease;
  const engine = () => {
    const standard = window.SpeechRecognition;
    const prefixed = window.webkitSpeechRecognition;
    return standard?.available ? standard : prefixed?.available ? prefixed : standard || prefixed;
  };
  const locale = lang => (wakeLanguages[lang] || wakeLanguages.en)[0];
  const state = () => ({
    enabled, spoken, status, error, notice, question, response, preview, open, listening, fallback, canInstall,
    supported: Boolean(engine()), phrase: wakeLanguage ? wakeLanguages[wakeLanguage][1] : '',
    selectedPhrase: (wakeLanguages[language()] || wakeLanguages.en)[1],
  });
  const emit = () => document.dispatchEvent(new CustomEvent('wake-state', {detail: state()}));
  function update(next, message = '') {
    status = next;
    error = message;
    emit();
  }
  function clearTimers() {
    clearTimeout(limitTimer);
    clearTimeout(silenceTimer);
    clearTimeout(restartTimer);
    clearTimeout(startTimer);
  }
  function stopRecognition(next) {
    listening = false;
    clearTimeout(startTimer);
    afterRelease = next;
    if (!recognition) {
      afterRelease = null;
      next?.();
      return;
    }
    if (recognition.stopping) return;
    recognition.stopping = true;
    try { recognition.rec.abort(); } catch { recognition = null; afterRelease = null; next?.(); }
  }
  function resetConversation() {
    generation++;
    open = false;
    question = response = preview = notice = '';
    context = null;
    clearTimers();
    request?.abort();
    request = null;
    if (status === 'speaking') stopSpeech();
  }
  function unavailable(reason) {
    blocked = true;
    clearTimers();
    stopRecognition();
    update('error', reason);
  }
  function dismiss() {
    resetConversation();
    update(enabled ? 'suspended' : 'disabled');
    stopRecognition(() => arm());
  }
  function suspend() {
    check++;
    initializing = false;
    resetConversation();
    stopRecognition();
    update(enabled ? 'suspended' : 'disabled');
  }
  function pauseForAudio() {
    // Shared TTS calls this after the hands-free controller enters Speaking.
    if (status === 'speaking' || status === 'processing') return;
    if (recognition || open) suspend();
  }
  function setEnabled(on) {
    enabled = Boolean(on);
    write(pref, enabled ? '1' : '0');
    if (!enabled) { suspend(); return false; }
    blocked = permissionDenied;
    retries = 0;
    if (blocked) update('error', 'hf_denied');
    else arm();
    return true;
  }
  function setSpoken(on) {
    spoken = Boolean(on);
    write(speechPref, spoken ? '1' : '0');
    if (!spoken && status === 'speaking') stopSpeech();
    emit();
  }
  async function availability(Recognition, lang) {
    let timer;
    try {
      return await Promise.race([
        Recognition.available({langs:[locale(lang)], processLocally:true}),
        new Promise(resolve => { timer = setTimeout(() => resolve('unavailable'), 4000); }),
      ]);
    } catch { return 'unavailable'; }
    finally { clearTimeout(timer); }
  }
  function arm() {
    if (!enabled || blocked || document.hidden || audioBusy() || open || initializing) return;
    if (recognition) {
      if (recognition.stopping && !afterRelease) afterRelease = arm;
      return;
    }
    const Recognition = engine();
    if (!Recognition?.available) {
      wakeLanguage = null;
      update('tap', 'hf_no_local');
      return;
    }
    const attempt = ++check;
    const selected = language();
    initializing = true;
    update('initializing');
    (async () => {
      const native = await availability(Recognition, selected);
      const english = selected === 'en' || native === 'available' ? native : await availability(Recognition, 'en');
      if (attempt !== check) return;
      initializing = false;
      if (document.hidden || audioBusy() || !enabled || open || recognition) return;
      wakeLanguage = native === 'available' ? selected : english === 'available' ? 'en' : null;
      installedLocale = native === 'available' ? locale(selected) : null;
      fallback = Boolean(wakeLanguage && wakeLanguage !== selected);
      installLanguage = native === 'downloadable' ? selected : english === 'downloadable' ? 'en' : null;
      canInstall = Boolean(Recognition.install && installLanguage);
      if (!wakeLanguage) { update('tap', 'hf_no_local'); return; }
      capture({ambient:true, lang:wakeLanguage, local:true});
    })();
  }
  async function install() {
    const Recognition = engine();
    if (!Recognition?.install || !installLanguage || initializing) return;
    const attempt = ++check;
    initializing = true;
    stopRecognition();
    update('initializing');
    try {
      const installed = await Recognition.install({langs:[locale(installLanguage)], processLocally:true});
      if (attempt !== check) return;
      initializing = false;
      if (!installed) { update('tap', 'hf_pack_failed'); return; }
      blocked = false;
      arm();
    } catch {
      if (attempt !== check) return;
      initializing = false;
      update('tap', 'hf_pack_failed');
    }
  }

  function startQuestion(followUp = false, explicit = false) {
    if (document.hidden || audioBusy() || status === 'processing' || status === 'speaking') return;
    if (permissionDenied) {
      open = true;
      update('error', 'hf_denied');
      return;
    }
    const wasOpen = open;
    if (!wasOpen) {
      generation++;
      context = beginContext();
      question = response = preview = notice = '';
    }
    open = true;
    blocked = false;
    const local = installedLocale === locale(language());
    if (!engine()) { update('error', 'hf_unsupported'); return; }
    if (!local && !explicit) { update('follow_up'); idleClose(); return; }
    clearTimers();
    update(followUp ? 'follow_up' : 'initializing');
    const turn = generation;
    stopRecognition(() => {
      if (turn === generation && open && !document.hidden) {
        capture({ambient:false, lang:language(), local, followUp});
      }
    });
  }
  function idleClose() {
    clearTimeout(limitTimer);
    limitTimer = setTimeout(dismiss, voiceTiming.followUpMs);
  }
  function retryStandby() {
    if (!enabled || blocked || ++retries > 2) {
      if (enabled && !blocked) unavailable('hf_interrupted');
      return;
    }
    restartTimer = setTimeout(arm, voiceTiming.restartMs);
  }
  function capture({ambient, lang, local, followUp = false, timed = false}) {
    if (recognition) return;
    let rec;
    try {
      rec = new (engine())();
      if (local && !('processLocally' in rec)) { update('tap', 'hf_no_local'); return; }
      if ('processLocally' in rec) rec.processLocally = local;
      rec.lang = locale(lang);
      rec.continuous = ambient;
      rec.interimResults = true;
    } catch { unavailable('hf_unsupported'); return; }
    const slot = {rec, stopping:false};
    recognition = slot;
    const turn = generation;
    let first = ambient ? -1 : 0;
    let wakeParts = 1;
    let finalText = '';
    let startedAt = null;
    const valid = () => recognition === slot && !slot.stopping && generation === turn;
    const send = () => {
      if (!valid() || !open || !finalText) return;
      clearTimers();
      const text = finalText;
      stopRecognition(() => { if (generation === turn && open) submit(text); });
      update('processing');
    };
    function startLimit() {
      clearTimeout(limitTimer);
      limitTimer = setTimeout(() => finalText ? send() : dismiss(),
        followUp ? voiceTiming.followUpMs : voiceTiming.questionMs);
    }
    if (!ambient || timed) startLimit();
    startTimer = setTimeout(() => unavailable('hf_interrupted'), 8000);
    rec.onstart = () => {
      if (!valid()) return;
      clearTimeout(startTimer);
      startedAt = performance.now();
      listening = true;
      update(timed ? 'wake_test' : ambient ? 'standby' : followUp ? 'follow_up' : 'listening');
    };
    rec.onresult = event => {
      if (!valid() || audioBusy()) return;
      retries = 0;
      const rows = Array.from(event.results || []);
      if (first < 0) {
        const changed = event.resultIndex || 0;
        for (let index = Math.max(0, changed - 1); index < rows.length; index++) {
          const current = rows[index][0]?.transcript || '';
          if (index >= changed && matchWake(current, lang) !== null) {
            first = index;
            break;
          }
          const next = rows[index + 1]?.[0]?.transcript;
          if (next && matchWake(current + ' ' + next, lang) !== null) {
            first = index;
            wakeParts = 2;
            break;
          }
        }
        if (first < 0) return;
        context = beginContext();
        open = true;
        question = response = preview = notice = '';
        startLimit();
        update('listening');
      }
      let interim = '';
      const finals = [];
      let index = first;
      if (ambient) {
        const wakeRows = rows.slice(first, first + wakeParts);
        const text = wakeRows.map(row => row[0]?.transcript || '').join(' ');
        const tail = matchWake(text, lang) ?? '';
        if (wakeRows.length === wakeParts && wakeRows.every(row => row.isFinal)) finals.push(tail);
        else interim += ' ' + tail;
        index += wakeParts;
      }
      for (; index < rows.length; index++) {
        const row = rows[index];
        const text = String(row[0]?.transcript || '').trim();
        if (row.isFinal) finals.push(text);
        else interim += ' ' + text;
      }
      finalText = finals.join(' ').trim();
      preview = (finalText + interim).trim();
      emit();
      clearTimeout(silenceTimer);
      if (finalText && !interim.trim()) silenceTimer = setTimeout(send, voiceTiming.silenceMs);
      // An English fallback wake phrase can open the popup. Switch subsequent
      // questions to the selected language rather than guessing at its audio.
      if (ambient && !timed && fallback && rows[first + wakeParts - 1]?.isFinal && !finalText && !interim.trim()) {
        clearTimers();
        stopRecognition(() => {
          if (open && generation === turn) { update('follow_up', 'hf_fallback_question'); idleClose(); }
        });
      }
    };
    rec.onerror = event => {
      if (!valid()) return;
      if (event.error === 'no-speech') return; // Handled by onend or the question deadline.
      const messages = {'not-allowed':'hf_denied', 'service-not-allowed':'hf_service',
        'audio-capture':'hf_microphone', 'network':'hf_recognition_network',
        'language-not-supported':'hf_language', 'aborted':'hf_interrupted'};
      if (event.error === 'not-allowed') {
        permissionDenied = permissionState !== 'granted';
        unavailable(permissionDenied ? 'hf_denied' : 'hf_service');
      } else unavailable(messages[event.error] || 'hf_interrupted');
    };
    rec.onend = () => {
      if (recognition !== slot) return;
      recognition = null;
      listening = false;
      clearTimeout(startTimer);
      if (slot.stopping) {
        const next = afterRelease;
        afterRelease = null;
        next?.();
        return;
      }
      clearTimers();
      if (generation !== turn || blocked) return;
      if (open && finalText) submit(finalText);
      else if (open && ambient && first >= 0 && (timed || !fallback)) startQuestion(false, timed);
      else if (open) dismiss();
      else {
        // Browsers end quiet or long-running recognition sessions normally.
        // Bound only consecutive short failures so foreground standby can recover.
        if (startedAt != null && performance.now() - startedAt > 2000) retries = 0;
        update('suspended');
        retryStandby();
      }
    };
    try { rec.start(); } catch { recognition = null; unavailable('hf_microphone'); }
  }

  async function submit(text) {
    if (!open || request || !text.trim()) return;
    question = text;
    preview = response = notice = '';
    const turn = generation;
    const controller = new AbortController();
    request = controller;
    update('processing');
    try {
      const reply = await answer(question, context, controller.signal);
      if (turn !== generation || controller.signal.aborted) return;
      if (!reply) { update('error', navigator.onLine === false ? 'hf_offline' : 'hf_answer_failed'); return; }
      response = reply;
      if (spoken) {
        update('speaking');
        let played = false;
        try { played = await speak(reply); } catch { /* text stays available */ }
        if (turn !== generation) return;
        if (!played) notice = 'hf_no_speech_output';
      }
      update('follow_up');
      restartTimer = setTimeout(() => {
        if (turn === generation && open && status === 'follow_up') startQuestion(true);
      }, 420);
    } catch {
      if (turn === generation && !controller.signal.aborted) {
        update('error', navigator.onLine === false ? 'hf_offline' : 'hf_answer_failed');
      }
    } finally {
      if (request === controller) request = null;
    }
  }
  document.addEventListener('visibilitychange', () => document.hidden ? suspend() : arm());
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', arm);
  if (navigator.permissions?.query) {
    navigator.permissions.query({name:'microphone'}).then(permission => {
      permissionState = permission.state;
      if (permission.state === 'denied') { permissionDenied = blocked = true; if (enabled) update('error', 'hf_denied'); }
      permission.addEventListener('change', () => {
        permissionState = permission.state;
        if (permission.state !== 'granted' && (recognition || open || enabled)) {
          permissionDenied = true;
          suspend();
          unavailable('hf_denied');
        } else if (permission.state === 'granted' && !recognition) {
          permissionDenied = blocked = false;
          arm();
        }
      });
    }).catch(() => {});
  }
  return {
    state, arm, install, suspend, pauseForAudio, setEnabled, setSpoken, dismiss,
    refreshLanguage() {
      suspend();
      wakeLanguage = installedLocale = null;
      fallback = canInstall = false;
      blocked = permissionDenied;
      if (blocked && enabled) update('error', 'hf_denied');
      else arm();
    },
    waitForRelease() {
      if (!recognition) return Promise.resolve(true);
      return new Promise(resolve => {
        const timeout = setTimeout(() => resolve(false), 1200);
        stopRecognition(() => { clearTimeout(timeout); resolve(true); });
      });
    },
    test() { startQuestion(false, true); },
    tryWake() {
      if (!enabled || permissionDenied || document.hidden || audioBusy() || !engine()) return;
      resetConversation();
      open = true;
      update('initializing');
      const turn = generation;
      stopRecognition(() => {
        if (open && generation === turn) capture({ambient:true, lang:language(), local:false, timed:true});
      });
    },
    retry() { if (question && open && status === 'error') submit(question); else startQuestion(false, true); },
    stopSpeech,
  };
}
