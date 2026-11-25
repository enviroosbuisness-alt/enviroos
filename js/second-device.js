// Each auxiliary ESP gets a read-only connection, separate from the main feed.
const E = window.EnviroOS;
const U = E.UI;
const {esc, t} = U;
const FIRST = 'enviro-d2';
// These two device IDs match Node 1 and Node 2 in the original EnviroOS MQTT provider.
const assignedIds = new Map([[FIRST, E.MQTT_DEFAULT_DEVICE], ['enviro-d3', E.MQTT_SECOND_DEVICE]]);
const FRESH_MS = 30000;
const BROKER = 'wss://broker.hivemq.com:8884/mqtt';
const clients = new Map();
const previousPhases = new Map();

function persist(key, value) {
  try {localStorage.setItem(key, value); return true;} catch {return false;}
}
function load(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function createNode(key) {
  const store = 'enviroos.nodes.' + key + '.connection';
  const enabledKey = 'enviroos.nodes.' + key + '.enabled';
  let saved;
  try { saved = JSON.parse(load(store)); } catch {}
  const assigned = assignedIds.get(key);
  const storedId = String(saved?.deviceId || '').toUpperCase();
  const id = assigned || (/^[0-9A-F]{12}$/.test(storedId) &&
    ![...assignedIds.values()].includes(storedId) ? storedId : '');
  return {key, id, store, enabledKey, saved: id && storedId === id ? saved : null,
    enabled: Boolean(id) && load(enabledKey) !== '0',
    client:null, generation:0, conn:'closed', lastSeen:0, lastSampleAt:0, reading:null};
}
function nodeFor(key) {
  if (!clients.has(key)) {
    const node = createNode(key);
    clients.set(key, node);
    previousPhases.set(key, status(node).phase);
  }
  return clients.get(key);
}
function currentNode() {
  return nodeFor(U.otherDeviceForRoute(U.route)?.key || FIRST);
}
function status(node = currentNode()) {
  const online = node.enabled && node.conn === 'connected' && node.lastSeen > 0 &&
    Date.now() - node.lastSeen < FRESH_MS;
  const remembered = Boolean(node.saved?.deviceId);
  const phase = !node.enabled ? (node.id ? 'paused' : 'idle') : online ? 'online' : remembered ? 'waiting' : 'searching';
  return {phase, online, enabled:node.enabled, remembered, deviceId:node.id, conn:node.conn, lastSeen:node.lastSeen,
    lastSampleAt:node.lastSampleAt, reading:online ? node.reading : null};
}
function statusText(s = status()) {
  if (s.enabled && !s.online && s.conn !== 'connected') return t('other_device_broker_connecting');
  return t({idle:'second_connect_intro', paused:'second_connect_paused', searching:'second_connect_searching',
    waiting:'second_connect_waiting', online:'second_connect_online'}[s.phase]);
}
function notify(node) {
  previousPhases.set(node.key, status(node).phase);
  U.renderTabs();
  if (U.otherDeviceForRoute(U.route)?.key === node.key) U.render();
}
function number(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function parseTelemetry(data, id) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.device && String(data.device).toUpperCase() !== id) return null;
  const block = value => value && typeof value === 'object' && !Array.isArray(value);
  if (![data.soil_analog, data.npk, data.bmp280, data.bh1750].some(block)) return null;
  let dry = 3500, wet = 1200;
  try {const cal=JSON.parse(localStorage.getItem('enviroos.mqtt.dev') || '{}');dry=number(cal.calDry)??dry;wet=number(cal.calWet)??wet;} catch {}
  const npk = block(data.npk) && data.npk.ok !== false ? data.npk : {};
  const raw = data.soil_analog?.ok !== false && Array.isArray(data.soil_analog?.raw)
    ? data.soil_analog.raw.map(number) : [];
  const samples = raw.filter(n => n !== null);
  const moisture = number(npk.moisture_pct) ?? (samples.length && dry !== wet ? Math.max(0,Math.min(100,(dry-samples.reduce((a,b)=>a+b,0)/samples.length)/(dry-wet)*100)) : null);
  const air = block(data.bmp280) && data.bmp280.ok !== false ? data.bmp280 : {};
  const light = block(data.bh1750) && data.bh1750.ok !== false ? data.bh1750 : {};
  return {
    moisture, raw, airTemp:number(air.temperature_c), soilTemp:number(npk.temperature_c),
    lux:number(light.lux), pressureHpa:number(air.pressure_hpa),
    n:number(npk.n_mgkg), p:number(npk.p_mgkg), k:number(npk.k_mgkg), ph:number(npk.ph),
    rssi:number(data.wifi_rssi), uptime:number(data.uptime_s),
  };
}
function connect(node = currentNode(), update = true) {
  if (!node.id) return openPairing(node);
  if (!availableId(node, node.id)) return;
  node.enabled = true;
  persist(node.enabledKey, '1');
  if (node.client) { if (update) notify(node); return; }
  const id = node.id;
  const gen = ++node.generation;
  node.client = new E.MqttClient({
    url:BROKER, keepAlive:30,
    onState(state) {
      if (gen !== node.generation) return;
      node.conn = state;
      if (state !== 'connected') node.lastSeen = 0;
      notify(node);
    },
    onMessage(topic, payload, meta = {}) {
      if (gen !== node.generation || !node.enabled) return;
      const parts = String(topic).split('/');
      if (parts.length !== 3 || parts[0] !== 'esp32bot' || parts[1].toUpperCase() !== id) return;
      let data;
      try { data = JSON.parse(payload); } catch { data = String(payload).trim().toLowerCase(); }
      if (parts[2] === 'status' && (data === 'offline' || data?.online === false)) {
        node.lastSeen = 0;
        notify(node);
      }
      if (parts[2] !== 'sensors' || meta.retained) return;
      const next = parseTelemetry(data, id);
      if (!next) return;
      node.reading = next;
      node.lastSeen = node.lastSampleAt = Date.now();
      if (!node.saved?.pairedAt || node.saved?.topicId !== parts[1]) {
        node.saved = {deviceId:id, topicId:parts[1], pairedAt:node.saved?.pairedAt || node.lastSeen};
        persist(node.store, JSON.stringify(node.saved));
      }
      notify(node);
    }
  });
  const topics = new Set([id, id.toLowerCase()]);
  const savedTopic = node.saved?.topicId;
  if (typeof savedTopic === 'string' && savedTopic.toUpperCase() === id) topics.add(savedTopic);
  for (const topic of topics) {
    node.client.subscribe(`esp32bot/${topic}/sensors`, 0);
    node.client.subscribe(`esp32bot/${topic}/status`, 1);
  }
  node.client.open();
}
function disconnect(node) {
  ++node.generation;
  const old = node.client;
  node.client = null;
  old?.close();
  node.conn = 'closed';
  node.lastSeen = 0;
}
function pause(node = currentNode()) {
  node.enabled = false;
  persist(node.enabledKey, '0');
  disconnect(node);
  notify(node);
}
function availableId(node, id) {
  if (assignedIds.has(node.key)) return assignedIds.get(node.key) === id;
  return /^[0-9A-F]{12}$/.test(id) && ![...assignedIds.values()].includes(id) &&
    ![...clients.values()].some(other => other !== node && other.id === id);
}

