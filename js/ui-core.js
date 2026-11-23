/* EnviroOS — UI CORE (Ground-up Rework).
 * Owns: helpers, profile/theme/lang store, provider boot, pump control,
 * shell (header, 7-tab nav, voice bar, toast, sheet, dialog, command palette),
 * status presentation mapping, and global keyboard/tap delegation.
 * Reads ONLY the logic layer (window.EnviroOS.*).
 */
'use strict';
window.EnviroOS = window.EnviroOS || {};
(function () {
  const E = EnviroOS;
  const t = (k) => E.i18n.t(k);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt1 = (v) => (v == null || Number.isNaN(+v) ? '—' : (Math.round(+v * 10) / 10));
  const fmtInt = (v) => (v == null || Number.isNaN(+v) ? '—' : Math.round(+v));
  const $ = (id) => document.getElementById(id);

  const U = {
    route: 'home', snapshot: null, analysis: null, outlook: null,
    profile: null, provider: null, mqtt: null, mock: null, source: 'auto',
    heroAdvice: '', openSheetId: null, lastVoice: null, voiceState: 'idle',
    isSpeaking: false, speakingText: '', alertCount: 0,
    t, esc, fmt1, fmtInt, $
  };
  E.UI = U;

  /* ---------- Google Material Symbols / Icons ---------- */
  const MI = (name, cls) => `<span class="material-symbols-outlined ui-ic${cls ? ' ' + cls : ''}" aria-hidden="true">${name}</span>`;
  U.icons = {
    home: MI('home'),
    drop: MI('water_drop'),
    heat: MI('thermostat'),
    sun: MI('wb_sunny'),
    leaf: MI('eco'),
    cloud: MI('cloud'),
    rain: MI('rainy'),
    clock: MI('schedule'),
    mic: MI('mic'),
    pump: MI('mode_fan'),
    chev: MI('chevron_right'),
    check: MI('check'),
    warn: MI('warning'),
    speaker: MI('volume_up'),
    close: MI('close'),
    back: MI('arrow_back'),
    bell: MI('notifications'),
    farm: MI('agriculture'),
    gear: MI('settings'),
    cam: MI('videocam'),
    play: MI('play_arrow'),
    stop: MI('stop'),
    plus: MI('add'),
    minus: MI('remove'),
    refresh: MI('refresh'),
    wind: MI('air'),
    globe: MI('language'),
    chat: MI('chat'),
    up: MI('keyboard_arrow_up'),
    down: MI('keyboard_arrow_down'),
    cloudSun: MI('partly_cloudy_day'),
    storm: MI('thunderstorm'),
    sprout: MI('psychiatry'),
    grain: MI('grain'),
    flower: MI('local_florist'),
    sparkle: MI('auto_awesome'),
    bug: MI('pest_control'),
    flask: MI('science'),
    scale: MI('balance'),
    chart: MI('bar_chart'),
    flame: MI('local_fire_department'),
    trophy: MI('emoji_events'),
    user: MI('person'),
    node: MI('memory'),
    pin: MI('location_on'),
    thumbtack: MI('push_pin'),
    bookmark: MI('bookmark'),
    flag: MI('flag'),
    photo: MI('photo_camera'),
    send: MI('send'),
    rover: MI('smart_toy'),
    compost: MI('yard'),
    speed: MI('speed'),
    radar: MI('sensors'),
    battery: MI('battery_charging_full'),
    moon: MI('dark_mode'),
    sunMode: MI('light_mode'),
    store: MI('storefront'),
    cart: MI('shopping_cart'),
    market: MI('storefront'),
    device: MI('developer_board'),
    power: MI('power_settings_new')
  };

  /* ---------- Custom colour crop icons (one unique inline SVG per crop) ---------- */
  // Shapes are wrapped in <g stroke="none"> so generic `svg { stroke: ... }` theme rules never outline them.
  const CSVG = (id, body) => `<svg class="crop-svg crop-svg-${id}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g stroke="none">${body}</g></svg>`;
  const CROP_ICONS = {
    bajra: CSVG('bajra',
      '<path d="M12 22v-7" stroke="#4F8A3A" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
      + '<path d="M12 19.5c-3-.4-5.2-2.4-6.2-5.2 3.1.3 5.2 2.1 6.2 5.2z" fill="#6BAA4E"/>'
      + '<rect x="9.3" y="2" width="5.4" height="13.6" rx="2.7" fill="#C08A4A"/>'
      + '<g fill="#EBC48C"><circle cx="11" cy="4.6" r=".75"/><circle cx="13" cy="5.8" r=".75"/><circle cx="11" cy="7.4" r=".75"/><circle cx="13" cy="8.6" r=".75"/><circle cx="11" cy="10.2" r=".75"/><circle cx="13" cy="11.4" r=".75"/><circle cx="11.6" cy="13.2" r=".75"/></g>'),
    wheat: CSVG('wheat',
      '<path d="M12 22V6" stroke="#9A7B2A" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
      + '<g fill="#E9B44C"><ellipse cx="12" cy="4.4" rx="1.6" ry="2.6"/>'
      + '<ellipse cx="9.7" cy="8" rx="1.5" ry="2.5" transform="rotate(-32 9.7 8)"/><ellipse cx="14.3" cy="8" rx="1.5" ry="2.5" transform="rotate(32 14.3 8)"/>'
      + '<ellipse cx="9.7" cy="11.6" rx="1.5" ry="2.5" transform="rotate(-32 9.7 11.6)"/><ellipse cx="14.3" cy="11.6" rx="1.5" ry="2.5" transform="rotate(32 14.3 11.6)"/>'
      + '<ellipse cx="9.7" cy="15.2" rx="1.5" ry="2.5" transform="rotate(-32 9.7 15.2)"/><ellipse cx="14.3" cy="15.2" rx="1.5" ry="2.5" transform="rotate(32 14.3 15.2)"/></g>'),
    rice: CSVG('rice',
      '<path d="M7 21.5c0-5 2-8.2 5.2-10.2-1 4-2.4 7.2-5.2 10.2z" fill="#6BAA4E"/>'
      + '<path d="M6 22C7 14 11 8 17 4.6" stroke="#5E9440" stroke-width="1.5" stroke-linecap="round" fill="none"/>'
      + '<g fill="#F3E2A6" stroke="#C9A64E" stroke-width=".6"><ellipse cx="18.2" cy="7.2" rx="1.1" ry="1.8"/><ellipse cx="16.2" cy="9" rx="1.1" ry="1.8"/>'
      + '<ellipse cx="18.6" cy="10.6" rx="1.1" ry="1.8"/><ellipse cx="16.6" cy="12.4" rx="1.1" ry="1.8"/><ellipse cx="18.4" cy="14.1" rx="1.1" ry="1.8"/><ellipse cx="14.2" cy="10.6" rx="1.1" ry="1.8"/></g>'),
    maize: CSVG('maize',
      '<ellipse cx="12" cy="10" rx="3.7" ry="7.2" fill="#F4C430"/>'
      + '<path d="M9 7h6M8.5 10h7M9 13h6M10.6 3.6v12.8M13.4 3.6v12.8" stroke="#D49A12" stroke-width=".7" fill="none"/>'
      + '<path d="M12 22.5c-4-1-6.6-5-6.6-10.2 2.1 2 4.2 4.2 5.2 8.2z" fill="#6BAA4E"/>'
      + '<path d="M12 22.5c4-1 6.6-5 6.6-10.2-2.1 2-4.2 4.2-5.2 8.2z" fill="#4F8A3A"/>'
      + '<path d="M12 2.9c-.6-1-1.6-1.5-2.6-1.5M12 2.9c.6-1 1.6-1.5 2.6-1.5" stroke="#B5651D" stroke-width="1" stroke-linecap="round" fill="none"/>'),
    cotton: CSVG('cotton',
      '<path d="M12 22v-5" stroke="#7A5A3A" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
      + '<path d="M4.6 15.2l3.2-1.2 4.2 3 4.2-3 3.2 1.2-3.2 3.2H7.8z" fill="#8B5E3C"/>'
      + '<g fill="#FFFFFF" stroke="#B9C6D6" stroke-width=".8"><circle cx="8.4" cy="10.6" r="3.6"/><circle cx="15.6" cy="10.6" r="3.6"/><circle cx="12" cy="6.4" r="3.8"/><circle cx="12" cy="12.2" r="3.6"/></g>'),
    tomato: CSVG('tomato',
      '<circle cx="12" cy="13.6" r="7.6" fill="#E5483B"/>'
      + '<ellipse cx="9" cy="11.4" rx="1.6" ry="1" fill="#F7A097" transform="rotate(-30 9 11.4)"/>'
      + '<path d="M12 7.2L8 5.6l2 2.5-2.6 1.5 3.6-.4 1 2 1-2 3.6.4-2.6-1.5 2-2.5z" fill="#3E8E3E"/>'
      + '<path d="M12 7.4V3.4" stroke="#3E8E3E" stroke-width="1.5" stroke-linecap="round" fill="none"/>'),
    onion: CSVG('onion',
      '<path d="M12 8V2.2M12 8c-1-2-2.5-4-4-5M12 8c1-2 2.5-4 4-5" stroke="#4F8A3A" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
      + '<path d="M12 8c-4 2-6.5 5-6.5 8.2C5.5 19.6 8.4 22 12 22s6.5-2.4 6.5-5.8C18.5 13 16 10 12 8z" fill="#B5528C"/>'
      + '<path d="M12 9.6v12M9.2 11.6c-1.5 2-2 4-1.6 7M14.8 11.6c1.5 2 2 4 1.6 7" stroke="#E7A3C9" stroke-width=".8" fill="none"/>'
      + '<path d="M10.6 22l-.5 1.2M12 22v1.3M13.4 22l.5 1.2" stroke="#8B6B4A" stroke-width=".9" stroke-linecap="round" fill="none"/>'),
    chilli: CSVG('chilli',
      '<path d="M14 6.2c3 1 4 4 3 8-1 4-5 7.5-10 8.5-1 .2-1.2-.8-.4-1.2 4-2 6.5-5 7-9 .3-2.5-.3-4.5.4-6.3z" fill="#D7262E"/>'
      + '<path d="M15.4 9.2c.6 1.6.5 3.4-.2 5.2" stroke="#F27A7F" stroke-width=".9" stroke-linecap="round" fill="none"/>'
      + '<path d="M12.6 6.8c1-1.4 3.6-1.4 4.6.3" fill="#3E8E3E"/>'
      + '<path d="M14.6 6.4c0-2 1-3.5 2.5-4.5" stroke="#3E8E3E" stroke-width="1.7" stroke-linecap="round" fill="none"/>'),
    soybean: CSVG('soybean',
      '<path d="M4 17c0-6 6-12 13-13 2-.3 3 .7 2.7 2.7C18.7 13.6 12.7 19.7 6.7 19.7 5 19.7 4 18.7 4 17z" fill="#8DBE4F" stroke="#5C8F2E" stroke-width=".9"/>'
      + '<g fill="#D3E89B"><circle cx="8" cy="15.6" r="2.2"/><circle cx="11.6" cy="12" r="2.2"/><circle cx="15.2" cy="8.4" r="2.2"/></g>'
      + '<path d="M19.6 4.4l1.8-1.8" stroke="#5C8F2E" stroke-width="1.4" stroke-linecap="round" fill="none"/>'),
    potato: CSVG('potato',
      '<path d="M5 13c-.5-4 2.5-7.5 7-8 4.8-.5 8 2.4 7.8 6.4-.2 4.4-3.6 8.1-8.3 8.4C7.6 20 5.5 17 5 13z" fill="#C89B5E" stroke="#9C7240" stroke-width=".9"/>'
      + '<g fill="#8E6635"><ellipse cx="9" cy="10" rx=".9" ry=".6"/><ellipse cx="14.6" cy="9" rx=".9" ry=".6"/><ellipse cx="12" cy="14.4" rx=".9" ry=".6"/><ellipse cx="16.2" cy="13.8" rx=".9" ry=".6"/><ellipse cx="8.6" cy="15.4" rx=".9" ry=".6"/></g>'),
    grapes: CSVG('grapes',
      '<path d="M12 2.4v3.4" stroke="#6B5B3E" stroke-width="1.4" stroke-linecap="round" fill="none"/>'
      + '<path d="M12 4.6c1.5-2 4-2.6 6.2-1.6-1 2.1-3.6 3.1-6.2 1.6z" fill="#6BAA4E"/>'
      + '<g fill="#7B3FA0" stroke="#5B2A7A" stroke-width=".6"><circle cx="8" cy="8" r="2.3"/><circle cx="12" cy="8" r="2.3"/><circle cx="16" cy="8" r="2.3"/>'
      + '<circle cx="10" cy="11.8" r="2.3"/><circle cx="14" cy="11.8" r="2.3"/><circle cx="12" cy="15.6" r="2.3"/><circle cx="12" cy="19.4" r="2.1"/></g>'
      + '<g fill="#FFFFFF" opacity=".35"><circle cx="7.3" cy="7.2" r=".6"/><circle cx="11.3" cy="7.2" r=".6"/><circle cx="9.3" cy="11" r=".6"/><circle cx="11.3" cy="14.8" r=".6"/></g>'),
    olives: CSVG('olives',
      '<path d="M3 20.5C8 15.5 13 11 21 5.5" stroke="#6B5B3E" stroke-width="1.4" stroke-linecap="round" fill="none"/>'
      + '<g fill="#86A85F"><ellipse cx="7.6" cy="13.2" rx="1.3" ry="3.8" transform="rotate(-55 7.6 13.2)"/><ellipse cx="13.6" cy="6.4" rx="1.3" ry="3.8" transform="rotate(-25 13.6 6.4)"/><ellipse cx="19.4" cy="9.6" rx="1.2" ry="3.4" transform="rotate(-80 19.4 9.6)"/></g>'
      + '<ellipse cx="10.4" cy="17.4" rx="2.6" ry="3.4" fill="#4E6B2A" transform="rotate(-25 10.4 17.4)"/>'
      + '<ellipse cx="16.4" cy="13" rx="2.6" ry="3.4" fill="#6E8B3D" transform="rotate(-25 16.4 13)"/>'
      + '<g fill="#FFFFFF" opacity=".35"><ellipse cx="9.6" cy="16.2" rx=".6" ry="1"/><ellipse cx="15.6" cy="11.8" rx=".6" ry="1"/></g>')
  };
  U.cropEmoji = (id) => CROP_ICONS[id] || U.icons.sprout;
  U.cropIcon = U.cropEmoji;

  /* ---------- auth & account state ---------- */
  U.MODELS = [
    { id: 'enviro_basic', label: 'Enviro Basic', desc: 'Lightweight on-device monitoring node' },
    { id: 'enviro_pro', label: 'Enviro Pro', desc: 'Precision NPK + pump & climate automation' },
    { id: 'enviro_advanced', label: 'Enviro Advanced' },
    { id: 'rover', label: 'Rover', desc: 'Autonomous field robotics & spot-dosing' }
  ];
  U.getAuth = () => {
    try {
      const a = JSON.parse(localStorage.getItem('enviroos.auth') || 'null');
      if (a && a.name) return a;
    } catch (_) { /* ignore */ }
    return null;
  };
  U.saveAuth = (auth) => {
    try {
      if (auth) localStorage.setItem('enviroos.auth', JSON.stringify(auth));
      else localStorage.removeItem('enviroos.auth');
    } catch (_) { /* ignore */ }
  };
  U.auth = U.getAuth();

  U.modelName = value => U.MODELS.find(model => model.id ===
    String(value || '').trim().toLowerCase().replace(/ /g, '_'))?.label || '';
  U.deviceLabel = id => id === E.MQTT_SECOND_DEVICE
    ? U.modelName(U.auth?.assistantModel) || t('device_secondary')
    : U.modelName(U.auth?.mainModel) || t('device_main');
  U.hasRover = () => String(U.auth?.mainModel || '').trim().toLowerCase() === 'rover';

  /* ---------- second device state (read-only live connection) ---------- */
  U.isSecondDeviceOn = () => !!U.secondDevice?.status().online;
  U.setSecondDevicePower = on => on ? U.dlgConnectSecondDevice?.() : U.secondDevice?.pause();

  /* ---------- profile / theme / lang ---------- */
  const DEF_PROFILE = () => ({
    cropId: 'bajra', stage: 'vegetative', sizeValue: 2.5, pincode: '342001',
    node1: { cropId: 'bajra', stage: 'vegetative', sizeValue: 2.5 },
    node2: { cropId: 'wheat', stage: 'vegetative', sizeValue: 2.0 },
    onboarded: false
  });
  function loadProfile() {
    try {
      const p = JSON.parse(localStorage.getItem('enviroos.profile') || 'null');
      if (p && typeof p === 'object') {
        const d = DEF_PROFILE();
        return Object.assign(d, p, {
          node1: Object.assign({}, d.node1, p.node1 || {}),
          node2: Object.assign({}, d.node2, p.node2 || {})
        });
      }
    } catch (_) { /* ignore */ }
    return DEF_PROFILE();
  }
  U.saveProfile = () => { try { localStorage.setItem('enviroos.profile', JSON.stringify(U.profile)); } catch (_) { /* ignore */ } };
  U.isDark = () => document.documentElement.dataset.theme === 'dark';
  U.applyTheme = () => {
    let v = 'system';
    try { v = localStorage.getItem('enviroos.theme') || 'system'; } catch (_) { /* ignore */ }
    const sysDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const resolved = v === 'dark' || (v === 'system' && sysDark) ? 'dark' : 'light';
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePref = v;
    try {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', resolved === 'dark' ? '#070D06' : '#1B4D12');
    } catch (_) { /* ignore */ }
    const btnTheme = $('btn-theme');
    if (btnTheme) {
      btnTheme.innerHTML = resolved === 'dark' ? U.icons.sunMode : U.icons.moon;
      btnTheme.setAttribute('aria-pressed', resolved === 'dark' ? 'true' : 'false');
      btnTheme.title = resolved === 'dark' ? t('theme_light') : t('theme_dark');
    }
  };
  U.toggleTheme = () => {
    const next = U.isDark() ? 'light' : 'dark';
    try { localStorage.setItem('enviroos.theme', next); } catch (_) { /* ignore */ }
    U.applyTheme();
    U.toast(`${next === 'dark' ? U.icons.moon : U.icons.sunMode} ${t('display_title')}: ${t('theme_' + next)}`);
  };
  try {
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => U.applyTheme());
    }
  } catch (_) { /* ignore */ }
  U.applyI18n = () => {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const v = t(el.dataset.i18n);
      if (v && v !== el.dataset.i18n) el.textContent = v;
    });
    document.documentElement.lang = E.i18n.lang || 'hi';
  };

  // Active node info (per-node crop/stage/size overlay + hardware capability flags).
  U.nodeInfo = () => {
    const dev = (U.mqtt && U.mqtt.deviceId) || E.MQTT_DEFAULT_DEVICE;
    const is2 = U.source !== 'demo' && dev === E.MQTT_SECOND_DEVICE;
    const p = U.profile || {};
    const nd = is2 ? p.node2 : p.node1;
    const cropId = (nd && nd.cropId) || p.cropId || 'bajra';
    const crop = (E.getCrop && E.getCrop(cropId)) || (E.CROPS && E.CROPS.bajra) || { labelKey: 'crop_bajra', moistureLow: 20, moistureGood: 35 };
    const cropName = t(crop.labelKey || 'crop_bajra');
    return {
      isNode2: is2,
      hasNpk: !is2,
      hasMotor: !is2,
      deviceId: dev,
      cropId,
      crop,
      cropName,
      emoji: (U.cropEmoji ? U.cropEmoji(cropId) : '') || '🌾',
      stage: (nd && nd.stage) || p.stage || 'vegetative',
      sizeValue: (nd && nd.sizeValue) || p.sizeValue || 2.5,
      label: U.deviceLabel(dev),
      shortLabel: U.deviceLabel(dev)
    };
  };

  /* ---------- rich inline SVG sparkline ---------- */
  U.spark = (values, o) => {
    o = o || {};
    const w = o.w || 132, h = o.h || 42;
    const vs = (values || []).filter((v) => v != null && Number.isFinite(+v)).map(Number);
    if (vs.length < 2) return `<svg class="spark" width="${w}" height="${h}" aria-hidden="true"></svg>`;
    const min = Math.min(...vs), max = Math.max(...vs), span = (max - min) || 1;
    const padX = 5, padY = 6;
    const coords = vs.map((v, i) => [
      padX + (i / (vs.length - 1)) * (w - padX * 2),
      h - padY - ((v - min) / span) * (h - padY * 2)
    ]);
    const pts = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const last = coords[coords.length - 1];
    const areaPts = `${coords[0][0].toFixed(1)},${h - 2} ${pts} ${last[0].toFixed(1)},${h - 2}`;
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`
      + `<polygon points="${areaPts}" fill="currentColor" opacity="0.12"/>`
      + `<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="currentColor"/>`
      + `</svg>`;
  };

  /* ---------- toast / sheet / dialog ---------- */
  let toastTimer = 0;
  U.toast = (msg) => {
    const el = $('toast');
    if (!el) return;
    // Render our own Material icon spans as real icons; everything else is escaped text.
    const ICON_RE = /<span class="material-symbols-outlined ui-ic[^"]*" aria-hidden="true">([a-z_]+)<\/span>/g;
    const raw = String(msg == null ? '' : msg);
    let html = '', last = 0, m;
    while ((m = ICON_RE.exec(raw))) {
      html += esc(raw.slice(last, m.index)) + MI(m[1]);
      last = m.index + m[0].length;
    }
    html += esc(raw.slice(last));
    el.innerHTML = html;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  };
  U.openSheet = (html) => {
    $('sheet-body').innerHTML = html;
    $('sheet').classList.add('open');
    $('scrim').classList.add('open');
  };
  U.closeSheet = () => {
    U.openSheetId = null;
    $('sheet').classList.remove('open');
    $('scrim').classList.remove('open');
  };
  U.openDlg = (html) => {
    $('dlg-body').innerHTML = html;
    $('dlg-wrap').classList.add('open');
    wireDlg();
  };
  U.closeDlg = () => { $('dlg-wrap').classList.remove('open'); };
  U.isDlgOpen = () => $('dlg-wrap').classList.contains('open');

  U.updateSpeakButtons = () => {
    document.querySelectorAll('[data-say]').forEach((btn) => {
      const text = btn.dataset.say;
      const active = !!(U.isSpeaking && U.speakingText === text);
      btn.classList.toggle('speaking', active);
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      const ic = btn.querySelector('.btn-ic');
      if (ic) ic.innerHTML = active ? U.icons.stop : U.icons.speaker;
      const lbl = btn.querySelector('span:not(.btn-ic):not(.live-wave-mini)');
      if (lbl) {
        lbl.textContent = active ? t('hero_advice_stop') : (btn.dataset.label || t('speak_label'));
      }
    });
  };

  U.speak = async (text) => {
    if (!text) return;
    if (U.isSpeaking && U.speakingText === text) {
      U.stopAudio();
      return;
    }
    U.stopAudio();
    if (!E.voice || !E.voice.ttsSupported) {
      U.toast(t('v_err_tts'));
      return;
    }
    try {
      U.isSpeaking = true;
      U.speakingText = text;
      U.renderVoiceBar();
      U.updateSpeakButtons();
      await E.voice.speak(text);
    } catch (_) {
      U.toast(t('v_err_tts'));
    } finally {
      U.isSpeaking = false;
      U.speakingText = '';
      U.renderVoiceBar();
      U.updateSpeakButtons();
    }
  };
  U.stopAudio = () => {
    try { if (E.voice && E.voice.stopSpeak) E.voice.stopSpeak(); } catch (_) { /* ignore */ }
    U.isSpeaking = false;
    U.speakingText = '';
    U.renderVoiceBar();
    U.updateSpeakButtons();
  };
  U.renderVoiceBar = () => {
    const bar = $('voicebar');
    if (!bar) return;
    let call = { active: false, status: 'idle', secs: 0, wakeCapturing: false, wakeThinking: false };
    try { if (E.voice && E.voice.callInfo) call = E.voice.callInfo(); } catch (_) { /* ignore */ }
    if (U.isSpeaking) {
      bar.innerHTML = `<div class="vbar-in"><span class="vwave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`
        + `<span class="vbar-txt">${esc(t('hero_advice_speaking'))}</span>`
        + `<button class="vbar-btn stop" data-stop-audio="1" type="button">${U.icons.stop} <span>${esc(t('hero_advice_stop'))}</span></button></div>`;
      bar.classList.add('open');
    } else if (call.wakeCapturing) {
      bar.innerHTML = `<div class="vbar-in"><span class="vwave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`
        + `<span class="vbar-txt"><b>${esc(t('wake_badge_short'))}</b> · ${esc(t('wake_listening_prompt'))}</span>`
        + `<button class="vbar-btn" data-go="agri" type="button">${esc(t('nav_agri'))} ›</button></div>`;
      bar.classList.add('open');
    } else if (call.wakeThinking) {
      bar.innerHTML = `<div class="vbar-in"><span class="vwave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`
        + `<span class="vbar-txt"><b>${esc(t('wake_badge_short'))}</b> · ${esc(t('agri_thinking_status'))}</span>`
        + `<button class="vbar-btn" data-go="agri" type="button">${esc(t('nav_agri'))} ›</button></div>`;
      bar.classList.add('open');
    } else if (call.active && U.route !== 'agri') {
      bar.innerHTML = `<div class="vbar-in"><span class="vwave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`
        + `<span class="vbar-txt">Agri · ${esc(t('voice_listening'))}${call.secs ? ` (${call.secs}s)` : ''}</span>`
        + `<button class="vbar-btn" data-go="agri" type="button">${esc(t('nav_agri'))} ›</button>`
        + `<button class="vbar-btn stop" data-agri-talk="1" type="button">${esc(t('agri_end'))}</button></div>`;
      bar.classList.add('open');
    } else {
      bar.classList.remove('open');
      bar.innerHTML = '';
    }
  };

  // Plain-words summary builder for Home TTS.
  U.sayHome = () => {
    const s = U.snapshot, a = U.analysis;
    if (!s || !a) return '';
    const info = U.nodeInfo();
    const head = a.issues.length === 0 ? t('farm_looks_good') : `${a.issues.length} ${a.issues.length === 1 ? t('thing_to_check') : t('things_to_check')}`;
    return `${info.cropName}. ${head}. ${t('cond_water')} ${t(a.water.badgeKey)}. ${t('cond_heat')} ${t(a.heat.badgeKey)}. ${t('cond_soil')} ${t(a.nutrients.badgeKey)}.`;
  };

  /* ---------- status presentation (logic codes -> words) ---------- */
  U.statusOf = (id) => {
    const a = U.analysis;
    if (!a) return { tone: 'good', value: '', action: t('act_view') };
    if (id === 'water') {
      const l = a.water.level;
      if (l === 'unknown') return { tone: 'mute', value: t('st_unknown'), action: t('act_view') };
      const v = t(a.water.badgeKey);
      if (l === 'good') return { tone: 'good', value: v, action: t('act_view') };
      return { tone: l === 'high' ? 'bad' : 'warn', value: v, action: t('act_check_water') };
    }
    if (id === 'heat') {
      const l = a.heat.level;
      if (l === 'unknown') return { tone: 'mute', value: t('st_unknown'), action: t('act_view') };
      const v = t(a.heat.badgeKey);
      if (l === 'good') return { tone: 'good', value: v, action: t('act_view') };
      return { tone: l === 'high' ? 'bad' : 'warn', value: v, action: t('act_check_crop') };
    }
    if (id === 'soil') {
      if (a.soilLevel === 'unknown') return { tone: 'mute', value: t('st_unknown'), action: t('act_view') };
      const v = t(a.nutrients.badgeKey);
      if (a.soilLevel === 'good') return { tone: 'good', value: v, action: t('act_view') };
      return { tone: 'warn', value: v, action: t('act_check_nutrients') };
    }
    if (id === 'weather') {
      if (a.weather.level === 'good') return { tone: 'good', value: t('st_stable'), action: t('act_view') };
      if (a.weather.level === 'unknown') return { tone: 'mute', value: t('st_unknown'), action: t('act_view') };
      return { tone: 'warn', value: t('st_changing'), action: t('act_watch_weather') };
    }
    if (id === 'crop') return { tone: 'good', value: t('st_on_track'), action: t('act_view') };
    return { tone: 'good', value: t('st_good'), action: t('act_view') };
  };
  U.measureOf = (id) => {
    const s = U.snapshot;
    if (!s) return '—';
    if (id === 'water') return s.moisture == null ? '—' : `${fmt1(s.moisture)}%`;
    if (id === 'heat') return s.tempC == null ? '—' : `${fmt1(s.tempC)}°C`;
    if (id === 'soil') return s.n == null ? (s.ph != null ? `pH ${fmt1(s.ph)}` : '—') : `N:${fmtInt(s.n)} P:${fmtInt(s.p)} K:${fmtInt(s.k)}`;
    if (id === 'weather') return U.sunWord();
    return '';
  };
  U.sunWord = () => {
    const s = U.snapshot;
    if (!s || s.lux == null) return '—';
    const b = E.agri.lightBand(s.lux, E.getCrop(s.cropId));
    if (b === 'scorch') return t('st_sun_scorch');
    if (b === 'bright') return t('st_sun_bright');
    if (b === 'low') return t('st_sun_low');
    if (b === 'good') return t('st_sun_good');
    return t('st_unknown');
  };

  /* ---------- navigation (7 first-class routes) ---------- */
  U.go = (route) => {
    if (route === 'comm') route = 'home';
    if (route === 'robot') route = 'rover';
    if (route === 'rover' && !U.hasRover()) route = 'home';
    if (U.route === 'rover' && route !== 'rover') U.suspendRoverFrame?.();
    U.route = route;
    try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (_) { window.scrollTo(0, 0); }
    U.render();
    U.renderVoiceBar();
  };
  U._lastTabsKey = '';
  U.renderTabs = () => {
    const pumpOn = !!(U.pump && U.pump.status && U.pump.status().running);
    const rSt = (U.rover && U.rover.status) ? U.rover.status() : {};
    const dSt = (U.dosing && U.dosing.status) ? U.dosing.status() : {};
    const roverOn = !!(pumpOn || rSt.moving || rSt.mode === 'patrol' || (dSt.fertilizer && dSt.fertilizer.active) || (dSt.compost && dSt.compost.active) || (dSt.pesticide && dSt.pesticide.active));
    const cartCount = (U.marketCartCount && U.marketCartCount()) || 0;
    const node2On = U.isSecondDeviceOn ? U.isSecondDeviceOn() : true;
    const lang = (E.i18n && E.i18n.lang) || 'hi';
    const hasRover = U.hasRover();
    const key = `${U.route}|${roverOn}|${cartCount}|${node2On}|${lang}|${hasRover}|${U.auth?.mainModel}|${U.auth?.assistantModel}`;
    if (U._lastTabsKey === key && $('tabs') && $('tabs').children.length === (hasRover ? 8 : 7)) return;
    U._lastTabsKey = key;
    const defs = [
      ['home', 'nav_home', U.icons.home, ''],
      ['soil', 'nav_soil', U.icons.drop, ''],
      ['crop', 'nav_crop', U.icons.leaf, ''],
      ['weather', 'nav_weather', U.icons.cloud, ''],
      ['agri', 'nav_agri', U.icons.mic, 'agri-tab'],
      ['rover', 'nav_rover', U.icons.rover, roverOn ? 'pump-live' : ''],
      ['market', 'nav_market', U.icons.store || MI('storefront'), 'market-tab'],
      ['second-device', 'nav_second_device', U.icons.device || MI('developer_board'), 'device-tab'],
    ].filter(([id]) => id !== 'rover' || hasRover);
    const html = defs.map(([id, key, icon, cls]) =>
      `<button class="tab ${cls}" data-go="${id}" type="button" aria-selected="${U.route === id}" aria-label="${esc(id === 'second-device' ? U.deviceLabel(E.MQTT_SECOND_DEVICE) : t(key))}" title="${esc(id === 'second-device' ? U.deviceLabel(E.MQTT_SECOND_DEVICE) : t(key))}">`
      + `<span class="tab-pill">${icon}`
      + (id === 'rover' && roverOn ? '<span class="tab-dot" aria-hidden="true"></span>' : '')
      + (id === 'market' && cartCount > 0 ? `<span class="tab-dot" aria-hidden="true" style="background:#22C55E"></span>` : '')
      + (id === 'second-device' ? `<span class="tab-dot" aria-hidden="true" style="background:${node2On ? '#22C55E' : '#94A3B8'}"></span>` : '')
      + `</span>`
      + `<span class="tab-lbl">${esc(id === 'second-device' ? U.deviceLabel(E.MQTT_SECOND_DEVICE) : t(key))}</span></button>`
    ).join('');
    const tabsEl = $('tabs');
    if (tabsEl) {tabsEl.innerHTML = html;tabsEl.style.setProperty('--tab-count', String(defs.length));}
    const railEl = $('rail');
    if (railEl) railEl.innerHTML = html;
  };
  U.renderHead = () => {
    const info = U.nodeInfo();
    const elSub = $('brand-sub');
    if (elSub) {
      const userTag = (U.auth && U.auth.name) ? `${esc(U.auth.name)} • ` : '';
      elSub.innerHTML = `<span class="brand-sub-ic" aria-hidden="true">${info.emoji}</span><span>${userTag}${esc(info.cropName)} • ${esc(t('stage_' + info.stage))} • ${esc(U.profile.pincode || '342001')}</span>`;
    }
    const btnFarm = $('btn-farm');
    if (btnFarm) {
      if (U.auth && U.auth.name) {
        btnFarm.title = `${U.auth.name} (${U.auth.mainModel || 'Enviro Pro'})`;
      } else {
        btnFarm.title = t('profile_title');
      }
    }
    const model = U.modelName(info.isNode2 ? U.auth?.assistantModel : U.auth?.mainModel);
    const modelButton = $('btn-node');
    modelButton.title = model || t('device_main');
    modelButton.innerHTML = `<span aria-hidden="true" class="dot ${model ? 'on' : ''}"></span><span>${esc(model || t('device_main'))}</span>`;
    U.refreshHandsFreeUI?.();
    const langObj = E.i18n.LANGS.find((l) => l.id === E.i18n.lang) || {};
    $('btn-lang').innerHTML = `${U.icons.globe}<span>${esc(langObj.native || 'हिन्दी')}</span>`;
    const btnTheme = $('btn-theme');
    if (btnTheme) {
      const dark = U.isDark();
      btnTheme.innerHTML = dark ? U.icons.sunMode : U.icons.moon;
      btnTheme.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btnTheme.title = dark ? t('theme_light') : t('theme_dark');
    }
    $('btn-alerts').innerHTML = U.icons.bell + (U.alertCount > 0 ? `<span class="count">${U.alertCount}</span>` : '');
    const btnMarket = $('btn-market');
    if (btnMarket) {
      const cCount = (U.marketCartCount && U.marketCartCount()) || 0;
      btnMarket.innerHTML = (U.icons.store || MI('storefront')) + (cCount > 0 ? `<span class="count">${cCount}</span>` : '');
      btnMarket.title = t('nav_market') || 'Market';
      btnMarket.setAttribute('aria-label', t('nav_market') || 'Market');
      btnMarket.setAttribute('aria-pressed', U.route === 'market' ? 'true' : 'false');
    }
    $('btn-settings').innerHTML = U.icons.gear;
  };
  U._lastRoute = '';
  U._agriLang = '';
  U.render = () => {
    if (!U.hasRover()) {
      const roverFrame=$('rover-mission-control');
      if (roverFrame) {U.suspendRoverFrame?.();roverFrame.remove();}
      if (U.route === 'rover' || U.route === 'robot') U.route='home';
    }
    U.applyI18n();
    U.renderHead();
    U.renderTabs();
    const map = { home: 's-home', soil: 's-soil', crop: 's-crop', weather: 's-weather', history: 's-history', agri: 's-agri', robot: 's-rover', rover: 's-rover', market: 's-market', 'second-device': 's-second-device' };
    const el = $(map[U.route] || 's-home');
    const routeChanged = U._lastRoute !== U.route;
    U._lastRoute = U.route;

    // If already on Agri AI tab with same language, update in-place so the orb,
    // halo animations, camera video, and scroll never flicker or reset.
    if (!routeChanged && U.route === 'agri' && U._agriLang === E.i18n.lang && $('agristage') && U.syncAgriUI) {
      el.classList.add('active');
      U.syncAgriUI();
      return;
    }

    document.querySelectorAll('.screen').forEach((s) => {
      if (s !== el) s.classList.remove('active', 'enter');
    });
    // Keep the rover document alive across sensor refreshes and route changes.
    // Replacing it would interrupt camera streams, connection state and held controls.
    if (U.route === 'rover' && $('rover-mission-control')) {
      el.classList.add('active');
      U.resumeRoverFrame?.();
      return;
    }
    const fn = { home: U.vHome, soil: U.vSoil, crop: U.vCrop, weather: U.vWeather, history: U.vHistory, agri: U.vAgri, robot: U.vRover, rover: U.vRover, market: U.vMarket, 'second-device': U.vSecondDevice }[U.route] || U.vHome;
    try {
      el.innerHTML = fn();
    } catch (e) {
      console.error('Screen render error for route:', U.route, e);
      el.innerHTML = `<div class="card"><p class="muted">—</p></div>`;
    }
    el.classList.add('active');
    if (routeChanged) {
      el.classList.remove('enter');
      void el.offsetWidth;
      el.classList.add('enter');
    }
    if (U.route === 'rover') U.resumeRoverFrame?.();
    if (U.route === 'agri') {
      U._agriLang = E.i18n.lang;
      if (U.afterAgri) { try { U.afterAgri(); } catch (_) { /* ignore */ } }
    }
    if (U.route === 'history' && U.afterHistory) { try { U.afterHistory(); } catch (_) { /* ignore */ } }
  };

  /* ---------- Crop history log (persistent line-graph data, per node + crop) ----------
   * One compact row every 30 min: [t, moisture, tempC, humidity, lux, n, p, k, ph, gdd].
   * Kept for 31 days in localStorage, so the Crop tab history graphs survive reloads. */
  const CLOG_KEY = 'enviroos.croplog.v1';
  const CLOG_STEP = 30 * 60 * 1000;
  const CLOG_KEEP = 31 * 86400000;
  const CLOG_MAX_KEYS = 8;
  U.CLOG_FIELDS = ['moisture', 'tempC', 'humidity', 'lux', 'n', 'p', 'k', 'ph', 'gdd'];
  let clogCache = null;
  let clogSavedAt = 0;
  const clogLoad = () => {
    if (clogCache) return clogCache;
    try { clogCache = JSON.parse(localStorage.getItem(CLOG_KEY) || '{}') || {}; } catch (_) { clogCache = {}; }
    return clogCache;
  };
  const clogSave = (force) => {
    const now = Date.now();
    if (!force && now - clogSavedAt < 60000) return; // write at most once a minute
    clogSavedAt = now;
    try { localStorage.setItem(CLOG_KEY, JSON.stringify(clogCache || {})); } catch (_) { /* storage full: ignore */ }
  };
  const clogNum = (v, d) => (v == null || !Number.isFinite(+v)) ? null : Math.round(+v * d) / d;
  const clogRow = (ts, s, gdd) => [ts, clogNum(s.moisture, 10), clogNum(s.tempC, 10), clogNum(s.humidity, 10), clogNum(s.lux, 1),
    clogNum(s.n, 1), clogNum(s.p, 1), clogNum(s.k, 1), clogNum(s.ph, 100), clogNum(gdd, 10)];
  U.cropLogKey = () => { const i = U.nodeInfo(); return `${i.deviceId}|${i.cropId}`; };
  U.cropLogRows = (key) => clogLoad()[key || U.cropLogKey()] || [];
  U.cropLogRecord = (snap, analysis) => {
    if (!snap) return;
    const log = clogLoad();
    const key = U.cropLogKey();
    let rows = log[key] || [];
    const now = Date.now();
    // First time for this crop: backfill from the provider's 7-day daily series
    // so the graphs are useful immediately (today is recorded live below).
    if (!rows.length && snap.series) {
      const sr = snap.series;
      const len = Math.max((sr.moisture || []).length, (sr.temp || []).length, (sr.lux || []).length);
      for (let i = 0; i < len - 1; i++) {
        const ts = now - (len - 1 - i) * 86400000;
        rows.push(clogRow(ts, { moisture: (sr.moisture || [])[i], tempC: (sr.temp || [])[i], lux: (sr.lux || [])[i] }, (sr.gdd || [])[i]));
      }
    }
    const row = clogRow(now, snap, analysis && analysis.crop && snap.tempC != null ? analysis.crop.cumulativeGDD : null);
    const hasData = row.slice(1, 9).some((v) => v != null);
    const last = rows[rows.length - 1];
    // Same 30-min slot -> keep the newest reading in it; new slot -> new point.
    // Offline / empty snapshots are never recorded (no fake zero dips in the graphs).
    if (hasData) {
      if (last && Math.floor(last[0] / CLOG_STEP) === Math.floor(now / CLOG_STEP)) rows[rows.length - 1] = row;
      else rows.push(row);
    }
    rows = rows.filter((r) => now - r[0] <= CLOG_KEEP);
    log[key] = rows;
    const keys = Object.keys(log);
    if (keys.length > CLOG_MAX_KEYS) {
      keys.sort((a, b) => ((log[a].slice(-1)[0] || [0])[0]) - ((log[b].slice(-1)[0] || [0])[0]));
      keys.slice(0, keys.length - CLOG_MAX_KEYS).forEach((k) => { if (k !== key) delete log[k]; });
    }
    clogSave(!last && hasData);
  };
  U.cropLogClear = (key) => { const log = clogLoad(); delete log[key || U.cropLogKey()]; clogSave(true); };
  U.cropLogCsv = (key) => {
    const head = ['time'].concat(U.CLOG_FIELDS).join(',');
    const body = U.cropLogRows(key).map((r) => [new Date(r[0]).toISOString()].concat(r.slice(1).map((v) => (v == null ? '' : v))).join(','));
    return [head].concat(body).join('\n');
  };
  U.cropLogExport = () => {
    try {
      const info = U.nodeInfo();
      const blob = new Blob([U.cropLogCsv()], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `enviroos-${info.cropId}-history-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (_) { U.toast(t('chist_export_fail')); }
  };
  window.addEventListener('beforeunload', () => clogSave(true));

  /* ---------- providers ---------- */
  U.onSnap = (snap) => {
    U.snapshot = snap;
    try { U.analysis = E.agri.analyze(snap); } catch (_) { U.analysis = null; }
    try { U.cropLogRecord(snap, U.analysis); } catch (_) { /* ignore */ }
    U.alertCount = U.analysis ? U.analysis.issues.length : 0;
    try { if (E.supabase && E.supabase.isConfigured && E.supabase.isConfigured()) E.supabase.recordFromApp('auto'); } catch (_) { /* ignore */ }
    try { if (U.pump) U.pump.tick(); } catch (_) { /* ignore */ }
    try { if (U.dosing && U.dosing.syncAuto) U.dosing.syncAuto(); } catch (_) { /* ignore */ }
    U.refreshOutlook();
    try { if (U.ensureAdvice) U.ensureAdvice(); } catch (_) { /* ignore */ }
    U.render();
    if (U.openSheetId) { try { U.paintSheet(U.openSheetId); } catch (_) { /* ignore */ } }
  };
  let outlookFor = '';
  U.refreshOutlook = () => {
    const key = `${U.profile.pincode}|${U.snapshot ? Math.floor((U.snapshot.takenAt || 0) / 60000) : 0}`;
    if (key === outlookFor) return;
    outlookFor = key;
    if (!U.snapshot) return;
    E.liveWeather.getOutlook(U.profile, U.snapshot, U.analysis).then((o) => {
      U.outlook = o;
      if (U.route === 'weather' || U.route === 'home') U.render();
    }).catch(() => { /* offline */ });
  };
  U.useSource = (mode) => {
    U.source = mode;
    try { localStorage.setItem('enviroos.source', mode); } catch (_) { /* ignore */ }
    if (U.provider && U.provider.dispose) { try { U.provider.dispose(); } catch (_) { /* ignore */ } }
    U.provider = null;
    U.bootProvider();
  };
  U.bootProvider = () => {
    const wantLive = U.source !== 'demo';
    const startMock = () => {
      if (U.provider) return;
      U.mock = U.mock || new E.MockProvider(U.profile);
      U.mock.profile = U.profile;
      U.provider = U.mock;
      U.mqtt = null;
      U.provider.subscribe(U.onSnap);
    };
    if (!wantLive) { startMock(); return; }
    try {
      U.mqtt = new E.MqttProvider(U.profile);
      U.provider = U.mqtt;
      let gotFresh = false;
      const unsub = U.mqtt.subscribe((snap) => {
        if (snap && !snap.stale) gotFresh = true;
        U.onSnap(snap);
      });
      U._unsubLive = unsub;
      if (U.source === 'auto') {
        setTimeout(() => {
          if (!gotFresh && U.provider === U.mqtt) {
            try { U.mqtt.dispose(); } catch (_) { /* ignore */ }
            U.provider = null;
            startMock();
          }
        }, 12000);
      }
    } catch (_) { startMock(); }
  };
  U.bootProviderRefresh = () => {
    if (U.mock) {
      U.mock.profile = U.profile;
      if (U.onSnap) U.onSnap(U.mock.snapshot());
    } else if (U.mqtt) {
      U.mqtt.profile = U.profile;
      if (U.onSnap && U.mqtt.snapshot) U.onSnap(U.mqtt.snapshot());
    }
  };
  U.switchNode = (id) => {
    id = String(id || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    if (!id) return;
    if (U.source === 'demo' || !U.mqtt) {
      U.useSource('live');
    }
    if (U.mqtt) {
      U.mqtt.selectDevice(id);
      if (U.dosing && U.dosing.syncAuto) { try { U.dosing.syncAuto(); } catch (_) { /* ignore */ } }
      const nm = U.deviceLabel(id);
      U.toast(`${U.icons.check} ${t('node_switched_toast').replace('{name}', nm)}`);
      U.render();
    }
  };

  /* ---------- pump control (voice + UI share this) ---------- */
  function pumpStore() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('enviroos.pump') || 'null'); } catch (_) { /* ignore */ }
    return s && typeof s === 'object' ? s : {};
  }
  function pumpSave(s) { try { localStorage.setItem('enviroos.pump', JSON.stringify(s)); } catch (_) { /* ignore */ } }
  U.makePump = () => {
    const crop = E.getCrop(U.profile.cropId || 'bajra');
    const st = Object.assign({
      mode: 'auto', startBelow: crop.moistureLow || 20, stopAbove: crop.moistureGood || 35,
      tempAbove: null, luxAbove: null, maxRunMin: 30, dryWaitSec: 300,
      running: false, startedAt: 0, startMoisture: null, pausedUntil: 0, fault: null, log: []
    }, pumpStore());
    const save = () => pumpSave({
      mode: st.mode, startBelow: st.startBelow, stopAbove: st.stopAbove,
      tempAbove: st.tempAbove, luxAbove: st.luxAbove,
      maxRunMin: st.maxRunMin, dryWaitSec: st.dryWaitSec, log: st.log.slice(-10)
    });
    const pushLog = (key, fill) => {
      let msg = t(key);
      if (fill) for (const k of Object.keys(fill)) msg = msg.replace('{' + k + '}', fill[k]);
      const timeStr = new Date().toLocaleTimeString(E.i18n.lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit' });
      st.log.push({ t: Date.now(), time: timeStr, msg });
      st.log = st.log.slice(-10);
      save();
    };
    const motorSend = (on) => {
      if (U.mqtt && U.source !== 'demo') {
        try {
          if (on) { U.mqtt.sendMotor('forward', 150); }
          else { U.mqtt.sendMotor('stop'); }
        } catch (_) { /* ignore */ }
      }
    };
    const api = {
      status: () => ({
        available: true,
        running: !!st.running, mode: st.mode,
        startedAt: st.startedAt,
        moisture: U.snapshot ? U.snapshot.moisture : null,
        startBelow: st.startBelow, stopAbove: st.stopAbove,
        tempAbove: st.tempAbove, luxAbove: st.luxAbove,
        health: st.fault ? 'fault' : 'normal', fault: st.fault, log: st.log.slice()
      }),
      start: (manual) => {
        if (!U.nodeInfo().hasMotor && U.source !== 'demo') {
          U.toast(t('node_basic_motor_notice'));
          return { ok: false };
        }
        st.running = true; st.startedAt = Date.now(); st.fault = null;
        st.startMoisture = U.snapshot ? U.snapshot.moisture : null;
        if (manual) st.pausedUntil = Date.now() + 30 * 60 * 1000;
        motorSend(true);
        pushLog('ev_manual_on');
        U.toast(t('v_ans_pump_on'));
        U.render();
        return { ok: true };
      },
      stop: (manual) => {
        const was = st.running;
        st.running = false; st.startedAt = 0;
        if (manual) { st.pausedUntil = Date.now() + 30 * 60 * 1000; if (was) pushLog('ev_manual_off'); }
        motorSend(false);
        U.toast(t('v_ans_pump_off'));
        U.render();
        return { ok: true };
      },
      setMode: (m) => {
        if (m !== 'auto' && m !== 'manual') return { ok: false };
        st.mode = m; save();
        pushLog('ev_mode', { m: m === 'auto' ? t('mode_auto') : t('mode_manual') });
        U.render();
        return { ok: true };
      },
      setThresholds: (lo, hi, tp, lx) => {
        const plo = lo == null || lo === '' ? null : +lo;
        const phi = hi == null || hi === '' ? null : +hi;
        const nextLo = plo != null && Number.isFinite(plo) ? Math.max(5, Math.min(80, plo)) : st.startBelow;
        const nextHi = phi != null && Number.isFinite(phi) ? Math.max(10, Math.min(90, phi)) : st.stopAbove;
        if (!(nextLo < nextHi)) { U.toast(t('thresholds_invalid')); return { ok: false }; }
        st.startBelow = nextLo;
        st.stopAbove = nextHi;
        st.tempAbove = (tp == null || tp === '') ? null : +tp;
        st.luxAbove = (lx == null || lx === '' || +lx <= 0) ? null : +lx;
        save();
        pushLog('ev_thresholds', { lo: st.startBelow, hi: st.stopAbove });
        U.toast(`${U.icons.check} ${t('ev_thresholds').replace('{lo}', st.startBelow).replace('{hi}', st.stopAbove)}`);
        U.render();
        return { ok: true, lo: st.startBelow, hi: st.stopAbove, tempAbove: st.tempAbove, luxAbove: st.luxAbove };
      },
      resetCropDefault: () => {
        const c = U.nodeInfo().crop;
        return api.setThresholds(c.moistureLow || 20, c.moistureGood || 35, c.heatHigh || null, null);
      },
      clearFault: () => { st.fault = null; save(); U.render(); },
      tick: () => {
        if (!U.snapshot || st.mode !== 'auto') return;
        if (Date.now() < st.pausedUntil) return;
        const s = U.snapshot;
        if (st.running) {
          const mins = (Date.now() - st.startedAt) / 60000;
          if (mins > (st.maxRunMin || 30)) {
            st.running = false; st.fault = t('ev_fault_run').replace('{n}', Math.round(mins)).replace('{l}', st.maxRunMin);
            motorSend(false); pushLog('ev_fault_run', { n: Math.round(mins), l: st.maxRunMin }); U.render(); return;
          }
          if (st.startMoisture != null && s.moisture != null && (Date.now() - st.startedAt) > (st.dryWaitSec || 300) * 1000 && s.moisture <= st.startMoisture + 0.5) {
            st.running = false; st.fault = t('ev_fault_dry'); motorSend(false); pushLog('ev_fault_dry'); U.render(); return;
          }
        }
        let d = null;
        try { d = E.agri.pumpDecision(s, !!st.running, st); } catch (_) { /* ignore */ }
        if (!d) return;
        if (d.action === 'on' && !st.running) {
          st.running = true; st.startedAt = Date.now(); st.fault = null; st.startMoisture = s.moisture;
          motorSend(true); pushLog('ev_auto_on', { m: fmt1(s.moisture), lo: st.startBelow }); U.render();
        } else if (d.action === 'off' && st.running) {
          st.running = false; st.startedAt = 0;
          motorSend(false); pushLog('ev_auto_off', { m: fmt1(s.moisture), hi: st.stopAbove }); U.render();
        }
      }
    };
    return api;
  };

  /* ---------- rover control (drive, patrol, telemetry & log) ---------- */
  function roverStore() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('enviroos.rover') || 'null'); } catch (_) { /* ignore */ }
    return s && typeof s === 'object' ? s : {};
  }
  function roverSave(s) { try { localStorage.setItem('enviroos.rover', JSON.stringify(s)); } catch (_) { /* ignore */ } }
  U.makeRover = () => {
    const st = Object.assign({
      mode: 'manual',
      direction: 'stopped',
      speed: 150,
      battery: 88,
      log: []
    }, roverStore());
    // Always start stopped on fresh page boot for safety
    st.direction = 'stopped';
    const save = () => roverSave({
      mode: st.mode, speed: st.speed, battery: st.battery, log: (st.log || []).slice(-12)
    });
    const pushLog = (msg) => {
      const timeStr = new Date().toLocaleTimeString(E.i18n.lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit' });
      st.log.push({ t: Date.now(), time: timeStr, msg });
      st.log = st.log.slice(-12);
      save();
    };
    const dirLabel = (dir) => {
      const map = { forward: 'dir_forward', backward: 'dir_back', left: 'dir_left', right: 'dir_right', stop: 'dir_stop', stopped: 'motor_stopped' };
      return t(map[dir] || 'motor_stopped');
    };
    const api = {
      status: () => {
        const dev = U.mqtt ? (U.mqtt.getStatus() || {}) : null;
        const mqttMotor = dev && dev.motor;
        const dir = (U.mqtt && U.source !== 'demo' && mqttMotor && mqttMotor.direction && mqttMotor.at > (st.lastCmdAt || 0))
          ? mqttMotor.direction
          : st.direction;
        const spd = st.speed || (mqttMotor && mqttMotor.speed) || 150;
        return {
          mode: st.mode || 'manual',
          direction: dir || 'stopped',
          moving: !!(dir && dir !== 'stopped'),
          speed: spd,
          battery: st.battery || 88,
          online: !!(dev && dev.online),
          log: (st.log || []).slice()
        };
      },
      drive: (dir) => {
        if (!U.nodeInfo().hasMotor && U.source !== 'demo') {
          U.toast(t('node_basic_motor_notice'));
          return { ok: false };
        }
        const clean = ['forward', 'backward', 'left', 'right', 'stop'].includes(dir) ? dir : 'stop';
        st.direction = clean === 'stop' ? 'stopped' : clean;
        st.lastCmdAt = Date.now();
        if (clean === 'stop' && st.mode === 'patrol') st.mode = 'manual';
        U.driveSpeed = st.speed;
        if (U.mqtt && U.source !== 'demo') {
          try {
            if (clean === 'stop') U.mqtt.sendMotor('stop');
            else U.mqtt.sendMotor(clean, st.speed);
          } catch (_) { /* ignore */ }
        }
        const lbl = dirLabel(clean);
        pushLog(`${t('nav_rover')}: ${lbl}${clean !== 'stop' ? ` (${st.speed} PWM)` : ''}`);
        U.toast(`${U.icons.rover} ${t('nav_rover')}: ${lbl}`);
        U.render();
        return { ok: true };
      },
      setSpeed: (val, announce) => {
        const sp = Math.min(255, Math.max(60, Math.round(+val || 150)));
        st.speed = sp;
        U.driveSpeed = sp;
        save();
        if (st.direction !== 'stopped' && U.mqtt && U.source !== 'demo' && U.nodeInfo().hasMotor) {
          try { U.mqtt.sendMotor(st.direction, sp); } catch (_) { /* ignore */ }
        }
        if (announce) {
          pushLog(`${t('speed_label')}: ${sp} PWM`);
          U.toast(`${U.icons.speed} ${t('speed_label')}: ${sp}`);
        }
        U.render();
        return { ok: true, speed: sp };
      },
      setMode: (m) => {
        if (m !== 'manual' && m !== 'patrol') return { ok: false };
        st.mode = m;
        if (m === 'patrol') {
          st.direction = 'forward';
          if (U.mqtt && U.source !== 'demo' && U.nodeInfo().hasMotor) {
            try { U.mqtt.sendMotor('forward', st.speed); } catch (_) { /* ignore */ }
          }
          pushLog(`${t('ev_mode').replace('{m}', t('rover_mode_patrol'))}`);
          U.toast(`${U.icons.rover} ${t('rover_mode_patrol')}`);
        } else {
          st.direction = 'stopped';
          if (U.mqtt && U.source !== 'demo') {
            try { U.mqtt.sendMotor('stop'); } catch (_) { /* ignore */ }
          }
          pushLog(`${t('ev_mode').replace('{m}', t('rover_mode_manual'))}`);
          U.toast(`${U.icons.rover} ${t('rover_mode_manual')}`);
        }
        save();
        U.render();
        return { ok: true };
      },
      scanSensors: () => {
        if (U.mqtt && U.source !== 'demo') {
          try { U.mqtt.requestSensors(); } catch (_) { /* ignore */ }
        } else if (U.bootProviderRefresh) {
          U.bootProviderRefresh();
        }
        pushLog(t('rover_scan_done'));
        U.toast(`${U.icons.check} ${t('rover_scan_done')}`);
        U.render();
        return { ok: true };
      },
      pushLog
    };
    return api;
  };

  /* ---------- dosing control (Fertilizer, Compost, Pesticide — Agronomic Mass-Balance & TRV) ---------- */
  function dosingStore() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('enviroos.dosing') || 'null'); } catch (_) { /* ignore */ }
    return s && typeof s === 'object' ? s : {};
  }
  function dosingSave(s) { try { localStorage.setItem('enviroos.dosing', JSON.stringify(s)); } catch (_) { /* ignore */ } }
  U.makeDosing = () => {
    const DEFAULTS = {
      fertilizer: { rate: 35, min: 2, max: 250, step: 2.5, unitKey: 'dosing_unit_kg_ac', level: 82, mode: 'auto', active: false },
      compost: { rate: 300, min: 20, max: 2500, step: 25, unitKey: 'dosing_unit_kg_ac', level: 68, mode: 'auto', active: false },
      pesticide: { rate: 3.0, min: 0.5, max: 25, step: 0.5, unitKey: 'dosing_unit_ml_l', level: 90, mode: 'auto', active: false }
    };
    const saved = dosingStore();
    const st = {
      fertilizer: Object.assign({}, DEFAULTS.fertilizer, saved.fertilizer || {}, { min: 2, max: 250, step: 2.5, active: false }),
      compost: Object.assign({}, DEFAULTS.compost, saved.compost || {}, { min: 20, max: 2500, step: 25, active: false }),
      pesticide: Object.assign({}, DEFAULTS.pesticide, saved.pesticide || {}, { min: 0.5, max: 25, step: 0.5, active: false }),
      calcOpts: Object.assign({
        fertGrade: 'rdf_blend',
        nutrientPct: 46,
        targetNutrientG: 120,
        topDressCm: 1.0,
        compostBulkDensity: 600,
        compostFRatio: 0.20,
        potHeightCm: 28,
        potRTopCm: 15,
        potRBaseCm: 11,
        canopyPreset: 'crop_auto',
        tankVolumeL: 25,
        purityFrac: 0.50
      }, saved.calcOpts || {}),
      lastSyncedCropKey: saved.lastSyncedCropKey || ''
    };

    const getCalc = () => {
      const info = U.nodeInfo ? U.nodeInfo() : {};
      const prof = Object.assign({}, U.profile || {}, {
        cropId: info.cropId || (U.profile && U.profile.cropId) || 'bajra',
        stage: info.stage || (U.profile && U.profile.stage) || 'vegetative',
        sizeValue: info.sizeValue || (U.profile && U.profile.sizeValue) || 2.5
      });
      if (E.agri && E.agri.calcDosing) {
        return E.agri.calcDosing(U.snapshot, prof, st.calcOpts);
      }
      return null;
    };

    const save = () => dosingSave({
      fertilizer: { rate: st.fertilizer.rate, level: st.fertilizer.level, mode: st.fertilizer.mode },
      compost: { rate: st.compost.rate, level: st.compost.level, mode: st.compost.mode },
      pesticide: { rate: st.pesticide.rate, level: st.pesticide.level, mode: st.pesticide.mode },
      calcOpts: st.calcOpts,
      lastSyncedCropKey: st.lastSyncedCropKey
    });

    const syncAuto = (forceAll) => {
      const c = getCalc();
      if (!c) return null;
      const cropKey = `${c.cropId}|${c.stage}|${c.acres}|${st.calcOpts.fertGrade}|${st.calcOpts.canopyPreset}`;
      const cropChanged = st.lastSyncedCropKey !== cropKey;
      let changed = false;

      if (forceAll || st.fertilizer.mode === 'auto' || (cropChanged && st.fertilizer.mode === 'auto')) {
        if (st.fertilizer.rate !== c.module1.recommendedFertKgAc) {
          st.fertilizer.rate = c.module1.recommendedFertKgAc;
          changed = true;
        }
      }
      if (forceAll || st.compost.mode === 'auto' || (cropChanged && st.compost.mode === 'auto')) {
        if (st.compost.rate !== c.module2.recommendedCompostKgAc) {
          st.compost.rate = c.module2.recommendedCompostKgAc;
          changed = true;
        }
      }
      if (forceAll || st.pesticide.mode === 'auto' || (cropChanged && st.pesticide.mode === 'auto')) {
        if (st.pesticide.rate !== c.module3.recommendedPestMlL) {
          st.pesticide.rate = c.module3.recommendedPestMlL;
          changed = true;
        }
      }
      if (cropChanged || changed) {
        st.lastSyncedCropKey = cropKey;
        save();
      }
      return c;
    };

    // Perform initial sync on boot
    try { syncAuto(false); } catch (_) { /* ignore */ }

    const nameOf = (type) => t('dosing_' + type);
    const unitOf = (type) => t(st[type].unitKey);
    const logEvent = (msg) => {
      if (U.rover && U.rover.pushLog) U.rover.pushLog(msg);
    };
    const sendMqttDosing = (type, item) => {
      if (U.mqtt && U.source !== 'demo' && U.mqtt.sendCommand) {
        try {
          U.mqtt.sendCommand('dosing', { type, active: item.active, rate: item.rate, mode: item.mode });
        } catch (_) { /* ignore */ }
      }
    };

    const api = {
      calc: getCalc,
      syncAuto,
      status: () => {
        const calc = getCalc();
        return {
          fertilizer: Object.assign({}, st.fertilizer, { recommended: calc ? calc.module1.recommendedFertKgAc : st.fertilizer.rate }),
          compost: Object.assign({}, st.compost, { recommended: calc ? calc.module2.recommendedCompostKgAc : st.compost.rate }),
          pesticide: Object.assign({}, st.pesticide, { recommended: calc ? calc.module3.recommendedPestMlL : st.pesticide.rate }),
          calc,
          calcOpts: Object.assign({}, st.calcOpts)
        };
      },
      setRate: (type, val, silent) => {
        const item = st[type];
        if (!item) return { ok: false };
        const n = +val;
        if (!Number.isFinite(n)) return { ok: false };
        item.rate = Math.max(item.min, Math.min(item.max, Math.round(n * 10) / 10));
        if (!silent) item.mode = 'manual';
        save();
        sendMqttDosing(type, item);
        if (!silent) {
          const msg = t('dosing_rate_saved')
            .replace('{name}', nameOf(type))
            .replace('{rate}', item.rate)
            .replace('{unit}', unitOf(type));
          logEvent(msg);
          U.toast(`${U.icons.check} ${msg}`);
        }
        U.render();
        return { ok: true, rate: item.rate };
      },
      stepRate: (type, delta) => {
        const item = st[type];
        if (!item) return { ok: false };
        return api.setRate(type, item.rate + (+delta || item.step), false);
      },
      setMode: (type, mode) => {
        const item = st[type];
        if (!item || (mode !== 'auto' && mode !== 'manual')) return { ok: false };
        item.mode = mode;
        if (mode === 'auto') syncAuto(false);
        save();
        sendMqttDosing(type, item);
        logEvent(`${nameOf(type)} · ${t('ev_mode').replace('{m}', mode === 'auto' ? t('mode_auto') : t('mode_manual'))}`);
        U.render();
        return { ok: true };
      },
      applyRecommended: (type) => {
        const item = st[type];
        const c = getCalc();
        if (!item || !c) return { ok: false };
        item.mode = 'auto';
        if (type === 'fertilizer') item.rate = c.module1.recommendedFertKgAc;
        else if (type === 'compost') item.rate = c.module2.recommendedCompostKgAc;
        else if (type === 'pesticide') item.rate = c.module3.recommendedPestMlL;
        save();
        sendMqttDosing(type, item);
        const msg = t('dosing_rate_saved')
          .replace('{name}', nameOf(type))
          .replace('{rate}', item.rate)
          .replace('{unit}', unitOf(type));
        logEvent(msg);
        U.toast(`${U.icons.check} ${msg}`);
        U.render();
        return { ok: true, rate: item.rate };
      },
      syncCropPrescription: (announce) => {
        st.fertilizer.mode = 'auto';
        st.compost.mode = 'auto';
        st.pesticide.mode = 'auto';
        const c = syncAuto(true);
        if (announce && c) {
          const info = U.nodeInfo ? U.nodeInfo() : { cropName: c.cropName };
          const msg = `${info.cropName}: ${t('dosing_fertilizer')} ${st.fertilizer.rate} ${unitOf('fertilizer')}, ${t('dosing_compost')} ${st.compost.rate} ${unitOf('compost')}, ${t('dosing_pesticide')} ${st.pesticide.rate} ${unitOf('pesticide')}`;
          logEvent(msg);
          U.toast(`${U.icons.check} ${msg}`);
        }
        if (!U.isDlgOpen()) U.render();
        return { ok: true };
      },
      setCalcOpt: (key, val) => {
        if (!key || !(key in st.calcOpts)) return { ok: false };
        if (key === 'fertGrade' || key === 'canopyPreset') {
          st.calcOpts[key] = String(val);
        } else {
          const num = +val;
          if (!Number.isFinite(num)) return { ok: false };
          st.calcOpts[key] = num;
        }
        syncAuto(false);
        save();
        if (!U.isDlgOpen()) U.render();
        return { ok: true };
      },
      toggle: (type) => {
        const item = st[type];
        if (!item) return { ok: false };
        item.active = !item.active;
        if (item.active) {
          item.level = Math.max(5, item.level - 2);
          const msg = t('dosing_started')
            .replace('{name}', nameOf(type))
            .replace('{rate}', item.rate)
            .replace('{unit}', unitOf(type));
          logEvent(msg);
          U.toast(`${U.icons.check} ${msg}`);
        } else {
          const msg = t('dosing_stopped').replace('{name}', nameOf(type));
          logEvent(msg);
          U.toast(msg);
        }
        save();
        sendMqttDosing(type, item);
        U.render();
        return { ok: true, active: item.active };
      },
      refill: (type) => {
        const item = st[type];
        if (!item) return { ok: false };
        item.level = 100;
        save();
        const msg = t('dosing_refilled').replace('{name}', nameOf(type));
        logEvent(msg);
        U.toast(`${U.icons.check} ${msg}`);
        U.render();
        return { ok: true };
      }
    };
    return api;
  };

  /* ---------- dialog wiring ---------- */
  function wireDlg() {
    $('dlg-body').querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
      try { E.i18n.setLang(b.dataset.lang); } catch (_) { /* ignore */ }
      if ($('dlg-body').querySelector('.onboard')) { U.dlgOnboard(); U.render(); return; }
      U.closeDlg(); U.render();
    }));
    $('dlg-body').querySelectorAll('[data-lang-tab]').forEach((tab) => tab.addEventListener('click', () => {
      const grp = tab.dataset.langTab;
      $('dlg-body').querySelectorAll('[data-lang-tab]').forEach((tBtn) => {
        const on = tBtn.dataset.langTab === grp;
        tBtn.classList.toggle('active', on);
        tBtn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      $('dlg-body').querySelectorAll('[data-lang-pane]').forEach((pane) => {
        const on = pane.dataset.langPane === grp;
        pane.hidden = !on;
        pane.classList.toggle('active', on);
      });
    }));
    $('dlg-body').querySelectorAll('[data-settings-tab]').forEach((tab) => tab.addEventListener('click', () => {
      const grp = tab.dataset.settingsTab;
      U.settingsTab = grp;
      U.dlgSettings(grp);
    }));
    $('dlg-body').querySelectorAll('[data-dose-calc-opt]').forEach((inp) => inp.addEventListener('change', (e) => {
      if (U.dosing && U.dosing.setCalcOpt) {
        U.dosing.setCalcOpt(e.target.dataset.doseCalcOpt, e.target.value);
        if (U.isDlgOpen()) U.dlgSettings('formulae');
      }
    }));
    $('dlg-body').querySelectorAll('[data-dose-sync-crop]').forEach((btn) => btn.addEventListener('click', () => {
      if (U.dosing && U.dosing.syncCropPrescription) {
        U.dosing.syncCropPrescription(true);
        if (U.isDlgOpen()) U.dlgSettings('formulae');
      }
    }));
    const sv = $('dlg-body').querySelector('#f-save-profile');
    if (sv) sv.addEventListener('click', U.saveProfileDlg);
    const st = $('dlg-body').querySelector('#f-save-settings');
    if (st) st.addEventListener('click', U.saveSettingsDlg);
    const sn = $('dlg-body').querySelectorAll('[data-pick-node]');
    sn.forEach((b) => b.addEventListener('click', () => { U.switchNode(b.dataset.pickNode); U.closeDlg(); U.render(); }));
    $('dlg-body').querySelectorAll('[data-dictate]').forEach((b) => b.addEventListener('click', () => {
      const inp = $('dlg-body').querySelector('#' + b.dataset.dictate);
      if (inp && E.voice && E.voice.sttSupported) E.voice.dictate(inp);
    }));
    $('dlg-body').querySelectorAll('[data-seg]').forEach((b) => b.addEventListener('click', () => {
      U.segChoice(b.dataset.seg, b.dataset.val);
    }));
    $('dlg-body').querySelectorAll('.switch[data-sw]').forEach((b) => b.addEventListener('click', () => {
      U.flipSwitch(b.dataset.sw);
    }));
  }
  U.wireDlg = wireDlg;

  /* ---------- command menu ---------- */
  U.cmdEntries = () => {
    const go = (r) => () => { U.closeCmd(); U.go(r); };
    const items = [
      { icon: U.icons.mic, label: t('ask_label'), hint: t('nav_agri'), run: go('agri') },
      { route:'rover', icon: U.icons.rover, label: t('rover_title') + ' · ' + t('dosing_title'), hint: t('nav_rover'), run: go('rover') },
      { icon: MI('storefront'), label: t('mk_title') + ' · ' + t('mk_tab_crops'), hint: t('mk_title'), run: () => { U.closeCmd(); U.mkTab = 'crops'; U.go('market'); } },
      { icon: MI('handyman'), label: t('mk_title') + ' · ' + t('mk_tab_gear'), hint: t('mk_title'), run: () => { U.closeCmd(); U.mkTab = 'gear'; U.go('market'); } },
      { icon: U.icons.scale, label: t('settings_tab_formulae') + ' · ' + t('dosing_crop_rx'), hint: t('settings_title'), run: () => { U.closeCmd(); U.dlgSettings('formulae'); } },
      { icon: U.icons.pump, label: t('pump_start'), hint: t('nav_rover'), run: () => { U.closeCmd(); try { U.pump.start(true); } catch (_) { /* ignore */ } } },
      { icon: U.icons.stop, label: t('dir_stop') + ' · ' + t('pump_title'), hint: t('nav_rover'), run: () => { U.closeCmd(); try { U.pump.stop(true); } catch (_) { /* ignore */ } } },
      { icon: U.icons.speaker, label: t('hero_advice_listen'), hint: t('nav_home'), run: () => { U.closeCmd(); U.speak(U.heroAdvice || U.sayHome()); } },
      { icon: U.icons.leaf, label: t('nodes_title'), hint: t('node_sheet_title'), run: () => { U.closeCmd(); U.dlgNodes(); } },
      { icon: U.icons.farm, label: t('profile_title'), hint: t('edit_label'), run: () => { U.closeCmd(); U.dlgProfile(); } },
      { icon: U.icons.device || MI('developer_board'), label: U.deviceLabel(E.MQTT_SECOND_DEVICE), hint: t('device_secondary'), run: go('second-device') },
      { icon: U.icons.user || MI('person'), label: t('signin_title'), hint: t('signin_switch_account'), run: () => { U.closeCmd(); U.dlgSignIn(true); } },
      { icon: U.icons.bell, label: t('alerts_title'), hint: t('check_now'), run: () => { U.closeCmd(); U.sheetAlerts(); } }
    ];
    [['home', 'nav_home', U.icons.home], ['soil', 'nav_soil', U.icons.drop], ['crop', 'nav_crop', U.icons.leaf],
     ['weather', 'nav_weather', U.icons.cloud], ['rover', 'nav_rover', U.icons.rover], ['history', 'nav_history', U.icons.clock]].forEach(([r, k, ic]) =>
      items.push({ route:r, icon: ic, label: t(k), hint: t('check_now'), run: go(r) }));
    items.push({ icon: U.isDark() ? U.icons.sunMode : U.icons.moon, label: `${t('display_title')}: ${U.isDark() ? t('theme_light') : t('theme_dark')}`, hint: t('settings_title'), run: () => { U.closeCmd(); U.toggleTheme(); } });
    items.push({ icon: U.icons.globe, label: t('lang_title'), hint: t('settings_title'), run: () => { U.closeCmd(); U.dlgLang(); } });
    return items.filter(item => item.route !== 'rover' || U.hasRover());
  };
  let cmdSel = 0;
  U.openCmd = () => {
    $('cmd-input').placeholder = t('ask_label') + '…';
    $('cmd-input').value = '';
    U.paintCmd('');
    $('cmd').classList.add('open');
    setTimeout(() => $('cmd-input').focus(), 30);
  };
  U.closeCmd = () => { $('cmd').classList.remove('open'); };
  U.isCmdOpen = () => $('cmd').classList.contains('open');
  U.paintCmd = (q) => {
    const query = (q || '').trim().toLowerCase();
    const list = U.cmdEntries().filter((e) => !query || e.label.toLowerCase().includes(query) || (e.hint || '').toLowerCase().includes(query));
    cmdSel = 0;
    $('cmd-list').innerHTML = list.map((e, i) =>
      `<button class="cmd-item${i === 0 ? ' sel' : ''}" data-cmd="${i}" type="button" role="option"><span class="k">${e.icon}</span><span>${esc(e.label)}</span><small>${esc(e.hint || '')}</small></button>`
    ).join('');
    $('cmd-list')._items = list;
    $('cmd-list').querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => {
      const it = $('cmd-list')._items[+b.dataset.cmd];
      if (it) it.run();
    }));
  };
  U.cmdMove = (d) => {
    const items = $('cmd-list').querySelectorAll('[data-cmd]');
    if (!items.length) return;
    cmdSel = (cmdSel + d + items.length) % items.length;
    items.forEach((b, i) => b.classList.toggle('sel', i === cmdSel));
    items[cmdSel].scrollIntoView({ block: 'nearest' });
  };
  U.cmdPick = () => {
    const list = $('cmd-list')._items || [];
    if (list[cmdSel]) list[cmdSel].run();
  };

  function syncOfflineBar() {
    try { document.body.classList.toggle('is-offline', navigator.onLine === false); } catch (_) { /* ignore */ }
  }

  function boot() {
    U.profile = loadProfile();
    try { U.source = localStorage.getItem('enviroos.source') || 'auto'; } catch (_) { /* ignore */ }
    U.applyTheme();
    U.applyI18n();
    syncOfflineBar();
    window.addEventListener('online', syncOfflineBar);
    window.addEventListener('offline', syncOfflineBar);

    if (E.voice && E.voice.bindings) {
      E.voice.bindings.getState = () => ({ snapshot: U.snapshot, analysis: U.analysis, profile: U.profile });
      E.voice.bindings.getOutlook = async () => U.outlook;
    }
    U.pump = U.makePump();
    E.pumpControl = U.pump;
    U.rover = U.makeRover();
    E.roverControl = U.rover;
    U.dosing = U.makeDosing();
    E.dosingControl = U.dosing;

    // header bindings
    $('btn-node').addEventListener('click', () => U.dlgNodes());
    $('btn-lang').addEventListener('click', () => U.dlgLang());
    const btnTheme = $('btn-theme');
    if (btnTheme) btnTheme.addEventListener('click', () => U.toggleTheme());
    $('btn-cmd').addEventListener('click', () => U.openCmd());
    $('btn-alerts').addEventListener('click', () => U.sheetAlerts());
    const btnMarket = $('btn-market');
    if (btnMarket) btnMarket.addEventListener('click', () => U.go('market'));
    $('btn-farm').addEventListener('click', () => U.dlgProfile());
    $('btn-settings').addEventListener('click', () => U.dlgSettings());
    const cmdClose = $('cmd-close');
    if (cmdClose) cmdClose.addEventListener('click', () => U.closeCmd());
    $('cmd-input').addEventListener('input', (e) => U.paintCmd(e.target.value));
    $('cmd-input').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); U.cmdMove(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); U.cmdMove(-1); }
      else if (e.key === 'Enter') U.cmdPick();
    });
    $('cmd').addEventListener('click', (e) => { if (e.target === $('cmd')) U.closeCmd(); });
    $('scrim').addEventListener('click', () => U.closeSheet());
    $('dlg-wrap').addEventListener('click', (e) => { if (e.target === $('dlg-wrap')) U.closeDlg(); });

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        U.isCmdOpen() ? U.closeCmd() : U.openCmd();
        return;
      }
      if (e.key === 'Escape') {
        if (U.isCmdOpen()) U.closeCmd();
        else if (U.isDlgOpen()) U.closeDlg();
        else U.closeSheet();
      }
    });

    // global tap delegation
    document.addEventListener('click', (e) => {
      const sa = e.target.closest('[data-stop-audio]');
      if (sa) { U.stopAudio(); return; }
      const go = e.target.closest('[data-go]');
      if (go) { U.go(go.dataset.go); return; }
      const sh = e.target.closest('[data-sheet]');
      if (sh) { U.openSheetId = sh.dataset.sheet; U.paintSheet(sh.dataset.sheet); return; }
      const sy = e.target.closest('[data-say]');
      if (sy) { U.speak(sy.dataset.say); return; }
      const sw = e.target.closest('[data-switch-node]');
      if (sw) { U.switchNode(sw.dataset.switchNode); return; }
      const back = e.target.closest('[data-back]');
      if (back) { U.go('home'); return; }
      const t2 = e.target.closest('[data-toggle-second-device]');
      if (t2) {
        if (U.secondDevice?.status().enabled) U.secondDevice.pause();
        else if (U.secondDevice?.status().remembered) U.secondDevice.connect();
        else U.dlgConnectSecondDevice();
        return;
      }
      const osi = e.target.closest('[data-open-signin]');
      if (osi) { U.dlgSignIn(true); return; }
      const oa = e.target.closest('[data-open-alerts]');
      if (oa) { U.sheetAlerts(); return; }
      const on = e.target.closest('[data-open-nodes]');
      if (on) { U.dlgNodes(); return; }
      const op = e.target.closest('[data-open-profile]');
      if (op) { U.dlgProfile(); return; }
      const ofm = e.target.closest('[data-open-formulae]');
      if (ofm) { U.dlgSettings('formulae'); return; }
      const sh2 = e.target.closest('[data-say-home]');
      if (sh2) { U.speak(U.sayHome()); return; }
      const stg = e.target.closest('[data-set-stage]');
      if (stg) {
        const nextStage = stg.dataset.setStage;
        if (nextStage && E.CROP_STAGES.includes(nextStage)) {
          U.profile.stage = nextStage;
          const info = U.nodeInfo();
          U.profile[info.isNode2 ? 'node2' : 'node1'].stage = nextStage;
          U.saveProfile();
          if (U.bootProviderRefresh) U.bootProviderRefresh();
          U.render();
        }
        return;
      }
      const crp = e.target.closest('[data-set-crop]');
      if (crp) {
        const nextCrop = crp.dataset.setCrop;
        if (nextCrop && E.CROPS[nextCrop]) {
          U.profile.cropId = nextCrop;
          const info = U.nodeInfo();
          U.profile[info.isNode2 ? 'node2' : 'node1'].cropId = nextCrop;
          U.saveProfile();
          if (U.bootProviderRefresh) U.bootProviderRefresh();
          if (U.dosing && U.dosing.syncCropPrescription) {
            try { U.dosing.syncCropPrescription(false); } catch (_) { /* ignore */ }
          }
          U.render();
          U.toast(`${t('crop_title')}: ${t(E.CROPS[nextCrop].labelKey)}`);
        }
        return;
      }
      const chr = e.target.closest('[data-chist-range]');
      if (chr) {
        U.cropHistRange = chr.dataset.chistRange;
        try { localStorage.setItem('enviroos.chistRange', U.cropHistRange); } catch (_) { /* ignore */ }
        U.render();
        return;
      }
      if (e.target.closest('[data-chist-export]')) { U.cropLogExport(); return; }
      if (e.target.closest('[data-chist-clear]')) {
        if (window.confirm(t('chist_confirm_clear'))) {
          U.cropLogClear();
          try { U.cropLogRecord(U.snapshot, U.analysis); } catch (_) { /* ignore */ }
          U.render();
          U.toast(t('chist_cleared'));
        }
        return;
      }
      const hf = e.target.closest('[data-hist-filter]');
      if (hf) {
        U.histHidden = U.histHidden || {};
        U.histHidden[hf.dataset.histFilter] = !U.histHidden[hf.dataset.histFilter];
        U.render();
        return;
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-go],[data-sheet]')) {
        e.preventDefault();
        if (e.target.dataset.go) U.go(e.target.dataset.go);
        else { U.openSheetId = e.target.dataset.sheet; U.paintSheet(e.target.dataset.sheet); }
      }
    });

    // voice events drive agri UI + global voice bar
    document.addEventListener('voice-state', (e) => {
      const state = (e.detail && e.detail.state) || 'idle';
      U.voiceState = state;
      if (state === 'idle') {
        U.isSpeaking = false;
        U.speakingText = '';
      } else if (state === 'speaking') {
        U.isSpeaking = true;
      }
      U.renderHead();
      U.renderVoiceBar();
      U.updateSpeakButtons();
      if (U.route === 'agri') {
        if (U.syncAgriUI && $('agristage')) U.syncAgriUI();
        else U.render();
      }
    });
    document.addEventListener('voice-answer', (e) => {
      U.lastVoice = e.detail || null;
      if (U.route === 'agri') {
        const cap = $('agricap');
        if (cap && U.lastVoice && U.lastVoice.a && cap.textContent !== U.lastVoice.a) {
          cap.textContent = U.lastVoice.a;
        }
        if (U.syncAgriUI && $('agristage')) U.syncAgriUI();
        else U.render();
      }
    });
    document.addEventListener('agri-call', () => {
      U.renderHead();
      U.renderVoiceBar();
      if (U.route === 'agri') {
        if (U.syncAgriUI && $('agristage')) U.syncAgriUI();
        else U.render();
      }
    });

    U.bootProvider();
    if (!U.auth) {
      U.dlgSignIn();
    } else if (!U.profile.onboarded) {
      U.dlgOnboard();
    }
    U.render();

    // Auto-arm hands-free "Hey Agri" standby if enabled in preferences
    try {
      if (E.voice && E.voice.wakeOn && E.voice.wakeOn() && E.voice.startWakeWord) {
        E.voice.startWakeWord();
      }
    } catch (_) { /* ignore */ }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 0);
  else document.addEventListener('DOMContentLoaded', boot);
})();
