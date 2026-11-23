/* EnviroOS — MODULAR UI COMPONENTS
 * Clean, consistent, visual-first, minimal UI components.
 * Independent of DOM manipulation; returns pure accessible HTML.
 */
'use strict';
window.EnviroOS = window.EnviroOS || {};
(function () {
  const E = EnviroOS;
  const U = E.UI = E.UI || {};
  const t = (k) => (E.i18n ? E.i18n.t(k) : k);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt1 = (v) => (v == null || Number.isNaN(+v) ? '—' : (Math.round(+v * 10) / 10));
  const fmtInt = (v) => (v == null || Number.isNaN(+v) ? '—' : Math.round(+v));
  const IC = U.icons || {};

  const C = {};
  U.components = C;

  /* ---------- 1. Section Header & Badges ---------- */
  C.secLabel = (key, rightHtml) =>
    `<div class="seclabel"><span>${esc(t(key))}</span>${rightHtml ? `<span class="seclabel-rt">${rightHtml}</span>` : ''}</div>`;

  C.statusBadge = (tone, label, icon) => {
    const mark = icon || (tone === 'good' ? U.icons.check : (tone === 'bad' ? U.icons.warn : (tone === 'mute' ? '–' : U.icons.up)));
    return `<span class="stbadge ${tone}"><span aria-hidden="true">${mark}</span> ${esc(label)}</span>`;
  };

  /* ---------- 2. Speak & Listen Button (Reactive Voice Pill) ---------- */
  C.speakBtn = (text, label, extraCls) => {
    if (!E.voice || !E.voice.ttsSupported || !text) return '';
    const active = !!(U.isSpeaking && U.speakingText === text);
    const lbl = label || t('speak_label');
    const cls = 'pill pill-speak' + (active ? ' speaking active' : '') + (extraCls ? ' ' + extraCls : '');
    return `<button class="${cls}" type="button" data-say="${esc(text)}" data-label="${esc(lbl)}" aria-pressed="${active}" aria-label="${esc(active ? t('hero_advice_stop') : lbl)}">`
      + `<span class="btn-ic" aria-hidden="true">${active ? U.icons.stop : U.icons.speaker}</span>`
      + `<span>${esc(active ? t('hero_advice_stop') : lbl)}</span>`
      + (active ? `<span class="live-wave-mini" aria-hidden="true"><i></i><i></i><i></i></span>` : '')
      + `</button>`;
  };

  /* ---------- 3. Minimalist Farm Context & Node Switcher ---------- */
  C.farmContext = (opts) => {
    opts = opts || {};
    const info = U.nodeInfo();
    const live = U.snapshot && U.snapshot.source === 'mqtt' && !U.snapshot.stale;
    const srcBadge = U.source === 'demo'
      ? `<span class="tag demo">${esc(t('demo_tag'))}</span>`
      : live
        ? `<span class="tag live"><span class="pulsedot"></span> ${esc(t('live_tag'))}</span>`
        : `<span class="tag warn">${esc(t('offline_bot'))}</span>`;

    let nodesHtml = '';
    if (opts.showNodes && U.source !== 'demo' && U.mqtt) {
      const cur = U.mqtt.deviceId;
      const d1 = E.MQTT_DEFAULT_DEVICE, d2 = E.MQTT_SECOND_DEVICE;
      const devs = {};
      try { (U.mqtt.getDevices() || []).forEach((d) => { devs[d.id] = d; }); } catch (_) { /* ignore */ }
      const nodeBtn = (id, iconSvg, nameKey, badgeKey) => {
        const on = cur === id, online = !!(devs[id] && devs[id].online);
        return `<button class="half ${on ? 'on' : ''}" type="button" data-switch-node="${id}" aria-pressed="${on}">`
          + `<span class="half-emoji" aria-hidden="true">${iconSvg}</span>`
          + `<span class="half-meta"><strong>${esc(t(nameKey))}</strong><small>${esc(t(badgeKey))}</small></span>`
          + `<span class="half-st ${on || online ? 'on' : ''}"><span class="pulsedot"></span>${on ? esc(t('node_active_badge')) : (online ? esc(t('node_signal_online')) : esc(t('node_signal_waiting')))}</span>`
          + `</button>`;
      };
      nodesHtml = `<div class="halves" role="group" aria-label="${esc(t('nodes_title'))}">`
        + nodeBtn(d1, U.icons.leaf, 'node_1_name', 'node_1_badge')
        + nodeBtn(d2, U.icons.node, 'node_2_name', 'node_2_badge')
        + `</div>`;
    }

    return `<div class="farmstrip">`
      + `<div class="farmmain">`
      + `<span class="farmavatar" aria-hidden="true">${info.emoji}</span>`
      + `<div class="farmcopy">`
      + `<div class="farmcrop"><strong>${esc(info.cropName)}</strong> <span class="stagepill">${esc(t('stage_' + info.stage))}</span></div>`
      + `<div class="farmmeta"><span class="meta-ic">${U.icons.pin}</span> ${esc((U.profile && U.profile.pincode) || '342001')} • ${fmt1(info.sizeValue)} ${esc(t('acres_unit'))} • ${esc(info.label)}</div>`
      + `</div></div>`
      + `<div class="farmside">${srcBadge}<button class="editpill" type="button" data-open-profile="1">${U.icons.farm} <span>${esc(t('edit_label'))}</span></button></div>`
      + `</div>` + nodesHtml;
  };

  /* ---------- 4. Minimalist Field Verdict & Daily Advice ---------- */
  C.heroVerdict = (opts) => {
    opts = opts || {};
    const a = U.analysis;
    const issues = a ? a.issues : [];
    const n = issues.length;
    const mapCond = { water: 'cond_water', heat: 'cond_heat', soil: 'cond_soil', weather: 'cond_weather' };

    const issuePills = n > 0
      ? `<div class="issue-pills">` + issues.map((id) => {
          const st = U.statusOf(id);
          return `<button class="issue-pill ${st.tone}" type="button" data-sheet="${id}"><span class="pill-ic">${U.icons.warn}</span> <span>${esc(t(mapCond[id]))}:</span> <strong>${esc(st.value)}</strong> ${U.icons.chev}</button>`;
        }).join('') + `</div>`
      : '';

    const statusBanner = n === 0
      ? `<div class="herostatus ok"><span class="hs-ic" aria-hidden="true">${U.icons.check}</span><div><strong>${esc(t('farm_looks_good'))}</strong><span>${esc(t('farm_looks_good_sub'))}</span></div></div>`
      : `<div class="herostatus warn"><span class="hs-ic" aria-hidden="true">${U.icons.warn}</span><div><strong>${n} ${esc(n === 1 ? t('thing_to_check') : t('things_to_check')).toUpperCase()}</strong><span>${esc(t('what_to_check'))}</span></div></div>`;

    const adviceTxt = U.heroAdvice || (E.i18n.lang === 'hi' ? 'विश्लेषण जारी…' : 'Analyzing…');
    const speakingHero = !!(U.isSpeaking && U.speakingText === adviceTxt);

    return `<div class="herocard">`
      + statusBanner
      + issuePills
      + `<div class="herohead">`
      + `<span class="heroav" aria-hidden="true">${U.icons.sparkle}</span>`
      + `<div class="herohead-copy"><strong>${esc(t('hero_advice_title'))}</strong><small>${esc(t('hero_advice_time'))}</small></div>`
      + `</div>`
      + `<p class="herobody" id="hero-text">${esc(adviceTxt)}</p>`
      + `<div class="hero-cta">`
      + ((E.voice && E.voice.ttsSupported)
        ? `<button class="listenbtn ${speakingHero ? 'active speaking' : ''}" type="button" data-say-hero="1" aria-pressed="${speakingHero}"><span aria-hidden="true">${speakingHero ? U.icons.stop : U.icons.speaker}</span><span>${esc(speakingHero ? t('hero_advice_stop') : t('hero_advice_listen'))}</span>${speakingHero ? '<span class="live-wave-mini"><i></i><i></i><i></i></span>' : ''}</button>`
        : '')
      + `<button class="askbtn" type="button" data-go="agri"><span aria-hidden="true">${U.icons.mic}</span><span>${esc(t('ask_label'))}</span></button>`
      + `</div>`
      + `</div>`;
  };

  /* ---------- 5. Visual Status Pillar Card (Water, Heat, Soil, Weather) ---------- */
  C.statusPillarCard = (id) => {
    const st = U.statusOf(id);
    const s = U.snapshot, a = U.analysis;
    const crop = U.nodeInfo().crop;
    const cond = { water: 'cond_water', heat: 'cond_heat', soil: 'cond_soil', weather: 'cond_weather' }[id];
    const icon = { water: U.icons.drop, heat: U.icons.heat, soil: U.icons.leaf, weather: U.icons.cloud }[id];
    const mark = st.tone === 'good' ? U.icons.check : (st.tone === 'bad' ? U.icons.warn : (st.tone === 'mute' ? '–' : U.icons.up));

    let visualGauge = '';
    if (id === 'water' && s && s.moisture != null) {
      const pct = Math.min(100, Math.max(0, (s.moisture / 60) * 100));
      const loPct = Math.min(100, ((crop.moistureLow || 20) / 60) * 100);
      const hiPct = Math.min(100, ((crop.moistureGood || 35) / 60) * 100);
      visualGauge = `<div class="minigauge">`
        + `<div class="mg-track"><span class="mg-zone" style="left:${loPct}%;width:${Math.max(6, hiPct - loPct)}%"></span><span class="mg-fill ${st.tone}" style="width:${pct}%"></span><span class="mg-marker" style="left:${pct}%"></span></div>`
        + `<div class="mg-sub"><span>${esc(t('dry_label'))} &lt;${crop.moistureLow}%</span><span>${esc(t('st_good'))} ${crop.moistureLow}–${crop.moistureGood}%</span></div></div>`;
    } else if (id === 'heat' && s && s.tempC != null) {
      const pct = Math.min(100, Math.max(5, ((s.tempC - 5) / 45) * 100));
      visualGauge = `<div class="minigauge">`
        + `<div class="mg-track"><span class="mg-fill ${st.tone}" style="width:${pct}%"></span><span class="mg-marker" style="left:${pct}%"></span></div>`
        + `<div class="mg-sub"><span>${s.tmin != null ? fmt1(s.tmin) + '°' : ''} – ${s.tmax != null ? fmt1(s.tmax) + '°C' : ''}</span><span>${esc(t('st_good'))} ${crop.tempOptMin || 20}–${crop.tempOptMax || 32}°C</span></div></div>`;
    } else if (id === 'soil') {
      const n = a && a.nutrients ? a.nutrients : { n: 'unknown', p: 'unknown', k: 'unknown' };
      const pill = (lbl, val, band) => `<span class="npkmini ${band === 'good' ? 'good' : (band === 'unknown' ? 'mute' : 'warn')}"><b>${lbl}</b> ${val != null ? fmtInt(val) : '—'}</span>`;
      visualGauge = `<div class="npkrow-mini">${pill('N', s && s.n, n.n)}${pill('P', s && s.p, n.p)}${pill('K', s && s.k, n.k)}<span class="npkmini mute">pH ${s && s.ph != null ? fmt1(s.ph) : '—'}</span></div>`;
    } else if (id === 'weather') {
      const prob = U.outlook && U.outlook.estimate && U.outlook.estimate.prob != null ? U.outlook.estimate.prob : (U.outlook && U.outlook.current ? U.outlook.current.prob : null);
      visualGauge = `<div class="minigauge"><div class="mg-sub"><span>${s && s.pressureHpa != null ? fmt1(s.pressureHpa) + ' hPa' : '—'}</span>`
        + `<span>${prob != null ? `<span class="gauge-ic">${U.icons.rain}</span> ${fmtInt(prob)}%` : (s && s.humidity != null ? `<span class="gauge-ic">${U.icons.drop}</span> ${fmtInt(s.humidity)}% RH` : '')}</span></div></div>`;
    }

    return `<button class="stcard" type="button" data-sheet="${id}" data-tone="${st.tone}" aria-label="${esc(t(cond))}: ${esc(st.value)}">`
      + `<div class="sttop">`
      + `<span class="stic" data-m="${id}" aria-hidden="true">${icon}</span>`
      + `<div class="stmeta"><span class="stcond">${esc(t(cond))}</span><span class="stnum">${esc(U.measureOf(id))}</span></div>`
      + `<span class="stbadge ${st.tone}"><span aria-hidden="true">${mark}</span> ${esc(st.value)}</span>`
      + `</div>`
      + visualGauge
      + `<div class="stfoot"><span>${esc(st.action)}</span><span class="stgo" aria-hidden="true">${U.icons.chev}</span></div>`
      + `</button>`;
  };

  /* ---------- 6. Precision Nutrient Bar (NPK) ---------- */
  C.nutrientBar = (sym, fullKey, val, state, low, high) => {
    const tone = state === 'good' ? 'good' : (state === 'unknown' ? 'mute' : 'warn');
    const word = state === 'good' ? t('st_good') : (state === 'unknown' ? t('st_unknown') : (state === 'low' ? t('st_low') : t('st_high')));
    const maxScale = high * 1.6;
    const fillPct = val == null ? 0 : Math.min(100, Math.max(4, (val / maxScale) * 100));
    const bandLeft = (low / maxScale) * 100;
    const bandW = ((high - low) / maxScale) * 100;
    return `<div class="nutrow" data-tone="${tone}">`
      + `<div class="nuthead">`
      + `<span class="nutsym">${sym}</span>`
      + `<div class="nuttitle"><strong>${esc(t(fullKey))}</strong><small>${esc(t('st_good'))}: ${low}–${high} mg/kg</small></div>`
      + `<div class="nutval"><strong>${val != null ? fmtInt(val) : '—'}</strong> <small>mg/kg</small></div>`
      + `<span class="stbadge sm ${tone}">${esc(word)}</span>`
      + `</div>`
      + `<div class="meterbar"><span class="meterzone" style="left:${bandLeft.toFixed(1)}%;width:${bandW.toFixed(1)}%"></span>`
      + (val == null ? '' : `<span class="meterfill ${tone}" style="width:${fillPct.toFixed(1)}%"></span>`)
      + `</div>`
      + `</div>`;
  };

  /* ---------- 7. Precision pH Spectrum Meter ---------- */
  C.phSpectrumBar = (phVal, phTone, crop) => {
    const phWord = phTone === 'good' ? t('st_suitable') : (phTone === 'warn' ? (phVal < (crop.phMin || 6) ? t('st_acidic') : t('st_alkaline')) : t('st_unknown'));
    const phPin = phVal == null ? null : Math.min(98, Math.max(2, ((phVal - 4.0) / 5.0) * 100));
    const phOptLeft = Math.max(0, (((crop.phMin || 6.0) - 4.0) / 5.0) * 100);
    const phOptW = Math.min(100 - phOptLeft, (((crop.phMax || 7.5) - (crop.phMin || 6.0)) / 5.0) * 100);

    return `<div class="card">`
      + `<div class="card-hd"><span class="seclabel2">${esc(t('ev_ph'))}</span><span class="stbadge ${phTone}">${esc(phWord)}</span></div>`
      + `<div class="ph-visual-wrap">`
      + `<div class="bignum">${phVal != null ? fmt1(phVal) : '—'} <small class="unit">pH</small></div>`
      + `<div class="ph-scale-legend"><span>4.0 (${esc(t('st_acidic'))})</span><span>7.0 (${esc(t('st_good'))})</span><span>9.0 (${esc(t('st_alkaline'))})</span></div>`
      + `<div class="phbar"><span class="ph-zone" style="left:${phOptLeft.toFixed(1)}%;width:${phOptW.toFixed(1)}%"></span>`
      + (phPin != null ? `<span class="phpin" style="left:${phPin.toFixed(1)}%"></span>` : '')
      + `</div>`
      + `<div class="bandword">${esc(t('opt_range'))}: <strong>${crop.phMin || 6.0}–${crop.phMax || 7.5} pH</strong> (${esc(crop.phNotes || t('soil_title'))})</div>`
      + `</div></div>`;
  };

  /* ---------- 8. Visual 5-Stage Crop Stepper ---------- */
  C.cropJourneyStepper = (activeStage, stages, onSelectStage) => {
    const stageArr = stages || E.CROP_STAGES || ['germination', 'vegetative', 'flowering', 'grain_filling', 'maturity'];
    const curIdx = Math.max(0, stageArr.indexOf(activeStage));
    const stepIcons = { germination: U.icons.sprout, vegetative: U.icons.leaf, flowering: U.icons.flower, grain_filling: U.icons.grain, maturity: U.icons.sparkle };

    const steps = stageArr.map((s, i) => {
      const isPast = i < curIdx;
      const isCur = i === curIdx;
      const cls = isCur ? 'step active' : (isPast ? 'step done' : 'step');
      return `<button class="${cls}" type="button" data-stage="${s}" aria-current="${isCur}">`
        + `<span class="step-num"><span class="step-emo" aria-hidden="true">${stepIcons[s] || (i + 1)}</span></span>`
        + `<span class="step-lbl">${esc(t('stage_' + s))}</span>`
        + `</button>`;
    }).join('');

    return `<div class="stepper-wrap" role="group" aria-label="${esc(t('farm_stage'))}">`
      + `<div class="stepper">${steps}</div>`
      + `</div>`;
  };

  /* ---------- 9. Inline & Full Pump Controller Component ---------- */
  C.pumpCard = () => {
    const p = U.pump ? U.pump.status() : { running: false, mode: 'auto', startBelow: 20, stopAbove: 35 };
    const moist = U.snapshot && U.snapshot.moisture != null ? `${fmt1(U.snapshot.moisture)}%` : '—';
    return `<div class="pumpcard ${p.running ? 'running' : ''}">`
      + `<div class="pumpcard-main" data-go="rover" role="button" tabindex="0" aria-label="${esc(t('pump_title'))}">`
      + `<span class="stic ${p.running ? 'pulse-icon' : ''}" data-tone="${p.running ? 'good' : 'mute'}" aria-hidden="true">${U.icons.pump}</span>`
      + `<div class="pumpcard-copy">`
      + `<div class="pumpcard-kicker">${esc(t('pump_title'))} • <span class="modebadge">${esc(p.mode === 'auto' ? t('mode_auto') : t('mode_manual'))}</span></div>`
      + `<div class="pumpcard-state">${p.running ? esc(t('auto_watering')) : esc(t('auto_waiting'))}</div>`
      + `<div class="pumpcard-sub">${esc(t('ev_moisture'))}: <strong>${esc(moist)}</strong> • ${esc(t('auto_start_below'))} ${p.startBelow}% / ${esc(t('auto_stop_above'))} ${p.stopAbove}%</div>`
      + `</div>`
      + `<span class="stgo" aria-hidden="true">${U.icons.chev}</span>`
      + `</div>`
      + `<div class="pumpcard-actions">`
      + `<button class="btn ${p.running ? 'danger' : 'primary'}" type="button" data-pump-toggle="1">${p.running ? U.icons.stop + ' ' + esc(t('dir_stop')) : U.icons.play + ' ' + esc(t('pump_start'))}</button>`
      + `<button class="btn secondary" type="button" data-go="rover">${U.icons.gear} <span>${esc(t('act_view'))}</span></button>`
      + `</div>`
      + `</div>`;
  };

  /* ---------- 10. Evidence Table Helper ---------- */
  C.evidenceList = (rows) =>
    `<ul class="evlist">${(rows || []).map(([k, v]) => `<li><span>${esc(k)}</span><strong>${esc(v)}</strong></li>`).join('')}</ul>`;

  /* ---------- 11. Minimalist SVG Area Sparkline ---------- */
  C.sparkline = (values, o) => {
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
      + `<polygon points="${areaPts}" fill="currentColor" opacity="0.10"/>`
      + `<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="currentColor"/>`
      + `</svg>`;
  };

  // Attach sparkline to U for backwards compatibility
  U.spark = C.sparkline;
  U.pumpCard = C.pumpCard;
})();