function openPairing(node) {
  const index = U.otherNodes().findIndex(slot => slot.key === node.key);
  if (index === -1) return;
  U.openDlg(`<div class="dlg-hd"><h2>${esc(U.otherDeviceTabLabel(index))}</h2><button class="iconbtn" type="button" data-close-dlg="1" aria-label="${esc(t('close_label'))}">${U.icons.close}</button></div>`
    + `<p>${esc(t('other_device_id_hint'))}</p><form id="other-node-form">
    <div class="field"><label for="other-node-id">${esc(t('device_label'))}</label>
    <input id="other-node-id" value="${esc(node.id)}" maxlength="17" required autocomplete="off"></div>
    <p id="other-node-error" role="alert"></p><button type="submit" class="btn primary">${esc(t('other_device_save_id'))}</button></form>`);
  const form = document.getElementById('other-node-form');
  form.onsubmit = event => {
    event.preventDefault();
    const entered = document.getElementById('other-node-id').value.trim().replace(/[:-]/g, '');
    const id = entered.toUpperCase();
    if (!availableId(node, id)) {
      document.getElementById('other-node-error').textContent = t('other_device_invalid_id');
      return;
    }
    disconnect(node);
    node.id = id;
    node.lastSampleAt = 0;
    const topicId = (node.saved?.deviceId === id && node.saved.topicId) || entered;
    node.saved = {deviceId:id, topicId};
    persist(node.store, JSON.stringify(node.saved));
    U.closeDlg();
    connect(node);
  };
}
U.syncOtherNodes = () => {
  const keys = new Set(U.otherNodes().map(slot => slot.key));
  for (const node of clients.values()) if (!keys.has(node.key) && node.client) disconnect(node);
  for (const key of keys) {
    const node = nodeFor(key);
    if (node.id && node.enabled && !node.client) setTimeout(() => {
      if (node.enabled && !node.client && U.otherNodes().some(slot => slot.key === key)) connect(node, false);
    }, 0);
  }
};
U.otherNodeStatus = key => status(nodeFor(key));
U.openOtherNode = key => {
  const index = U.otherNodes().findIndex(slot => slot.key === key);
  if (index !== -1) U.go(U.otherDeviceRoutes[index]);
};
U.secondDevice = {status:() => status(nodeFor(FIRST)), connect:() => connect(nodeFor(FIRST)), pause:() => pause(nodeFor(FIRST))};
U.isSecondDeviceOn = () => status(nodeFor(FIRST)).online;
U.vSecondDevice = slot => {
  const node = nodeFor(slot.key);
  const s = status(node);
  const reading = s.reading || {};
  const crop = E.getCrop(U.profile?.node2?.cropId || 'wheat');
  const value = (n, unit = '', decimals = 0) => n == null ? '—' : E.i18n.number(n, decimals) + unit;
  const readings = [
    ['moisture_title', U.icons.drop, value(reading.moisture, '%', 1), 'moisture'],
    ['device_temperature', U.icons.heat, value(reading.airTemp ?? reading.soilTemp, ' °C', 1), 'temperature'],
    ['second_connect_light', U.icons.sun, value(reading.lux, ' lx'), 'lux'],
    ['pressure_title', U.icons.gauge || U.icons.heat, value(reading.pressureHpa, ' hPa', 1), 'pressure'],
    ['crop_title', U.icons.leaf, t(crop?.labelKey || 'crop_wheat')],
  ];
  const index = U.otherDeviceRoutes.indexOf(U.route);
  const hasSoilProbe = slot.key === FIRST || ['n', 'p', 'k', 'ph', 'soilTemp'].some(key => reading[key] != null);
  const nutrients = [
    ['nitrogen_full', 'N', value(reading.n, ' mg/kg'), 'n'],
    ['phosphorus_full', 'P', value(reading.p, ' mg/kg'), 'p'],
    ['potassium_full', 'K', value(reading.k, ' mg/kg'), 'k'],
    ['ph_title', 'pH', value(reading.ph, '', 2), 'ph'],
  ];
  const time = s.lastSampleAt ? E.i18n.date(s.lastSampleAt, {hour:'2-digit', minute:'2-digit', second:'2-digit'}) : '—';
  const connection = s.online ? 'live' : s.enabled ? 'waiting' : 'idle';
  const badge = s.online ? 'other_device_live_signal' :
    s.enabled ? 'other_device_waiting_badge' : node.id ? 'other_device_paused_badge' : 'other_device_setup_badge';
  const broker = s.conn === 'connected' ? 'other_device_broker_online' :
    s.enabled ? 'other_device_broker_connecting' : 'other_device_broker_idle';
  const keepDetailsOpen = document.querySelector('#device-connection-details')?.dataset.key === slot.key &&
    document.querySelector('#device-connection-details').open;

  return `<div class="device-page">
    <header class="screen-top">
      <div class="device-identity">
        <h1 id="device-page-title" class="ptitle">${esc(U.otherDeviceTabLabel(index))}</h1>
        <p class="muted">${esc(slot.model)}</p>
      </div>
      <span class="stbadge ${s.online ? 'good' : 'mute'} device-hud-badge" data-connection="${connection}"><span class="dot ${s.online ? 'on' : ''}" aria-hidden="true"></span>${esc(t(badge))}</span>
    </header>
    <section class="card device-connection">
      <div class="device-connection-status">
        <span class="stic" data-tone="${s.online ? 'good' : 'mute'}" aria-hidden="true">${U.icons.device}</span>
        <div>
          <strong role="status">${esc(statusText(s))}</strong>
          <div class="muted">${esc(t('other_device_last_sample'))} <strong>${esc(time)}</strong></div>
        </div>
      </div>
      <div class="device-actions">
        ${s.enabled
          ? `<button class="btn secondary" type="button" data-pause-second-device>${U.icons.power}${esc(t('second_connect_pause'))}</button>`
          : `<button class="btn primary" type="button" data-connect-second-device>${U.icons.power}${esc(t(node.id ? 'second_connect_resume' : 'other_device_pair'))}</button>`}
      </div>
    </section>
    <section class="card device-readings" aria-labelledby="device-readings-title">
      <div class="device-readings-header">
        <h2 class="seclabel2" id="device-readings-title">${esc(t('second_connect_readings'))}</h2>
        ${s.online ? '' : `<p class="muted">${esc(t('device_reading_wait'))}</p>`}
      </div>
      <dl class="device-metrics">${readings.map(([label, icon, text, key]) =>
        `<div><dt><span class="stic" data-m="${({moisture:'water', temperature:'heat', lux:'weather', pressure:'weather'})[key] || 'soil'}" aria-hidden="true">${icon}</span>${esc(t(label))}</dt><dd${key ? ' data-second-' + key : ''}>${esc(text)}</dd></div>`).join('')}</dl>
    </section>
    ${hasSoilProbe ? `<section class="card device-readings" aria-labelledby="device-soil-title">
      <div class="device-readings-header"><h2 class="seclabel2" id="device-soil-title">${esc(t('npk_title'))}</h2>
        <p class="muted">${esc(t('device_soil_temperature'))} <strong>${esc(value(reading.soilTemp, ' °C', 1))}</strong></p>
      </div>
      <dl class="device-metrics device-nutrients">${nutrients.map(([label, symbol, text, key]) =>
        `<div><dt><span class="device-nutrient-symbol" aria-hidden="true">${symbol}</span>${esc(t(label))}</dt><dd data-second-${key}>${esc(text)}</dd></div>`).join('')}</dl>
    </section>` : ''}
    ${U.hasRover() ? `<div class="card device-pump-link"><div><strong>${esc(t('device_pump_controls'))}</strong><p class="muted">${esc(t('device_pump_route'))}</p></div>
      <button class="btn secondary" type="button" data-open-rover-pumps>${U.icons.pump}${esc(t('device_open_pumps'))}</button></div>` : ''}
    <details class="card device-connection-details" id="device-connection-details" data-key="${esc(slot.key)}"${keepDetailsOpen ? ' open' : ''}>
      <summary>${esc(t('second_connect_details'))}</summary>
      <dl class="device-hud-facts">
        <div><dt>${esc(t('device_label'))}</dt><dd><code>${esc(node.id || '—')}</code></dd></div>
        <div><dt>${esc(t('other_device_broker'))}</dt><dd>${esc(t(broker))}</dd></div>
        <div><dt>${esc(t('signal_label'))}</dt><dd>${esc(value(reading.rssi, ' dBm'))}</dd></div>
        <div><dt>${esc(t('device_uptime'))}</dt><dd>${esc(value(reading.uptime, ' s'))}</dd></div>
        <div><dt>${esc(t('device_soil_channels'))}</dt><dd>${esc(reading.raw?.length ? reading.raw.map(n => value(n)).join(' · ') : '—')}</dd></div>
      </dl>
      ${node.id && !assignedIds.has(slot.key) ? `<button class="btn secondary" type="button" data-edit-other-node>${esc(t('other_device_change_id'))}</button>` : ''}
    </details>
  </div>`;
};
document.addEventListener('click', event => {
  if (event.target.closest('[data-connect-second-device]')) connect();
  if (event.target.closest('[data-edit-other-node]')) openPairing(currentNode());
  if (event.target.closest('[data-pause-second-device]')) pause();
});
setInterval(() => {
  for (const node of clients.values()) {
    const phase = status(node).phase;
    if (previousPhases.get(node.key) !== phase) notify(node);
  }
}, 1000);
