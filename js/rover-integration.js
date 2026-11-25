import {roverLabels} from './locale-catalogs.js';

// A same-origin document isolates the mission planner's keyboard, canvas and CSS.
const U = window.EnviroOS.ui || window.EnviroOS.UI;
const frame = () => document.getElementById('rover-mission-control');
const active = () => U.route === 'rover' && !document.hidden;
const wantsTelemetry = () => U.hasRover() && !document.hidden && ['home','rover'].includes(U.route);
let lastActive;
let lastRoverLanguage;
function syncTheme() {
  const styles=getComputedStyle(document.documentElement);
  const tokens=Object.fromEntries(['bg','card','card-2','ink','sub','muted','line','accent','accent-ink','ok-bg','bad','bad-bg','lift','font','display'].map(key=>[key,styles.getPropertyValue('--'+key).trim()]));
  frame()?.contentWindow?.postMessage({type:'enviroos:rover-theme',theme:document.documentElement.dataset.theme,tokens},location.origin);
}
new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
function sync(force = false) {
  const el = frame();
  if (!el) return;
  const value = active();
  if (force || value !== lastActive) {
    el.contentWindow?.postMessage({type: 'enviroos:rover-active', active: value}, location.origin);
    lastActive = value;
    syncTheme();
  }
  const i18n = window.EnviroOS.i18n;
  if (force || lastRoverLanguage !== i18n.lang) {
    lastRoverLanguage = i18n.lang;
    el.contentWindow?.postMessage({
      type: 'enviroos:rover-locale',
      lang: i18n.lang,
      locale: i18n.locale,
      labels: roverLabels(i18n.lang)
    }, location.origin);
  }
}
U.resumeRoverFrame = () => { sync(); syncRoverTelemetry(); };
U.suspendRoverFrame = () => {
  frame()?.contentWindow?.postMessage({type: 'enviroos:rover-active', active: false}, location.origin);
  lastActive = false;
  if (directDrive) stopDirect();
  if (inspection) stopInspection("Inspection stopped.");
};
U.syncRoverTelemetry = syncRoverTelemetry;
window.addEventListener('message', event => {
  if (event.origin === location.origin && event.source === frame()?.contentWindow && ['enviroos:rover-ready','enviroos:rover-theme-ready'].includes(event.data?.type)) sync(true);
});
document.addEventListener('visibilitychange', () => { sync(true); syncRoverTelemetry(); });
window.addEventListener('pagehide', () => {
  U.suspendRoverFrame();
  closeRoverTelemetry();
});

U.openRoverPumps = () => {
  U.go('rover');
  const rover = frame();
  if (!rover) return;
  const show = () => rover.contentWindow?.postMessage({type:'enviroos:show-dispensing'}, location.origin);
  if (rover.contentDocument?.getElementById('dispensingTitle')) show();
  else rover.addEventListener('load', show, {once:true});
};
document.addEventListener('click', event => {
  if (event.target.closest('[data-open-rover-pumps]')) U.openRoverPumps();
});

function syncViewport(){
 const el=frame();if(!el)return;
 el.contentWindow?.postMessage({type:'enviroos:rover-viewport',top:Math.max(16,80-el.getBoundingClientRect().top),height:innerHeight},location.origin);
}
window.addEventListener('scroll',syncViewport,{passive:true});
window.addEventListener('resize',syncViewport);
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==frame()?.contentWindow)return;
 if(event.data?.type==='enviroos:rover-height'){
  const height=event.data.height;
  if(Number.isFinite(height)&&height>=100&&height<=100000){frame().style.height=Math.ceil(height)+'px';syncViewport();}
 }
});

