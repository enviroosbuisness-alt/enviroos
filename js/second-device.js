// The second ESP already publishes to a known MQTT topic. Keep this read-only
// connection independent of the main view and its demo fallback.
const E = window.EnviroOS;
const U = E.UI;
const {esc, t} = U;
const ID = E.MQTT_SECOND_DEVICE;
const STORE = 'enviroos.node2.connection';
const ENABLED = 'enviroos.node2.enabled';
const FRESH_MS = 30000;
let saved;
try {saved = JSON.parse(localStorage.getItem(STORE) || 'null');} catch {}
if (saved?.deviceId !== ID) saved = null;
let enabled = false;
try {enabled = localStorage.getItem(ENABLED) === '1' || (localStorage.getItem(ENABLED) === null && !!saved);} catch {}
let client, generation = 0, conn = 'closed', lastSeen = 0, offline = true, reading = null;
let remembered = !!saved;

function persist(key, value) {
  try {localStorage.setItem(key, value); return true;} catch {return false;}
}
function status() {
  const online = enabled && conn === 'connected' && !offline && lastSeen > 0 && Date.now() - lastSeen < FRESH_MS;
  const phase = !enabled ? (saved ? 'paused' : 'idle') : online ? 'online' : saved ? 'waiting' : 'searching';
  return {phase, online, enabled, remembered, deviceId: ID, conn, lastSeen, reading: online ? reading : null};
}
function statusText(s = status()) {
  return t({idle:'second_connect_intro', paused:'second_connect_paused', searching:'second_connect_searching',
    waiting:'second_connect_waiting', online:'second_connect_online'}[s.phase]);
}
function notify() {
  const s = status();
  const live = document.getElementById('second-connect-status');
  if (live) live.textContent = statusText(s);
  const note = document.getElementById('second-connect-note');
  if (note) note.textContent = s.online ? t(remembered ? 'second_connect_remembered' : 'second_connect_session_only') : t('second_connect_auto_help');
  U.renderTabs();
  if (U.route === 'second-device') U.render();
}
function number(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function parseTelemetry(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.device && String(data.device).toUpperCase() !== ID) return null;
  const block = value => value && typeof value === 'object' && !Array.isArray(value);
  if (![data.soil_analog, data.npk, data.bmp280, data.bh1750].some(block)) return null;
  let dry = 3500, wet = 1200;
  try {const cal=JSON.parse(localStorage.getItem('enviroos.mqtt.dev') || '{}');dry=number(cal.calDry)??dry;wet=number(cal.calWet)??wet;} catch {}
  const npk = block(data.npk) && data.npk.ok !== false ? data.npk : {};
  const raw = Array.isArray(data.soil_analog?.raw) ? data.soil_analog.raw.map(number).filter(n=>n!==null) : [];
  const moisture = number(npk.moisture_pct) ?? (raw.length && dry !== wet ? Math.max(0,Math.min(100,(dry-raw.reduce((a,b)=>a+b,0)/raw.length)/(dry-wet)*100)) : null);
  const air = block(data.bmp280) && data.bmp280.ok !== false ? data.bmp280 : {};
  const light = block(data.bh1750) && data.bh1750.ok !== false ? data.bh1750 : {};
  return {moisture, tempC:number(air.temperature_c)??number(npk.temperature_c), lux:number(light.lux), pressureHpa:number(air.pressure_hpa)};
}
function connect() {
  enabled = true;
  persist(ENABLED, '1');
  if (client) {notify(); return;}
  const gen = ++generation;
  client = new E.MqttClient({
    url:'wss://broker.hivemq.com:8884/mqtt', keepAlive:30,
    onState(state) {
      if (gen !== generation) return;
      conn = state;
      if (state !== 'connected') {offline=true;lastSeen=0;}
      notify();
    },
    onMessage(topic, payload, meta = {}) {
      if (gen !== generation || !enabled) return;
      const parts=String(topic).split('/');
      if (parts.length!==3 || parts[0]!=='esp32bot' || parts[1].toUpperCase()!==ID) return;
      let data;
      try {data=JSON.parse(payload);} catch {data=String(payload).trim().toLowerCase();}
      if (parts[2]==='status') {
        if (data==='offline' || data?.online===false) {offline=true;lastSeen=0;notify();}
        // An online/retained status alone is not proof of current sensor data.
        return;
      }
      if (parts[2]!=='sensors' || meta.retained) return;
      const next = parseTelemetry(data);
      if (!next) return;
      reading=next;lastSeen=Date.now();offline=false;
      if (!saved) {
        saved={deviceId:ID, pairedAt:Date.now()};
        remembered=persist(STORE, JSON.stringify(saved));
      }
      notify();
    }
  });
  client.subscribe(`esp32bot/${ID}/sensors`,0);
  client.subscribe(`esp32bot/${ID}/status`,1);
  client.open();
}
function pause() {
  enabled=false;persist(ENABLED,'0');++generation;
  const old=client;client=null;old?.close();
  conn='closed';offline=true;lastSeen=0;notify();
}
U.secondDevice = {status, connect, pause};
U.isSecondDeviceOn = () => status().online;
U.setSecondDevicePower = on => on ? (saved ? connect() : U.dlgConnectSecondDevice()) : pause();
U.dlgConnectSecondDevice = () => {
  U.openDlg(`<div class="second-connect-dialog"><div class="dlg-hd"><h2>${esc(t('second_connect_power_title'))} · ${esc(U.deviceLabel(ID))}</h2><button class="iconbtn" type="button" data-close-dlg="1" aria-label="${esc(t('close_label'))}">${U.icons.close}</button></div>`
    + `<div class="second-connect-icon" aria-hidden="true">${U.icons.device}</div><p>${esc(t('second_connect_power_help'))}</p>`
    + `<div class="second-connect-live" role="status" aria-live="polite"><span class="pulsedot inline"></span><strong id="second-connect-status">${esc(statusText())}</strong></div>`
    + `<p class="muted" id="second-connect-note">${esc(t('second_connect_auto_help'))}</p>`
    + `<button class="btn primary block lg" type="button" data-close-dlg="1">${esc(t('close_label'))}</button></div>`);
  connect();
};
U.vSecondDevice = () => {
  const s=status(), r=s.reading||{}, profile=U.profile||{};
  const crop=E.getCrop(profile.node2?.cropId||'wheat');
  const cropName=t(crop?.labelKey||'crop_wheat');
  const value=(n,unit)=>n==null?'—':`${Math.round(n).toLocaleString()}${unit}`;
  return `<div class="device-studio"><div class="screen-top"><div><span class="device-studio-eyebrow">${esc(t('device_secondary'))}</span><h1 class="ptitle">${esc(U.deviceLabel(ID))}</h1></div><span class="device-studio-status ${s.online?'is-live':''}"><span></span>${esc(t(s.online?'second_connect_connected':'second_connect_not_connected'))}</span></div>`
    + `<div class="card second-dev-hero ${s.online?'power-active':'power-standby'}"><div class="second-dev-head"><div class="dev-tag-group"><span class="dev-ic-box">${U.icons.device}</span><div><strong class="dev-title">${esc(U.deviceLabel(ID))}</strong><div class="dev-sub-meta">${esc(t('node_2_desc'))} · ${esc(cropName)}</div></div></div>`
    + `<span class="stbadge ${s.online?'good':'mute'}">${esc(s.online?t('second_connect_connected'):t('second_connect_not_connected'))}</span></div>`
    + `<p class="second-device-status" role="status" aria-live="polite">${esc(statusText(s))}</p>`
    + `<p class="muted">${esc(s.remembered?t('second_connect_remembered'):t('second_connect_intro'))}</p>`
    + `<div class="second-dev-actions">`
    + (!s.enabled?`<button class="btn primary lg" type="button" data-connect-second-device="1">${U.icons.power}<span>${esc(t(s.remembered?'second_connect_resume':'second_connect_btn'))}</span></button>`
       :`<button class="btn secondary" type="button" data-pause-second-device="1">${U.icons.power}<span>${esc(t('second_connect_pause'))}</span></button>`)
    + `</div><div class="device-studio-pills"><span>${U.icons.globe} Wi-Fi / MQTT</span><span>${U.icons.check} ${esc(t(s.remembered?'device_saved':'device_one_setup'))}</span></div></div>`
    + `<div class="grid2 second-device-details"><div class="card"><div class="device-readings-heading"><div><div class="seclabel2">${esc(t('second_connect_readings'))}</div><p class="muted">${esc(t(s.online?'device_reading_live':'device_reading_wait'))}</p></div>${s.online?`<span class="device-sample-time">${esc(new Date(s.lastSeen).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))}</span>`:''}</div><div class="second-dev-stats">`
    + `<div class="second-dev-stat-cell"><span class="stat-ic">${U.icons.drop}</span><div><small>${esc(t('cond_water'))}</small><strong data-second-moisture>${esc(value(r.moisture,'%'))}</strong></div></div>`
    + `<div class="second-dev-stat-cell"><span class="stat-ic">${U.icons.heat}</span><div><small>${esc(t('cond_heat'))}</small><strong data-second-temperature>${esc(value(r.tempC,'°C'))}</strong></div></div>`
    + `<div class="second-dev-stat-cell"><span class="stat-ic">${U.icons.sun}</span><div><small>${esc(t('second_connect_light'))}</small><strong data-second-lux>${esc(value(r.lux,' lx'))}</strong></div></div>`
    + `<div class="second-dev-stat-cell"><span class="stat-ic">${U.icons.leaf}</span><div><small>${esc(t('crop_title'))}</small><strong>${esc(cropName)}</strong></div></div></div></div>`
    + `<div class="card"><div class="seclabel2">${esc(t('second_connect_how_title'))}</div><p>${esc(t('second_connect_how'))}</p>`
    + `<details><summary>${esc(t('second_connect_details'))}</summary><p>${esc(t('device_label'))}: <code>${ID}</code></p><p>${esc(t('second_connect_wifi'))}</p></details></div></div></div>`;
};
document.addEventListener('click', event => {
  if (event.target.closest('[data-connect-second-device]')) {if(saved)connect();else U.dlgConnectSecondDevice();}
  if (event.target.closest('[data-pause-second-device]')) pause();
});
let lastPhase=status().phase;
setInterval(()=>{const phase=status().phase;if(phase!==lastPhase){lastPhase=phase;notify();}},1000);
// Saved connections start without another prompt, including after a device reboot.
if (enabled) setTimeout(connect,0);
