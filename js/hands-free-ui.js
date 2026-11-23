const E = EnviroOS;
const U = E.UI;
const voice = E.voice.handsFree;
const t = key => E.i18n.t(key);
const byId = id => document.getElementById(id);
const labels = {
  wake_test:'hf_trial_active', disabled:'hf_disabled', initializing:'hf_initializing', standby:'hf_standby',
  listening:'hf_listening', processing:'hf_processing', speaking:'hf_speaking',
  follow_up:'hf_follow_up', suspended:'hf_suspended', tap:'hf_talk', error:'hf_error',
};
const panel = byId('hands-free-panel');
let agriSignature;
let setupHint = false;
function put(id, text) {
  const element = byId(id);
  if (element && element.textContent !== text) element.textContent = text;
}
function label(state) {
  return t(labels[state.status] || 'hf_disabled');
}
function message(state) {
  if (state.status === 'wake_test') return t('hf_say').replace('{phrase}', state.selectedPhrase);
  if (state.error) return t(state.error);
  if (state.notice) return t(state.notice);
  if (state.status === 'standby') {
    const cue = t('hf_say').replace('{phrase}', state.phrase);
    return state.fallback ? cue + ' · ' + t('hf_english_fallback') : cue;
  }
  return state.status === 'follow_up' && !state.listening ? t('hf_follow_up_tap') : '';
}
function position() {
  if (panel.hidden) return;
  const header = document.querySelector('.hd');
  const headerBottom = Math.max(10, header?.getBoundingClientRect().bottom || 0);
  let preferred = headerBottom + 8;
  const frame = byId('rover-mission-control');
  if (U.route === 'rover' && frame) {
    const task = frame.contentDocument?.getElementById('roverTaskPanel');
    const rect = task?.getBoundingClientRect();
    if (rect) {
      const frameTop = frame.getBoundingClientRect().top;
      const taskTop = frameTop + rect.top;
      const taskBottom = frameTop + rect.bottom;
      // Keep the operational row, including Emergency stop, clear.
      if (taskBottom > preferred && taskTop < preferred + panel.offsetHeight
          && window.innerHeight - taskBottom > 130) preferred = taskBottom + 8;
    }
  }
  panel.style.setProperty('--hf-top', Math.ceil(preferred) + 'px');
}
U.handsFreeSettings = () => `
  <section class="hf-settings" aria-labelledby="hf-settings-title">
    <div class="setrow"><span><strong id="hf-settings-title">${t('hf_title')}</strong><small>${t('hf_intro')}</small></span>
      <button class="switch" id="hf-toggle" type="button" aria-label="${t('hf_title')}" aria-pressed="false"></button></div>
    <p id="hf-settings-status" class="muted" role="status"></p>
    <p id="hf-settings-phrase" class="muted"></p>
    <p class="muted">${t('hf_privacy')}</p>
    <div class="setrow"><span><strong>${t('hf_spoken')}</strong></span>
      <button class="switch" id="hf-spoken-toggle" type="button" aria-label="${t('hf_spoken')}" aria-pressed="true"></button></div>
    <div class="hf-actions">
      <button class="btn secondary sm" id="hf-test" type="button">${t('hf_test')}</button>
      <button class="btn secondary sm" id="hf-install" type="button" hidden>${t('hf_install')}</button>
    </div>
  </section>`;