// The FarmRover MQTT channel supplies readings. The Pi owns hardware control.
const mqttStorageKey = 'enviroos.rover.mqttDeviceId';
const defaultRoverMqttId = 'device01';
let roverMqttId = defaultRoverMqttId;
try { roverMqttId = localStorage.getItem(mqttStorageKey) || defaultRoverMqttId; } catch {}
let roverMqttClient = null;
let usesPrivatePiMqtt = false;
let roverMqttState = 'closed';
let roverReading = null;
let roverPresence = 'unknown';
let roverSampleAt = null;
let firmwareStatus = '';
let firmwareStatusRevision = 0;
let directDrive = null;
let directTaskUntil = 0;
// Compensate for the observed drive wiring on the Expanded MQTT rover.
const directions = new Map([
  ['forward', 'R'],
  ['reverse', 'L'],
  ['left', 'B'],
  ['right', 'F'],
]);
const actions = new Map([
  ['pump','PUMPON'], ['pump-off','PUMPOFF'], ['fertilizer','DISPENSE'],
  ['mission','MISSION'], ['cancel','CANCEL'], ['probe-up','NPKUP'],
  ['probe-down','NPKDOWN'], ['probe-mid','NPKMID'], ['servo-test','SERVO TEST'],
  ['water-test','WATER'], ['distance','DISTANCE'],
]);

function publishDirect(command) {
  if (roverMqttState !== 'connected') return false;
  return roverMqttClient?.publish('farmrover/' + roverMqttId + '/cmd', command) === true;
}

const inspectionActions = {
  wait: {min:1, max:120},
  lower: {min:1, max:120, command:'NPKDOWN', ack:'NPK LIFT SERVO POSITION 180'},
  raise: {min:1, max:120, command:'NPKUP', ack:'NPK LIFT SERVO POSITION 0'},
  water: {min:3, max:30, command:'WATER', ack:'WATER TEST COMPLETE - AVG '},
  fertilizer: {min:1, max:4, command:'PUMPON'},
};
let inspection = null;
let inspectionStatus = null;
let inspectionRecoveryAt = null;

function stopInspection(message, sendStop = true) {
  if (!inspection) return;
  if (inspection.probeDown || inspection.phase?.action === 'fertilizer') inspectionRecoveryAt = Date.now();
  if (sendStop) stopDirect('ESTOP');
  inspection = null;
  inspectionStatus = {...inspectionStatus, state:'failed', message};
  sendRoverTelemetry();
}

function startInspection(id, steps) {
  if (typeof id !== 'string' || !Array.isArray(steps) || !steps.length || steps.length > 12) return;
  let probeDown = false;
  for (const step of steps) {
    const config = step && Object.hasOwn(inspectionActions, step.action) && inspectionActions[step.action];
    if (!config || !Number.isInteger(step.seconds) || step.seconds < config.min || step.seconds > config.max ||
        (step.action === 'water' && step.seconds % 3 !== 0) ||
        (step.action === 'fertilizer' && probeDown)) return;
    if (step.action === 'lower' || step.action === 'raise') probeDown = step.action === 'lower';
  }
  if (probeDown || !directReady() || directBusy() || directDrive || roverReading.probeAngle !== 0) {
    inspectionStatus = {id, state:'failed', message:'Inspection requires an idle ESP32 and the probe arm at home.'};
    sendRoverTelemetry();
    return;
  }
  inspection = {steps, index:0, phase:null, probeDown:false};
  inspectionStatus = {id, state:'running', count:steps.length};
  tickInspection();
}

