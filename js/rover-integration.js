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
// Match the Expanded firmware's front obstacle threshold.
const obstacleLimitCm = 15;
const emergencyLimitCm = 5;
const rangeTimeoutMs = 2500;
let frontBlocked = false;
let frontRangeAt = null;
let frontRangeCm = null;
let distanceRequestedAt = 0;
const ultrasonicStopKey = () => 'enviroos.rover.ultrasonicStop.' + roverMqttId;
function readUltrasonicStop() {
  try { return localStorage.getItem(ultrasonicStopKey()) === '1'; } catch { return false; }
}
let ultrasonicStop = readUltrasonicStop();
let ultrasonicAcknowledgedAt = null;
let ultrasonicAttempts = 0;
let lastUltrasonicAttemptAt = -Infinity;
function clearUltrasonicConfirmation() {
  ultrasonicAcknowledgedAt = null;
  ultrasonicAttempts = 0;
  lastUltrasonicAttemptAt = -Infinity;
}
// Compensate for the observed drive wiring on the Expanded MQTT rover.
const directions = new Map([
  ['forward', 'R'],
  ['reverse', 'L'],
  ['left', 'B'],
  ['right', 'F'],
]);
const driveSpeeds = {straight: 200, turn: 255};
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
  'read-npk': {min:0, max:0, command:'DATA'},
  dispense: {min:0, max:0, command:'DISPENSE'},
  'dispense-if-low': {min:0, max:0, command:'DISPENSE'},
};
const nutrientKeys = ['n', 'p', 'k'];
const dispenserSteps = new Set(['dispense', 'dispense-if-low']);
const npkSampleMaxAgeMs = 30000;
let inspection = null;
let inspectionStatus = null;
let inspectionRecoveryAt = null;

function stopInspection(message, sendStop = true) {
  if (!inspection) return;
  if (inspection.probeDown || inspection.phase?.action === 'fertilizer' || inspection.phase?.dispensing) {
    inspectionRecoveryAt = Date.now();
  }
  if (sendStop) stopDirect('ESTOP');
  inspection = null;
  inspectionStatus = {...inspectionStatus, state:'failed', message};
  sendRoverTelemetry();
}

function startInspection(id, steps, thresholds) {
  if (typeof id !== 'string' || !Array.isArray(steps) || !steps.length || steps.length > 12) return;
  function reject(message) {
    inspectionStatus = {id, state:'failed', message};
    sendRoverTelemetry();
  }
  let probeDown = false;
  let measured = false;
  for (const step of steps) {
    const config = step && Object.hasOwn(inspectionActions, step.action) && inspectionActions[step.action];
    if (!config || !Number.isInteger(step.seconds) || step.seconds < config.min || step.seconds > config.max ||
        (step.action === 'water' && step.seconds % 3 !== 0)) {
      return reject('Check the inspection step and its duration.');
    }
    if (step.action === 'lower' || step.action === 'raise') {
      probeDown = step.action === 'lower';
      if (probeDown) measured = false;
    }
    if (step.action === 'read-npk') {
      if (!probeDown) return reject('Lower the NPK arm before reading NPK.');
      measured = true;
    }
    if ((step.action === 'fertilizer' || dispenserSteps.has(step.action)) && probeDown) {
      return reject('Raise the NPK arm before dispensing fertilizer.');
    }
    if (step.action === 'dispense-if-low') {
      if (!measured) return reject('Add a Read NPK step before conditional dispensing.');
      if (!nutrientKeys.every(key => Number.isFinite(thresholds?.[key]) && thresholds[key] >= 0)) {
        return reject('Enter a minimum for N, P and K in mg/kg.');
      }
      measured = false;
    }
  }
  if (probeDown || !directReady() || directBusy() || directDrive || roverReading.probeAngle !== 0) {
    return reject('Inspection requires an idle ESP32 and the probe arm at home.');
  }
  inspection = {steps, thresholds, index:0, phase:null, probeDown:false, npk:null};
  inspectionStatus = {id, state:'running', count:steps.length};
  tickInspection();
}