U.refreshHandsFreeUI = () => {
  const state = voice.state();
  const badge = byId('btn-wake');
  badge.classList.toggle('on', state.enabled);
  badge.querySelector('.dot')?.classList.toggle('on', state.enabled);
  badge.setAttribute('aria-pressed', String(state.enabled));
  badge.setAttribute('aria-label', t('hf_title') + ' · ' + label(state));
  badge.title = message(state) || label(state);
  put('hf-badge-label', state.status === 'tap' ? t('hf_suspended') : label(state));
  const toggle = byId('hf-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(state.enabled));
    byId('hf-spoken-toggle').setAttribute('aria-pressed', String(state.spoken));
    byId('hf-install').hidden = !state.enabled || !state.canInstall;
    byId('hf-test').disabled = !state.supported || state.status === 'processing' || state.status === 'speaking';
    const canTestWake = state.status === 'standby' && state.listening;
    put('hf-test', t(canTestWake ? 'hf_test' : 'hf_talk'));
    if (state.error === 'hf_denied') byId('hf-test').disabled = true;
    put('hf-settings-status', [label(state), message(state)].filter(Boolean).join(' · '));
    put('hf-settings-phrase', state.phrase ? t('hf_wake_phrase') + ' “' + state.phrase + '”' :
      t('hf_wake_phrase') + ' “' + state.selectedPhrase + '” · ' + t('hf_phrase_unavailable'));
  }
  if (!state.enabled || state.status === 'standby') setupHint = false;
  const needsSetup = setupHint && !state.open && ['tap','error'].includes(state.status);
  panel.hidden = !state.open && !needsSetup;
  if (!panel.hidden) {
    panel.dataset.state = state.status;
    panel.dataset.listening = String(state.listening);
    put('hf-panel-title', 'Agri AI');
    put('hf-panel-status', label(state));
    put('hf-panel-note', message(state));
    put('hf-transcript', state.preview || state.question);
    put('hf-answer', state.response);
    byId('hf-transcript').hidden = !(state.preview || state.question);
    byId('hf-answer').hidden = !state.response;
    byId('hf-panel-note').hidden = !message(state);
    const answerBox = byId('hf-answer');
    if (state.response) {
      answerBox.setAttribute('aria-label', t('hf_answer_text'));
      answerBox.tabIndex = 0;
    }
    byId('hf-stop').hidden = state.status !== 'speaking';
    put('hf-stop', t('hf_stop'));
    byId('hf-retry').hidden = state.status !== 'error' || !state.question || !['hf_offline','hf_answer_failed'].includes(state.error);
    put('hf-retry', t('hf_retry'));
    byId('hf-talk').hidden = !state.supported || state.listening ||
      !['error','follow_up','tap'].includes(state.status) || state.error === 'hf_denied';
    put('hf-talk', t('hf_talk'));
    byId('hf-trial').hidden = !needsSetup || !state.supported || state.error === 'hf_denied';
    put('hf-trial', t('hf_trial'));
    byId('hf-popup-install').hidden = !needsSetup || !state.canInstall;
    put('hf-popup-install', t('hf_install'));
    byId('hf-dismiss').setAttribute('aria-label', t('close_label'));
    position();
  }
  const signature = [state.enabled, state.status, state.phrase].join('|');
  if (signature !== agriSignature) {
    agriSignature = signature;
    if (U.route === 'agri') U.syncAgriUI?.();
  }
};

document.addEventListener('wake-state', U.refreshHandsFreeUI);
document.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.matches('[data-wake-tap]')) {
    setupHint = !voice.state().enabled;
    voice.setEnabled(setupHint);
  } else if (target.id === 'hf-toggle') {
    voice.setEnabled(!voice.state().enabled);
  } else if (target.id === 'hf-spoken-toggle') {
    voice.setSpoken(!voice.state().spoken);
  } else if (target.id === 'hf-install') {
    voice.install();
  } else if (target.id === 'hf-test') {
    U.closeDlg();
    const state = voice.state();
    if (state.status === 'standby' && state.listening) U.toast(t('hf_say').replace('{phrase}', state.phrase));
    else voice.test();
  } else if (target.id === 'hf-dismiss') {
    const restore = panel.contains(document.activeElement);
    setupHint = false;
    voice.dismiss();
    if (restore) byId('btn-wake').focus({preventScroll:true});
  } else if (target.id === 'hf-stop') voice.stopSpeech();
  else if (target.id === 'hf-retry') voice.retry();
  else if (target.id === 'hf-talk') voice.test();
  else if (target.id === 'hf-popup-install') voice.install();
  else if (target.id === 'hf-trial') voice.tryWake();
});
panel.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.stopPropagation(); byId('hf-dismiss').click(); }
});
window.addEventListener('resize', position, {passive:true});
window.addEventListener('scroll', position, {passive:true});
new ResizeObserver(position).observe(panel);
window.addEventListener('message', event => {
  if (event.origin === location.origin &&
      event.source === byId('rover-mission-control')?.contentWindow &&
      event.data?.type === 'enviroos:rover-height') position();
});