function tickInspection() {
  const run = inspection;
  if (!run) return;
  if (!directReady() || roverReading.mission || roverReading.dispensing) {
    stopInspection('Inspection interrupted. Check ESP32 readings.');
    return;
  }
  const now = Date.now();
  const {action, seconds} = run.steps[run.index];
  const config = inspectionActions[action];
  if (!run.phase) {
    run.phase = {action, seconds, until:now + seconds * 1000, timeout:now + (action === 'water' ? 6500 : 2500)};
    if (action === 'lower') run.probeDown = true;
    if (config.command && !publishDirect(config.command)) {
      stopInspection('The inspection command could not be sent.');
      return;
    }
    inspectionStatus = {...inspectionStatus, step:run.index + 1, action};
    sendRoverTelemetry();
    return;
  }
  const phase = run.phase;
  const probeTarget = action === 'lower' ? 180 : action === 'raise' ? 0 : null;
  if (action === 'water' && phase.confirmed && phase.seconds > 3) {
    phase.seconds -= 3;
    phase.started = phase.confirmed = false;
    phase.timeout = now + 6500;
    if (!publishDirect(config.command)) stopInspection('The inspection command could not be sent.');
    return;
  }
  if (action === 'fertilizer' && !phase.stopSent && now >= phase.until) {
    phase.stopSent = true;
    phase.timeout = now + 2500;
    if (!publishDirect('PUMPOFF')) stopInspection('Fertilizer relay shutdown could not be confirmed.');
    return;
  }
  const probeReported = probeTarget === null ||
    (roverSampleAt >= phase.confirmedAt && roverReading.probeAngle === probeTarget);
  if (action === 'wait' ? now >= phase.until : phase.confirmed && probeReported &&
      (action === 'water' || now >= phase.until)) {
    if (action === 'raise') run.probeDown = false;
    if (++run.index === run.steps.length) {
      inspection = null;
      inspectionStatus = {...inspectionStatus, state:'completed'};
      sendRoverTelemetry();
    } else run.phase = null;
  } else if (action !== 'wait' && (!phase.confirmed || !probeReported) && now >= phase.timeout) {
    stopInspection('The ESP32 did not confirm the inspection step.');
  }
}

function inspectionFeedback(status) {
  const phase = inspection?.phase;
  if (!phase) return;
  if (/^(UNKNOWN COMMAND|ROVER OFFLINE|OBSTACLE DETECTED|EMERGENCY STOP)/.test(status)) {
    stopInspection('Inspection interrupted by the ESP32.', !status.startsWith('EMERGENCY STOP'));
    return;
  }
  if (phase.action === 'fertilizer') {
    if (status === 'PUMP ON') phase.started = true;
    if (phase.started && phase.stopSent && /^(PUMP OFF|PUMP AUTO OFF)/.test(status)) phase.confirmed = true;
    return;
  }
  const target = inspectionActions[phase.action].ack;
  if (phase.action === 'water' && status === 'WATER TEST STARTED') phase.started = true;
  if (target && !phase.confirmed && (phase.action === 'water' ? phase.started && status.startsWith(target) : status === target)) {
    phase.confirmed = true;
    phase.confirmedAt = Date.now();
    phase.until = phase.confirmedAt + phase.seconds * 1000;
    phase.timeout = phase.confirmedAt + 3000;
  }
}

setInterval(tickInspection, 100);

function stopDirect(command = 'STOP') {
  directDrive = null;
  return publishDirect(command);
}

function directReady() {
  return active() && !usesPrivatePiMqtt && roverMqttState === 'connected' &&
    roverReading?.expanded === true && Date.now() - roverSampleAt < 5000;
}

function directBusy() {
  return Boolean(inspection) || inspectionRecoveryAt !== null || Date.now() < directTaskUntil || roverReading?.pump || roverReading?.dispensing ||
    (roverReading?.mission ?? 0) !== 0;
}

setInterval(() => {
  if (!directDrive) return;
  if (!directReady() || directBusy() || Date.now() >= directDrive.expires) {
    stopDirect();
    return;
  }
  if (!publishDirect(directDrive.command)) stopDirect();
}, 250);
window.addEventListener('blur', () => { if (directDrive) stopDirect(); });
let roverRefreshPending = false;
let roverReadingTimer;
let roverRefreshTimer;

function sendRoverTelemetry() {
  U.roverHomeReading = roverReading;
  U.syncRoverHomeCards?.();
  frame()?.contentWindow?.postMessage({
    type: 'enviroos:rover-telemetry',
    id: roverMqttId,
    connection: roverMqttState,
    reading: roverReading,
    presence: roverPresence,
    sampleAt: roverSampleAt,
    refreshPending: roverRefreshPending,
    firmwareStatus,
    firmwareStatusRevision,
    directReady: directReady(),
    directBusy: Boolean(directBusy()),
    inspection: inspectionStatus,
  }, location.origin);
}