function tickInspection() {
  const run = inspection;
  if (!run) return;
  if (!directReady() || roverReading.mission || (roverReading.dispensing && !run.phase?.dispensing)) {
    stopInspection('Inspection interrupted. Check ESP32 readings.');
    return;
  }
  const now = Date.now();
  const {action, seconds} = run.steps[run.index];
  const config = inspectionActions[action];
  if (!run.phase) {
    run.phase = {action, seconds, until:now + seconds * 1000, timeout:now + (action === 'water' ? 6500 : 2500)};
    const phase = run.phase;
    inspectionStatus = {...inspectionStatus, step:run.index + 1, action};
    if (action === 'lower') {
      run.probeDown = true;
      run.npk = null;
      delete inspectionStatus.npk;
      delete inspectionStatus.lowNutrients;
    }
    if (action === 'read-npk') {
      phase.requestedAt = now;
      phase.timeout = now + 6500;
    }
    let command = config.command;
    if (dispenserSteps.has(action)) {
      if (run.probeDown || roverReading.probeAngle !== 0 || roverReading.pump) {
        stopInspection('Wait for the NPK arm and fertilizer relay to return to idle.');
        return;
      }
      if (action === 'dispense-if-low') {
        if (!run.npk || now - run.npk.measuredAt > npkSampleMaxAgeMs) {
          stopInspection('A fresh NPK measurement is required for conditional dispensing.');
          return;
        }
        const low = nutrientKeys.filter(key => run.npk[key] < run.thresholds[key]);
        inspectionStatus.lowNutrients = low;
        run.npk = null;
        if (!low.length) {
          command = null;
          phase.confirmed = true;
        }
      }
      if (command) {
        phase.dispensing = true;
        phase.timeout = now + 6500;
      }
    }
    if (command && !publishDirect(command)) {
      stopInspection('The inspection command could not be sent.');
      return;
    }
    sendRoverTelemetry();
    return;
  }
  const phase = run.phase;
  if (action === 'read-npk' && !phase.confirmed) {
    const measuredAt = roverReading.npkMeasuredAt;
    if (roverSampleAt >= phase.requestedAt && roverReading.probeAngle === 180 &&
        measuredAt >= phase.requestedAt && measuredAt <= now &&
        nutrientKeys.every(key => Number.isFinite(roverReading[key]))) {
      run.npk = Object.fromEntries(nutrientKeys.map(key => [key, roverReading[key]]));
      run.npk.measuredAt = measuredAt;
      inspectionStatus.npk = run.npk;
      phase.confirmed = true;
    } else if (now >= phase.timeout) {
      stopInspection('The ESP32 did not provide a fresh NPK measurement.');
      return;
    }
  }
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
  const dispenserStopped = !phase.dispensing || !roverReading.dispensing;
  if (action === 'wait' ? now >= phase.until : phase.confirmed && probeReported && dispenserStopped &&
      (action === 'water' || now >= phase.until)) {
    if (action === 'raise') run.probeDown = false;
    if (++run.index === run.steps.length) {
      inspection = null;
      inspectionStatus = {...inspectionStatus, state:'completed'};
      sendRoverTelemetry();
    } else run.phase = null;
  } else if (action !== 'wait' && (!phase.confirmed || !probeReported || !dispenserStopped) && now >= phase.timeout) {
    stopInspection('The ESP32 did not confirm the inspection step.');
  }
}