function clearRoverReading() {
  clearTimeout(roverReadingTimer);
  roverReading = null;
  roverSampleAt = null;
}

function closeRoverTelemetry() {
  if (inspection) stopInspection("Inspection connection closed.");
  if (directDrive) stopDirect();
  firmwareStatus = '';
  directTaskUntil = 0;
  const client = roverMqttClient;
  roverMqttClient = null;
  client?.close();
  clearRoverReading();
  roverMqttState = 'closed';
  roverPresence = 'unknown';
  finishRoverRefresh();
}

function syncRoverTelemetry() {
  if (!wantsTelemetry() || !roverMqttId || usesPrivatePiMqtt) {
    closeRoverTelemetry();
  } else if (!roverMqttClient) {
    const topic = 'farmrover/' + roverMqttId;
    const client = new window.EnviroOS.MqttClient({
      url: 'wss://broker.hivemq.com:8884/mqtt',
      onState(state) {
        if (roverMqttClient !== client) return;
        roverMqttState = state;
        if (state !== 'connected') {
          if (inspection) stopInspection('Inspection lost the ESP32 connection.');
          directDrive = null;
          firmwareStatus = '';
          clearRoverReading();
          roverPresence = 'unknown';
          finishRoverRefresh();
        }
        sendRoverTelemetry();
      },
      onMessage(received, payload, meta = {}) {
        if (roverMqttClient !== client) return;
        if (received === topic + '/status') {
          const status = payload.trim().slice(0, 160);
          if (meta.retained) return;
          firmwareStatus = status;
          firmwareStatusRevision++;
          inspectionFeedback(status);
          if (status === 'ROVER OFFLINE') {
            roverPresence = 'offline';
            clearRoverReading();
            finishRoverRefresh();
          } else if ((status === 'ROVER ONLINE' || status === 'ROVER ONLINE - SEND HELP FOR COMMANDS') && !meta.retained) {
            roverPresence = 'online';
          }
          if (directDrive && /^(OBSTACLE DETECTED|DRIVE TIMEOUT|ROVER OFFLINE|EMERGENCY STOP)/.test(status)) stopDirect();
          if (/^(FARM MISSION COMPLETED|FERTILIZER DISPENSER COMPLETE|BOTH SERVO TEST COMPLETED|MISSION CANCELLED|PUMP AUTO OFF|PUMP OFF|EMERGENCY STOP)/.test(status)) directTaskUntil = 0;
          sendRoverTelemetry();
          return;
        }
        if (received !== topic + '/data' || meta.retained) return;
        let data;
        try { data = JSON.parse(payload); } catch { return; }
        if (!data || typeof data.pump !== 'boolean') return;
        const expanded = typeof data.dispensing === 'boolean' && Number.isInteger(data.mission) &&
          data.mission >= 0 && data.mission <= 6;
        if (!expanded && typeof data.drive_active !== 'boolean') return;
        const number = value => Number.isFinite(value) && value >= 0 ? value : null;
        const angle = value => Number.isInteger(value) && value >= 0 && value <= 180 ? value : null;
        const npk = data.npk?.ok === true ? data.npk : {};
        clearRoverReading();
        finishRoverRefresh();
        roverPresence = 'online';
        roverSampleAt = Date.now();
        roverReading = {
          soil: number(data.soil_raw), water: number(data.water_raw),
          temperature: number(data.temperature_raw), distance: number(data.distance_cm),
          light: number(data.light_lux), pump: data.pump,
          moving: typeof data.drive_active === 'boolean' ? data.drive_active : null,
          expanded,
          waterAvg: expanded ? number(data.water_avg) : null,
          dispensing: expanded ? data.dispensing : null,
          mission: expanded ? data.mission : null,
          speed: expanded && Number.isInteger(data.speed) && data.speed >= 0 && data.speed <= 255 ? data.speed : null,
          servoActive: typeof data.servo_active === 'boolean' ? data.servo_active : null,
          probeAngle: angle(data.npk_servo_angle), dispenserAngle: angle(data.dispenser_servo_angle),
          n: number(npk.n_mgkg), p: number(npk.p_mgkg), k: number(npk.k_mgkg),
        };
        if (inspectionRecoveryAt !== null && roverSampleAt > inspectionRecoveryAt &&
            roverReading.probeAngle === 0 && !roverReading.pump && !roverReading.dispensing &&
            roverReading.mission === 0) inspectionRecoveryAt = null;
        roverReadingTimer = setTimeout(() => {
          clearRoverReading();
          roverPresence = 'unknown';
          sendRoverTelemetry();
        }, 7000);
        sendRoverTelemetry();
      },
    });
    roverMqttClient = client;
    client.subscribe(topic + '/data', 0);
    client.subscribe(topic + '/status', 1);
    client.open();
  }
  sendRoverTelemetry();
}