function inspectionFeedback(status) {
  const phase = inspection?.phase;
  if (!phase) return;
  if (/^(UNKNOWN COMMAND|ROVER OFFLINE|OBSTACLE DETECTED|EMERGENCY STOP|DISPENSER BUSY)/.test(status)) {
    stopInspection('Inspection interrupted by the ESP32.', !status.startsWith('EMERGENCY STOP'));
    return;
  }
  if (phase.dispensing) {
    if (status === 'FERTILIZER DISPENSER OPEN') phase.started = true;
    if (phase.started && status === 'FERTILIZER DISPENSER COMPLETE') phase.confirmed = true;
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

function sendUltrasonicStop() {
  if (!ultrasonicStop || ultrasonicAcknowledgedAt !== null || ultrasonicAttempts >= 3 ||
      !active() || !roverReading?.expanded || roverMqttState !== 'connected' ||
      Date.now() - lastUltrasonicAttemptAt < 1000) return;
  lastUltrasonicAttemptAt = Date.now();
  ultrasonicAttempts++;
  stopDirect('ESTOP');
  directTaskUntil = 0;
}

function canResetUltrasonicStop() {
  return ultrasonicStop && ultrasonicAcknowledgedAt !== null && directReady() &&
    roverSampleAt >= ultrasonicAcknowledgedAt && frontRangeFresh() &&
    frontRangeCm >= obstacleLimitCm && !roverReading.pump && !roverReading.dispensing &&
    roverReading.mission === 0 && roverReading.probeAngle === 0;
}

function updateFrontRange(distance) {
  if (!Number.isFinite(distance)) return;
  frontRangeAt = Date.now();
  frontRangeCm = distance;
  // A missed echo cannot clear an obstacle the sensor already reported.
  if (distance > 0) frontBlocked = distance < obstacleLimitCm;
  if (distance > 0 && distance <= emergencyLimitCm && !ultrasonicStop) {
    ultrasonicStop = true;
    clearUltrasonicConfirmation();
    try { localStorage.setItem(ultrasonicStopKey(), '1'); } catch {}
    sendUltrasonicStop();
    if (inspection) stopInspection('Ultrasonic emergency stop', false);
  }
  if (frontBlocked && directDrive && directDrive.action !== 'reverse') stopDirect();
}

function frontRangeFresh() {
  return frontRangeAt !== null && Date.now() - frontRangeAt <= rangeTimeoutMs;
}

function directReady() {
  return active() && !usesPrivatePiMqtt && roverMqttState === 'connected' &&
    roverReading?.expanded === true && Date.now() - roverSampleAt < 5000;
}

function directBusy() {
  return ultrasonicStop || Boolean(inspection) || inspectionRecoveryAt !== null || Date.now() < directTaskUntil || roverReading?.pump || roverReading?.dispensing ||
    (roverReading?.mission ?? 0) !== 0;
}

setInterval(() => {
  sendUltrasonicStop();
  if (!directDrive) return;
  if (!directReady() || directBusy() || Date.now() >= directDrive.expires) {
    stopDirect();
    return;
  }
  if (directDrive.action === 'left' && !frontRangeFresh()) {
    // The wiring maps left to B, which this firmware does not guard locally.
    stopDirect();
    sendRoverTelemetry();
    return;
  }
  const now = Date.now();
  if (now - distanceRequestedAt >= 500) {
    distanceRequestedAt = now;
    publishDirect('DISTANCE');
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
    driveSpeeds,
    frontBlocked,
    frontRangeFresh: frontRangeFresh(),
    ultrasonicStop,
    ultrasonicResetReady: canResetUltrasonicStop(),
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
  frontBlocked = false;
  frontRangeAt = null;
  frontRangeCm = null;
  if (ultrasonicStop) clearUltrasonicConfirmation();
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
          frontRangeAt = null;
          if (ultrasonicStop) clearUltrasonicConfirmation();
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
          const range = /^DISTANCE: (-?\d+(?:\.\d+)?) CM$/.exec(status);
          if (range && roverReading?.expanded) updateFrontRange(Number(range[1]));
          if (status.startsWith('OBSTACLE DETECTED')) frontBlocked = true;
          if (ultrasonicStop && ultrasonicAttempts && status.startsWith('EMERGENCY STOP')) {
            ultrasonicAcknowledgedAt = Date.now();
          }
          firmwareStatus = status;
          firmwareStatusRevision++;
          inspectionFeedback(status);
          if (status === 'ROVER OFFLINE') {
            roverPresence = 'offline';
            frontRangeAt = null;
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
          npkMeasuredAt: Number.isFinite(npk.measured_at) ? npk.measured_at * 1000 : null,
        };
        if (expanded) updateFrontRange(data.distance_cm);
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
    if (event.data.action === 'start' && !inspection) {
      startInspection(event.data.id, event.data.steps, event.data.thresholds);
    }
    if (event.data.action === 'stop' && inspection) stopInspection('Inspection stopped.');
    return;
  }
  if (event.data?.type === 'enviroos:rover-direct') {
    const {action} = event.data;
    if (action === 'release') {
      if (directDrive) stopDirect();
    } else if (action === 'estop' && active()) {
      stopDirect('ESTOP');
      if (ultrasonicStop && !ultrasonicAttempts) ultrasonicAttempts = 1;
      if (inspection) stopInspection('Inspection stopped.', false);
      directTaskUntil = 0;
    } else if (action === 'reset-ultrasonic-stop' && canResetUltrasonicStop()) {
      ultrasonicStop = false;
      try { localStorage.removeItem(ultrasonicStopKey()); } catch {}
      sendRoverTelemetry();
    } else if (directReady() && !inspection) {
      if (action === 'hold') {
        if (directDrive) directDrive.expires = Date.now() + 450;
      } else if (directions.has(action) && !directBusy() && !directDrive) {
        if ((action !== 'reverse' && frontBlocked) || (action === 'left' && !frontRangeFresh())) {
          sendRoverTelemetry();
          return;
        }
        const command = directions.get(action);
        const speed = action === 'left' || action === 'right' ? driveSpeeds.turn : driveSpeeds.straight;
        if (publishDirect('SPEED ' + speed) && publishDirect(command)) {
          directDrive = {action, command, expires: Date.now() + 450};
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
    ultrasonicStop = readUltrasonicStop();
    clearUltrasonicConfirmation();
    try { localStorage.setItem(mqttStorageKey, id); } catch {}
  }
  syncRoverTelemetry();
});