function finishRoverRefresh() {
  clearTimeout(roverRefreshTimer);
  roverRefreshPending = false;
}

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame()?.contentWindow) return;
  if (event.data?.type === 'enviroos:rover-inspection') {
    if (event.data.action === 'start' && !inspection) startInspection(event.data.id, event.data.steps);
    if (event.data.action === 'stop' && inspection) stopInspection('Inspection stopped.');
    return;
  }
  if (event.data?.type === 'enviroos:rover-direct') {
    const {action, speed} = event.data;
    if (action === 'release') {
      if (directDrive) stopDirect();
    } else if (action === 'estop' && active()) {
      stopDirect('ESTOP');
      if (inspection) stopInspection('Inspection stopped.', false);
      directTaskUntil = 0;
    } else if (directReady() && !inspection) {
      if (action === 'hold') {
        if (directDrive) directDrive.expires = Date.now() + 450;
      } else if (directions.has(action) && !directBusy() && !directDrive &&
                 Number.isInteger(speed) && speed > 0 && speed <= 255) {
        const command = directions.get(action);
        if (publishDirect('SPEED ' + speed) && publishDirect(command)) {
          directDrive = {command, expires: Date.now() + 450};
        }
      } else if (actions.has(action) && !directDrive &&
                 (!directBusy() || ['cancel','pump-off'].includes(action))) {
        if (publishDirect(actions.get(action))) {
          const holdMs = {mission:12000, fertilizer:2500, pump:4500, 'servo-test':8500}[action];
          if (holdMs) directTaskUntil = Date.now() + holdMs;
          sendRoverTelemetry();
        }
      }
    }
    return;
  }
  if (event.data?.type === 'enviroos:rover-pi-mqtt') {
    usesPrivatePiMqtt = true;
    closeRoverTelemetry();
    sendRoverTelemetry();
    return;
  }
  if (event.data?.type === 'enviroos:rover-refresh') {
    if (!active() || !roverMqttId || roverMqttState !== 'connected' || roverRefreshPending) return;
    if (!roverMqttClient?.publish('farmrover/' + roverMqttId + '/cmd', 'DATA')) return;
    roverRefreshPending = true;
    sendRoverTelemetry();
    roverRefreshTimer = setTimeout(() => {
      finishRoverRefresh();
      sendRoverTelemetry();
    }, 4000);
    return;
  }
  if (event.data?.type === 'enviroos:rover-ready') syncRoverTelemetry();
  if (event.data?.type !== 'enviroos:rover-mqtt-id') return;
  const submitted = event.data.id;
  if (typeof submitted !== 'string' || !/^[\x21-\x7e]{0,64}$/.test(submitted) || /[\/+#]/.test(submitted)) return;
  const id = submitted || defaultRoverMqttId;
  if (id !== roverMqttId) {
    closeRoverTelemetry();
    roverMqttId = id;
    try { localStorage.setItem(mqttStorageKey, id); } catch {}
  }
  syncRoverTelemetry();
});
