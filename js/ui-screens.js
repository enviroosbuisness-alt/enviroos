/* EnviroOS — UI SCREENS (Ground-up Rework).
 * Dashboard screens, rich gauges, detail sheets, alerts, and dialogs.
 * Reads E.UI state + logic layer only.
 */
'use strict';
window.EnviroOS = window.EnviroOS || {};
(function () {
  const E = EnviroOS, U = E.UI;
  const t = U.t, esc = U.esc, fmt1 = U.fmt1, fmtInt = U.fmtInt, $ = U.$, IC = U.icons;

  /* ---------- shared modular components ---------- */
  const C = U.components || {};
  const secLabel = C.secLabel || ((key, rightHtml) => `<div class="seclabel"><span>${esc(t(key))}</span>${rightHtml ? `<span class="seclabel-rt">${rightHtml}</span>` : ''}</div>`);
  const speakBtn = C.speakBtn || ((text, label) => '');
  const farmHeader = (showNodes) => (C.farmContext ? C.farmContext({ showNodes }) : '');
  const statusCard = (id) => (C.statusPillarCard ? C.statusPillarCard(id) : '');
  const evRows = C.evidenceList || ((rows) => '');
  const nutRow = C.nutrientBar || ((sym, fullKey, val, state, low, high) => '');

  /* ---------- HOME (Action-First Streamlined) ---------- */
  U.vHome = () => {
    const lastVoiceHtml = U.lastVoice
      ? `<div class="voicecard">`
        + `<div class="vc-head"><span class="agriname">${U.icons.sparkle} Agri</span><span class="vq">“${esc(U.lastVoice.q || '')}”</span>`
        + `<button class="iconbtn sm" type="button" data-say="${esc(U.lastVoice.a || '')}" aria-label="${esc(t('agri_replay_audio'))}">${IC.speaker}</button></div>`
        + `<div class="va">${esc(U.lastVoice.a || '')}</div>`
        + (U.lastVoice.sources && U.lastVoice.sources.length
          ? `<div class="vc-sources"><span>${esc(t('sources_label'))}:</span> ` + U.lastVoice.sources.map((sr) => `<a href="${esc(sr.uri)}" target="_blank" rel="noopener">${esc(sr.title || 'Link')} ↗</a>`).join(' ') + `</div>`
          : '')
        + `</div>`
      : '';

    return farmHeader(true)
      + (C.heroVerdict ? C.heroVerdict() : '')
      + lastVoiceHtml
      + secLabel('farm_status', `<button class="textlink" type="button" data-say-home="1">${IC.speaker} ${esc(t('speak_label'))}</button>`)
      + `<div class="grid2">${statusCard('water')}${statusCard('heat')}${statusCard('soil')}${statusCard('weather')}</div>`
      + secLabel('pump_title')
      + (C.pumpCard ? C.pumpCard() : U.pumpCard())
      + `<div class="home-bottom-links">`
      + `<button class="card link-banner mk-banner" type="button" data-mk-open="crops">`
      + `<span class="lb-ic"><span class="material-symbols-outlined ui-ic" aria-hidden="true">storefront</span></span>`
      + `<div class="lb-copy"><strong>${esc(t('mk_title'))}</strong><small>${esc(t('mk_banner_sub'))}</small></div>`
      + `<span class="lb-cta">${esc(t('mk_shop_now'))} ›</span>`
      + `</button>`
      + `<button class="card link-banner hist-banner" type="button" data-go="history">`
      + `<span class="lb-ic">${IC.clock}</span>`
      + `<div class="lb-copy"><strong>${esc(t('hist_title'))} · ${esc(t('last_7_days'))}</strong><small>${esc(t('cloud_log_title'))}</small></div>`
      + `<span class="lb-cta">${esc(t('act_view'))} ›</span>`
      + `</button>`
      + `</div>`;
  };

  /* ---------- SOIL (Rich Gauges & Target Bands) ---------- */
  U.vSoil = () => {
    const s = U.snapshot, a = U.analysis;
    const info = U.nodeInfo();
    const crop = info.crop;
    const moist = s ? s.moisture : null;
    const band = moist == null ? 'unknown' : E.agri.moistureBand(moist, crop);
    const bandWord = {
      unknown: t('st_unknown'), crit_dry: t('st_crit_dry'), low: t('st_water_needed'),
      good: t('st_moisture_good'), high: t('st_stop_irrigation'), excess: t('st_drain_water')
    }[band];
    const moistTone = (band === 'good') ? 'good' : (band === 'unknown' ? 'mute' : (band === 'crit_dry' || band === 'excess' ? 'bad' : 'warn'));
    const pos = moist == null ? null : Math.min(100, Math.max(2, (moist / 60) * 100));
    const optLeft = Math.min(100, ((crop.moistureLow || 20) / 60) * 100);
    const optWidth = Math.max(6, Math.min(100 - optLeft, (((crop.moistureGood || 35) - (crop.moistureLow || 20)) / 60) * 100));

    const node2Notice = info.isNode2
      ? `<div class="noticecard warn"><div class="notice-txt"><strong>${esc(U.deviceLabel(E.MQTT_SECOND_DEVICE))}</strong><p>${esc(t('node_basic_npk_notice'))}</p></div>`
        + `<button class="btn primary sm" type="button" data-switch-node="${E.MQTT_DEFAULT_DEVICE}">${esc(t('node_switch_btn'))}</button></div>`
      : '';

    const nObj = a ? a.nutrients : null;
    const nutRow = (sym, fullKey, val, state, low, high) => {
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

    // pH spectrum bar (4.0 to 9.0)
    const phVal = s && s.ph != null ? s.ph : null;
    const phTone = a && a.ph.level === 'good' ? 'good' : (a && a.ph.level === 'watch' ? 'warn' : 'mute');
    const phWord = a && a.ph.level === 'good' ? t('st_suitable') : (a && a.ph.level === 'watch' ? (a.ph.direction === 'acidic' ? t('st_acidic') : t('st_alkaline')) : t('st_unknown'));
    const phPin = phVal == null ? null : Math.min(98, Math.max(2, ((phVal - 4.0) / 5.0) * 100));
    const phOptLeft = Math.max(0, ((crop.phMin - 4.0) / 5.0) * 100);
    const phOptW = Math.min(100 - phOptLeft, ((crop.phMax - crop.phMin) / 5.0) * 100);

    const soilSheet = U.sheetData('soil');

    return `<div class="screen-top"><h1 class="ptitle">${esc(t('soil_title'))}</h1>${speakBtn(U.saySoil())}</div>`
      + farmHeader(false)
      + node2Notice
      + `<div class="grid2">`
      + `<div class="card">`
      + `<div class="card-hd"><span class="seclabel2">${esc(t('moisture_title'))}</span><span class="stbadge ${moistTone}">${esc(bandWord)}</span></div>`
      + `<div class="hero-metric"><div class="bignum">${moist == null ? '—' : fmt1(moist) + '%'}</div>`
      + (s && s.series && s.series.moisture ? `<div class="tspark">${U.spark(s.series.moisture, { w: 120, h: 42 })}</div>` : '')
      + `</div>`
      + `<div class="meterbar lg"><span class="meterzone" style="left:${optLeft.toFixed(1)}%;width:${optWidth.toFixed(1)}%" title="${esc(t('st_good'))}"></span>`
      + (pos == null ? '' : `<span class="meterfill ${moistTone}" style="width:${pos.toFixed(1)}%"></span>`)
      + `</div>`
      + `<div class="meter-legend"><span>${esc(t('dry_label'))} &lt;${crop.moistureLow}%</span><span><strong>${esc(info.cropName)}: ${crop.moistureLow}–${crop.moistureGood}%</strong></span><span>${esc(t('wet_label'))} &gt;${crop.moistureExcess}%</span></div>`
      + `</div>`

      + `<div class="card">`
      + `<div class="card-hd"><span class="seclabel2">${esc(t('ph_title'))}</span><span class="stbadge ${phTone}">${esc(phWord)}</span></div>`
      + `<div class="bignum">${phVal != null ? fmt1(phVal) : '—'}</div>`
      + `<div class="phbar"><span class="phzone" style="left:${phOptLeft.toFixed(1)}%;width:${phOptW.toFixed(1)}%"></span>`
      + (phPin == null ? '' : `<span class="phpin" style="left:${phPin.toFixed(1)}%"></span>`)
      + `</div>`
      + `<div class="meter-legend"><span>${esc(t('acidic_label'))} (4.0)</span><span><strong>${esc(t('suitable_label'))} ${crop.phMin}–${crop.phMax}</strong></span><span>${esc(t('alkaline_label'))} (9.0)</span></div>`
      + `</div>`
      + `</div>`

      + `<div class="card">`
      + `<div class="card-hd"><span class="seclabel2">${esc(t('npk_title'))}</span><span class="stbadge ${nObj && nObj.level === 'good' ? 'good' : (nObj && nObj.level === 'watch' ? 'warn' : 'mute')}">${esc(nObj ? t(nObj.badgeKey) : t('st_unknown'))}</span></div>`
      + `<div class="nutlist">`
      + nutRow('N', 'nitrogen_full', s ? s.n : null, nObj ? nObj.n : 'unknown', crop.nLow, crop.nHigh)
      + nutRow('P', 'phosphorus_full', s ? s.p : null, nObj ? nObj.p : 'unknown', crop.pLow, crop.pHigh)
      + nutRow('K', 'potassium_full', s ? s.k : null, nObj ? nObj.k : 'unknown', crop.kLow, crop.kHigh)
      + `</div>`
      + (soilSheet ? `<div class="whybox"><strong>${esc(soilSheet.why)}</strong> — ${esc(soilSheet.todo)}</div>` : '')
      + `</div>`
      + `<button class="card link-banner hist-banner" type="button" data-go="history">`
      + `<span class="lb-ic">${IC.clock}</span>`
      + `<div class="lb-copy"><strong>${esc(t('hist_title'))} · ${esc(t('last_7_days'))}</strong><small>${esc(t('cloud_log_title'))}</small></div>`
      + `<span class="lb-cta">${esc(t('act_view'))} ›</span>`
      + `</button>`;
  };
  U.saySoil = () => {
    const s = U.snapshot;
    if (!s) return '';
    return `${t('soil_title')}. ${t('moisture_title')} ${fmt1(s.moisture)}%. ${t('nitrogen_full')} ${fmtInt(s.n)}. ${t('phosphorus_full')} ${fmtInt(s.p)}. ${t('potassium_full')} ${fmtInt(s.k)}. pH ${fmt1(s.ph)}.`;
  };

  /* ---------- CROP (Interactive Stage Stepper + 7-Day Growth Chart) ---------- */
  /* ---------- CROP HISTORY LINE GRAPHS ---------- */
  const CHIST_RANGES = {
    '24h': { ms: 86400000, bucket: 3600000 },          // hourly points
    '7d': { ms: 7 * 86400000, bucket: 6 * 3600000 },   // 6-hour points
    '30d': { ms: 30 * 86400000, bucket: 86400000 }     // daily points
  };
  const chistBucket = (rows, idx, range, now, scale) => {
    const R = CHIST_RANGES[range];
    const from = now - R.ms;
    const map = new Map();
    rows.forEach((r) => {
      if (r[0] < from || r[idx] == null) return;
      const b = Math.floor(r[0] / R.bucket);
      const e = map.get(b) || [0, 0];
      e[0] += r[idx]; e[1] += 1;
      map.set(b, e);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0])
      .map(([b, [sum, n]]) => ({ t: Math.min(now, b * R.bucket + R.bucket / 2), v: (sum / n) * (scale || 1) }));
  };
  // Catmull-Rom -> cubic Bezier for a smooth, honest line through every point.
  const smoothPath = (p, yLo, yHi) => {
    if (p.length < 2) return '';
    const cy = (v) => (yLo == null ? v : Math.min(yHi, Math.max(yLo, v)));
    let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = cy(p1[1] + (p2[1] - p0[1]) / 6);
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = cy(p2[1] - (p3[1] - p1[1]) / 6);
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  };
  U.lineChart = (o) => {
    const W = 340, H = 156, L = 36, R = 12, T = 14, B = 24;
    const dec = o.decimals != null ? o.decimals : 1;
    const fmtV = (v) => (dec === 0 ? fmtInt(v) : E.i18n.number(v, dec));
    const vals = [];
    o.lines.forEach((l) => l.pts.forEach((p) => vals.push(p.v)));
    if (o.band) vals.push(o.band[0], o.band[1]);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.12;
    min -= pad; max += pad;
    if (o.floor0 && min < 0) min = 0;
    const x = (ts) => L + ((ts - o.from) / Math.max(1, o.to - o.from)) * (W - L - R);
    const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
    let svg = `<svg class="lchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || '')}">`;
    svg += `<defs>` + o.lines.map((l, i) => `<linearGradient id="${o.id}-g${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l.color}" stop-opacity=".28"/><stop offset="1" stop-color="${l.color}" stop-opacity="0"/></linearGradient>`).join('') + `</defs>`;
    // optimal band for the selected crop
    if (o.band) {
      const y1 = y(o.band[1]), y2 = y(o.band[0]);
      svg += `<rect class="lc-band" x="${L}" y="${y1.toFixed(1)}" width="${W - L - R}" height="${Math.max(1, y2 - y1).toFixed(1)}" rx="3"/>`;
      svg += `<text class="lc-band-lbl" x="${W - R - 4}" y="${(y1 + 10).toFixed(1)}" text-anchor="end">${esc(t('st_good'))}</text>`;
    }
    // horizontal grid + y labels
    for (let i = 0; i <= 3; i++) {
      const v = min + ((max - min) * i) / 3;
      const yy = y(v).toFixed(1);
      svg += `<line class="lc-grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/>`;
      svg += `<text class="lc-ylbl" x="${L - 5}" y="${(+yy + 3).toFixed(1)}" text-anchor="end">${fmtV(v)}</text>`;
    }
    // x labels (4 ticks)
    for (let i = 0; i <= 3; i++) {
      const ts = o.from + ((o.to - o.from) * i) / 3;
      const d = new Date(ts);
      const lbl = o.range === '24h'
        ? `${String(d.getHours()).padStart(2, '0')}:00`
        : `${d.getDate()}/${d.getMonth() + 1}`;
      svg += `<text class="lc-xlbl" x="${x(ts).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : (i === 3 ? 'end' : 'middle')}">${lbl}</text>`;
    }
    // lines
    o.lines.forEach((l, i) => {
      const pts = l.pts.map((p) => [x(p.t), y(p.v)]);
      if (pts.length < 2) return;
      const d = smoothPath(pts, T, H - B);
      if (o.lines.length === 1) {
        svg += `<path d="${d} L${pts[pts.length - 1][0].toFixed(1)},${H - B} L${pts[0][0].toFixed(1)},${H - B} Z" fill="url(#${o.id}-g${i})"/>`;
      }
      svg += `<path d="${d}" fill="none" stroke="${l.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
      // hover/tap tooltips on every point
      l.pts.forEach((p, j) => {
        const dt = new Date(p.t);
        const when = o.range === '24h' ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : `${dt.getDate()}/${dt.getMonth() + 1} ${String(dt.getHours()).padStart(2, '0')}:00`;
        svg += `<circle class="lc-hit" cx="${pts[j][0].toFixed(1)}" cy="${pts[j][1].toFixed(1)}" r="6"><title>${esc(l.label)} · ${when}: ${fmtV(p.v)}${esc(o.unit || '')}</title></circle>`;
      });
      const lp = pts[pts.length - 1];
      svg += `<circle cx="${lp[0].toFixed(1)}" cy="${lp[1].toFixed(1)}" r="4" fill="${l.color}" stroke="var(--card)" stroke-width="2"/>`;
    });
    return svg + `</svg>`;
  };

  U.cropHistoryCard = () => {
    const info = U.nodeInfo();
    const crop = info.crop || {};
    if (!U.cropHistRange) {
      try { U.cropHistRange = localStorage.getItem('enviroos.chistRange') || '7d'; } catch (_) { U.cropHistRange = '7d'; }
    }
    const range = CHIST_RANGES[U.cropHistRange] ? U.cropHistRange : '7d';
    const rows = U.cropLogRows ? U.cropLogRows() : [];
    const now = Date.now();
    const from = now - CHIST_RANGES[range].ms;
    // row index: 1 moisture, 2 temp, 3 humidity, 4 lux, 5 n, 6 p, 7 k, 8 ph, 9 gdd
    const metrics = [
      { id: 'moist', name: t('ev_moisture'), unit: '%', dec: 1, lines: [{ idx: 1, color: '#3B82F6', label: t('ev_moisture') }], band: [crop.moistureLow, crop.moistureGood], floor0: true },
      { id: 'temp', name: t('ev_temp'), unit: '°C', dec: 1, lines: [{ idx: 2, color: '#F97316', label: t('ev_temp') }], band: [crop.tempOptMin, crop.tempOptMax] },
      { id: 'hum', name: t('ev_humidity'), unit: '%', dec: 0, lines: [{ idx: 3, color: '#06B6D4', label: t('ev_humidity') }], floor0: true },
      { id: 'sun', name: t('ev_sun'), unit: 'k lux', dec: 1, lines: [{ idx: 4, color: '#EAB308', label: t('ev_sun'), scale: 0.001 }], band: crop.luxLow ? [crop.luxLow / 1000, crop.luxGood / 1000] : null, floor0: true },
      { id: 'npk', name: 'N · P · K', unit: ' mg/kg', dec: 0, lines: [{ idx: 5, color: '#22C55E', label: 'N' }, { idx: 6, color: '#0EA5E9', label: 'P' }, { idx: 7, color: '#F59E0B', label: 'K' }], floor0: true },
      { id: 'ph', name: t('ev_ph'), unit: '', dec: 2, lines: [{ idx: 8, color: '#A855F7', label: 'pH' }], band: [crop.phMin, crop.phMax] },
      { id: 'gdd', name: t('gdd_total'), unit: ' GDD', dec: 0, lines: [{ idx: 9, color: '#16A34A', label: 'GDD' }], floor0: true }
    ];
    const charts = metrics.map((m) => {
      const lines = m.lines.map((l) => ({ color: l.color, label: l.label, pts: chistBucket(rows, l.idx, range, now, l.scale) }));
      const main = lines[0].pts;
      if (!lines.some((l) => l.pts.length >= 2)) {
        return `<div class="chist-item empty"><div class="chist-hd"><span class="chist-dot" style="background:${m.lines[0].color}"></span><strong>${esc(m.name)}</strong></div>`
          + `<div class="chist-wait">${U.icons.clock} <span>${esc(t('chist_collecting'))}</span></div></div>`;
      }
      const fmtV = (v) => (m.dec === 0 ? fmtInt(v) : E.i18n.number(v, m.dec));
      const vs = main.map((p) => p.v);
      const nowTxt = lines.length > 1
        ? lines.map((l) => (l.pts.length ? `<span style="color:${l.color}">${esc(l.label)} ${fmtV(l.pts[l.pts.length - 1].v)}</span>` : '')).join(' ')
        : (vs.length ? `${fmtV(vs[vs.length - 1])}${esc(m.unit)}` : '—');
      const stats = vs.length
        ? `<span>${esc(t('chist_min'))} <b>${fmtV(Math.min(...vs))}</b></span><span>${esc(t('chist_avg'))} <b>${fmtV(vs.reduce((a, b) => a + b, 0) / vs.length)}</b></span><span>${esc(t('chist_max'))} <b>${fmtV(Math.max(...vs))}</b></span>`
        : '';
      const legend = lines.length > 1
        ? `<div class="chist-legend">${lines.map((l) => `<span><i style="background:${l.color}"></i>${esc(l.label)}</span>`).join('')}</div>`
        : '';
      const band = m.band && m.band[0] != null && m.band[1] != null ? m.band : null;
      return `<div class="chist-item">`
        + `<div class="chist-hd"><span class="chist-dot" style="background:${m.lines[0].color}"></span><strong>${esc(m.name)}</strong><span class="chist-now">${nowTxt}</span></div>`
        + U.lineChart({ id: `ch-${m.id}`, label: m.name, lines, band, from, to: now, range, unit: m.unit, decimals: m.dec, floor0: m.floor0 })
        + legend
        + (lines.length === 1 ? `<div class="chist-stats">${stats}</div>` : '')
        + `</div>`;
    }).join('');

    const first = rows.length ? new Date(rows[0][0]) : null;
    const seg = Object.keys(CHIST_RANGES).map((r) => `<button class="segopt sm" type="button" data-chist-range="${r}" aria-pressed="${r === range}">${esc(t('chist_range_' + r))}</button>`).join('');
    return `<div class="card crop-hist-card">`
      + `<div class="card-hd chist-top"><span class="seclabel2">${U.icons.chart || U.icons.clock} ${esc(t('chist_title'))} · ${esc(info.cropName)}</span>`
      + `<div class="seg chist-seg" role="group" aria-label="${esc(t('chist_title'))}">${seg}</div></div>`
      + `<div class="chist-grid">${charts}</div>`
      + `<div class="chist-foot"><small class="muted">${esc(E.i18n.plural('chist_reading_count', rows.length))}${first ? ` · ${esc(t('chist_since'))} ${esc(E.i18n.date(first, {dateStyle:'short'}))}` : ''} · ${esc(t('chist_saved_note'))}</small>`
      + `<div class="chist-actions"><button class="btn secondary sm" type="button" data-chist-export="1"><span class="material-symbols-outlined ui-ic" aria-hidden="true">download</span> <span>${esc(t('chist_export'))}</span></button>`
      + `<button class="btn secondary sm" type="button" data-chist-clear="1"><span class="material-symbols-outlined ui-ic" aria-hidden="true">delete</span> <span>${esc(t('chist_clear'))}</span></button></div></div>`
      + `</div>`;
  };

  U.vCrop = () => {
    const s = U.snapshot, a = U.analysis;
    const info = U.nodeInfo();
    const crop = info.crop;
    const c = a ? a.crop : null;
    const pct = c ? Math.round(c.progress * 100) : 0;
    const stages = E.CROP_STAGES.filter((x) => x !== 'harvest');
    const cur = s ? s.stage : 'vegetative';
    const curIdx = stages.indexOf(cur);

    const steps = stages.map((st, idx) => {
      const cls = st === cur ? 'now' : (idx < curIdx ? 'done' : '');
      const targetGdd = crop.gddStageTargets && crop.gddStageTargets[st] ? crop.gddStageTargets[st] : '';
      return `<button class="step ${cls}" type="button" data-set-stage="${st}" aria-pressed="${st === cur}">`
        + `<span class="sdot">${idx < curIdx ? U.icons.check : idx + 1}</span>`
        + `<span class="slbl">${esc(t('stage_' + st))}</span>`
        + (targetGdd ? `<small class="sgdd">${targetGdd} GDD</small>` : '')
        + `</button>`;
    }).join('<span class="slink" aria-hidden="true"></span>');

    // 7-day daily GDD & Temp chart
    const th = (s && s.tempHistory) || [];
    const perDay = (c && c.perDay) || [];
    const maxGdd = Math.max(25, ...perDay, 1);
    const dayBars = th.length
      ? `<div class="gddchart">` + th.map((d, i) => {
          const g = perDay[i] != null ? Math.round(perDay[i] * 10) / 10 : 0;
          const hPct = Math.min(100, Math.max(12, (g / maxGdd) * 100));
          return `<div class="gddcol">`
            + `<span class="gddval">+${fmtInt(g)}</span>`
            + `<div class="gddbar-wrap"><span class="gddbar" style="height:${hPct}%"></span></div>`
            + `<strong class="gddday">${esc(d.label || `D${i + 1}`)}</strong>`
            + `<small class="gddtmp">${fmtInt(d.tmin)}°–${fmtInt(d.tmax)}°</small>`
            + `</div>`;
        }).join('') + `</div>`
      : '';

    const allCropIds = Object.keys(E.CROPS);
    const cropPills = `<div class="crop-selector-wrap"><div class="crop-selector-bar" role="tablist" aria-label="${esc(t('farm_crop'))}">`
      + allCropIds.map((id) => {
          const isSel = (info.cropId || 'bajra') === id;
          return `<button class="crop-select-pill ${isSel ? 'active' : ''}" type="button" data-set-crop="${id}" aria-pressed="${isSel}">`
            + `<span class="c-emo" aria-hidden="true">${U.cropEmoji(id)}</span>`
            + `<span>${esc(t(E.CROPS[id].labelKey))}</span>`
            + `</button>`;
        }).join('')
      + `</div></div>`;

    const perspectiveCard = `<div class="card crop-perspective-card">`
      + `<div class="card-hd"><span class="seclabel2">${esc(info.cropName)} — ${esc(t('crop_stats_title') || 'Agronomic Perspective & Research Stats')}</span>`
      + `<span class="stbadge good">${U.cropEmoji(info.cropId)} ${esc(info.cropName)}</span></div>`
      + `<div class="refgrid">`
      + `<div class="refitem"><span>${esc(t('ev_moisture'))}</span><strong>${crop.moistureLow}–${crop.moistureGood}% VWC</strong><small>${esc(t('hist_latest'))}: ${s && s.moisture != null ? fmt1(s.moisture) + '%' : '—'} • ${esc(t('dry_label'))} &lt;${crop.moistureDry}%</small></div>`
      + `<div class="refitem"><span>${esc(t('ev_temp'))}</span><strong>${crop.tempOptMin}–${crop.tempOptMax}°C</strong><small>${esc(t('hist_latest'))}: ${s && s.tempC != null ? fmt1(s.tempC) + '°C' : '—'} • ${esc(t('crop_heat_stress'))} &gt;${crop.tempHeatStress}°C</small></div>`
      + `<div class="refitem"><span>${esc(t('ev_ph'))}</span><strong>${crop.phMin}–${crop.phMax} pH</strong><small>${esc(t('hist_latest'))}: ${s && s.ph != null ? fmt1(s.ph) : '—'} • ${esc(t(crop.phMin >= 6.5 ? 'soil_calcareous' : 'soil_loamy'))}</small></div>`
      + `<div class="refitem"><span>${esc(t('sun_title'))}</span><strong>${fmtInt(crop.luxGood / 1000)}k lux</strong><small>${esc(t('display_min'))}: ${fmtInt(crop.luxLow / 1000)}k • ${esc(t('crop_sunburn'))}: ${fmtInt(crop.luxScorch / 1000)}k</small></div>`
      + `</div>`

      + `</div>`;

    return `<div class="screen-top"><h1 class="ptitle">${esc(t('crop_title'))}</h1>${speakBtn(U.sayCrop())}</div>`
      + farmHeader(false)
      + cropPills
      + `<div class="card">`
      + `<div class="card-hd"><span class="seclabel2">${esc(t('development_title'))}</span><span class="stbadge good">${U.icons.check} ${esc(t('on_track'))}</span></div>`
      + `<div class="crop-progress-row">`
      + `<div><div class="bignum">${pct}${esc(t('gdd_unit'))}</div><div class="bandword">${esc(t('next_label'))}: <strong>${esc(t('stage_' + (c ? c.nextStage : 'vegetative')))}</strong></div></div>`
      + `<div class="gdd-pills">`
      + `<div class="gdd-pill"><span>${esc(t('gdd_total'))}</span><strong>${c ? Math.round(c.cumulativeGDD) : 0} / ${c ? c.nextTarget : 450}</strong></div>`
      + `<div class="gdd-pill"><span>${esc(t('gdd_today'))}</span><strong>+${c ? fmt1(c.dailyGDD) : 0} GDD</strong></div>`
      + `</div></div>`
      + `<div class="meterbar lg"><span class="meterfill good" style="width:${pct}%"></span></div>`
      + `<div class="stepper" role="group" aria-label="${esc(t('farm_stage'))}">${steps}</div>`
      + `</div>`

      + U.cropHistoryCard()
      + (dayBars ? `<div class="card"><div class="seclabel2">${esc(t('gdd_today'))} &amp; ${esc(t('temp_title'))} (${esc(t('last_7_days'))})</div>${dayBars}</div>` : '')

      + perspectiveCard;
  };
  U.sayCrop = () => {
    const s = U.snapshot, a = U.analysis;
    if (!s || !a) return '';
    return `${U.nodeInfo().cropName}. ${t('stage_' + s.stage)}. ${t('gdd_total')} ${Math.round(a.crop.cumulativeGDD)}. ${t('on_track')}.`;
  };

  /* ---------- WEATHER (Hourly + 3-Day Forecast + VPD Evaporation) ---------- */
  const wxIcon = (band) => ({
    clear: U.icons.sun, partly: U.icons.cloudSun, cloud: U.icons.cloud, rain: U.icons.rain, storm: U.icons.storm
  }[band] || U.icons.cloudSun);

  U.vWeather = () => {
    const s = U.snapshot, a = U.analysis, o = U.outlook;
    const trend = a ? a.weather.trend : { changeHpa: 0, band: 'unknown' };
    const vpd = a ? a.vpdKpa : null;
    const vpdBand = E.agri.vpdBand(vpd);
    const evapFast = vpdBand === 'high' || vpdBand === 'very_high';

    const isOnline = o && o.source === 'online';
    const rainProb = isOnline && o.current ? o.current.prob : (o && o.estimate ? o.estimate.prob : null);
    const skyBand = isOnline && o.current ? o.current.band : (o && o.estimate ? o.estimate.band : 'clear');
    const place = (isOnline && o.place) ? o.place : (U.profile.pincode || '342001');

    const hourlyHtml = isOnline && o.hourly && o.hourly.length
      ? `<div class="card"><div class="seclabel2">${esc(t('next_hours'))}</div>`
        + `<div class="wx-hourly">`
        + o.hourly.map((h) => `<div class="wxh-cell">`
            + `<span class="wxh-time">${esc(E.i18n.date(h.time.includes('T') ? h.time : '2000-01-01T' + h.time, {hour:'2-digit', minute:'2-digit'}))}</span>`
            + `<span class="wxh-ic" aria-hidden="true">${wxIcon(h.band)}</span>`
            + `<strong class="wxh-temp">${fmt1(h.tempC)}°</strong>`
            + `<span class="wxh-rain ${h.prob >= 40 ? 'wet' : ''}">${U.icons.drop} ${fmtInt(h.prob)}%</span>`
            + `</div>`).join('')
        + `</div></div>`
      : '';

    const dailyHtml = isOnline && o.daily && o.daily.length
      ? `<div class="card"><div class="seclabel2">${esc(t('next_days'))}</div>`
        + `<div class="wx-daily">`
        + o.daily.map((d) => `<div class="wxd-row">`
            + `<span class="wxd-date">${esc(E.i18n.date(d.date + 'T00:00:00', {weekday:'short', day:'numeric', month:'short'}))}</span>`
            + `<span class="wxd-sky"><span aria-hidden="true">${wxIcon(d.band)}</span> ${esc(t('wxc_' + d.band))}</span>`
            + `<span class="wxd-rain ${d.prob >= 40 ? 'wet' : ''}">${U.icons.drop} ${fmtInt(d.prob)}%</span>`
            + `<strong class="wxd-temp">${fmt1(d.tmin)}° – ${fmt1(d.tmax)}°C</strong>`
            + `</div>`).join('')
        + `</div></div>`
      : '';

    return `<div class="screen-top"><h1 class="ptitle">${esc(t('wx_title'))}</h1>${speakBtn(U.sayWeather())}</div>`
      + farmHeader(false)
      + `<div class="card wx-hero">`
      + `<div class="wx-hero-left">`
      + `<div class="seclabel2"><span class="meta-ic">${U.icons.pin}</span> ${esc(place)} • ${esc(isOnline ? t('rain_online') : t('rain_estimate'))}</div>`
      + `<div class="wx-hero-main"><span class="wx-bigic" aria-hidden="true">${wxIcon(skyBand)}</span>`
      + `<div><div class="bignum">${rainProb != null ? fmtInt(rainProb) + '%' : '—'}</div>`
      + `<div class="bandword">${esc(rainProb != null && rainProb > 20 ? t('rain_prob') : t('rain_none'))} • ${esc(t('wxc_' + skyBand))}</div></div></div>`
      + `</div>`
      + (isOnline && o.current && o.current.windSpeed != null
        ? `<div class="wx-wind">${IC.wind} <span><strong>${fmtInt(o.current.windSpeed)}</strong> km/h</span></div>`
        : '')
      + `</div>`

      + `<div class="grid2">`
      + `<div class="card">`
      + `<div class="card-hd"><span class="seclabel2">${esc(t('temp_title'))}</span><span class="stbadge ${a && a.heat.level === 'good' ? 'good' : 'warn'}">${esc(a ? t(a.heat.badgeKey) : '')}</span></div>`
      + `<div class="bignum">${s && s.tempC != null ? fmt1(s.tempC) + '°C' : '—'}</div>`
      + `<div class="bandword">${s && s.tmin != null ? `${esc(t('display_min'))} ${fmt1(s.tmin)}°C · ${esc(t('display_max'))} ${fmt1(s.tmax)}°C` : ''}</div>`
      + `</div>`

      + `<div class="card">`
      + `<div class="card-hd"><span class="seclabel2">${esc(t('sun_title'))}</span><span class="stbadge ${E.agri.lightBand(s && s.lux, U.nodeInfo().crop) === 'scorch' ? 'warn' : 'good'}">${esc(U.sunWord())}</span></div>`
      + `<div class="bignum">${s && s.lux != null ? fmtInt(s.lux / 1000) + 'k' : '—'} <small class="unit">lux</small></div>`
      + `<div class="bandword">${esc(t('ev_sun'))}</div>`
      + `</div>`

      + `<div class="card">`
      + `<div class="card-hd"><span class="seclabel2">${esc(t('air_title'))}</span><span class="stbadge ${evapFast ? 'warn' : 'good'}">${esc(evapFast ? t('water_loss_high') : t('water_loss_ok'))}</span></div>`
      + `<div class="bignum">${s && s.humidity != null ? fmtInt(s.humidity) + '%' : '—'} <small class="unit">RH</small></div>`
      + `<div class="bandword">${vpd != null ? `VPD: ${fmt1(vpd)} kPa` : esc(t('ev_humidity'))}</div>`
      + `</div>`

      + `<div class="card">`
      + `<div class="card-hd"><span class="seclabel2">${esc(t('pressure_title'))}</span><span class="stbadge ${trend.band === 'changing' ? 'warn' : 'good'}">${trend.band === 'changing' ? `${U.icons.down} <span>${esc(t('trend_falling'))}</span>` : `${U.icons.chev} <span>${esc(t('trend_flat'))}</span>`}</span></div>`
      + `<div class="hero-metric"><div class="bignum">${s && s.pressureHpa != null ? fmt1(s.pressureHpa) : '—'} <small class="unit">hPa</small></div>`
      + (s && s.series && s.series.pressure ? `<div class="tspark">${U.spark(s.series.pressure, { w: 100, h: 38 })}</div>` : '')
      + `</div>`
      + `<div class="bandword">${trend.changeHpa ? `${trend.changeHpa > 0 ? '+' : ''}${fmt1(trend.changeHpa)} hPa (3h)` : esc(t('ev_pressure'))}</div>`
      + `</div>`
      + `</div>`
      + hourlyHtml
      + dailyHtml;
  };
  U.sayWeather = () => {
    const s = U.snapshot;
    if (!s) return '';
    return `${t('wx_title')}. ${t('temp_title')} ${fmt1(s.tempC)}°C. ${U.sunWord()}. ${t('pressure_title')} ${fmt1(s.pressureHpa)}.`;
  };

  /* ---------- HISTORY (7-Day Trends + Cloud Log) ---------- */
  const trendWord = (vals, kind) => {
    const tr = E.agri.trendOf(vals || []);
    if (kind === 'moist') return tr === 'falling' ? t('trend_soil_drying') : t('trend_soil_ok');
    if (kind === 'temp') return tr === 'rising' ? t('trend_heat_rising') : t('trend_temp_ok');
    return tr === 'rising' ? t('trend_rising') : (tr === 'falling' ? t('trend_falling') : t('trend_flat'));
  };
  U.vHistory = () => {
    const s = U.snapshot, a = U.analysis;
    const series = (s && s.series) || {};
    const all = [
      { id: 'moist', name: t('ev_moisture'), unit: '%', now: s && s.moisture != null ? fmt1(s.moisture) + '%' : '—', word: trendWord(series.moisture, 'moist'), vals: series.moisture },
      { id: 'temp', name: t('ev_temp'), unit: '°C', now: s && s.tempC != null ? fmt1(s.tempC) + '°C' : '—', word: trendWord(series.temp, 'temp'), vals: series.temp },
      { id: 'sun', name: t('ev_sun'), unit: 'k', now: s && s.lux != null ? fmtInt(s.lux / 1000) + 'k' : '—', word: trendWord(series.lux), vals: (series.lux || []).map((x) => Math.round(x / 1000)) },
      { id: 'pres', name: t('ev_pressure'), unit: 'hPa', now: s && s.pressureHpa != null ? fmt1(s.pressureHpa) : '—', word: trendWord(series.pressure), vals: series.pressure },
      { id: 'gdd', name: t('gdd_total'), unit: 'GDD', now: a ? Math.round(a.crop.progress * 100) + '%' : '—', word: t('trend_rising'), vals: series.gdd }
    ];
    const rows = all.filter((r) => !(U.histHidden && U.histHidden[r.id]));
    const filts = all.map((r) => `<button class="filt" type="button" data-hist-filter="${r.id}" aria-pressed="${!(U.histHidden && U.histHidden[r.id])}">${esc(r.name)}</button>`).join('');

    return `<div class="screen-top"><div style="display:flex;align-items:center;gap:10px"><button class="btn secondary sm" type="button" data-back="1">${IC.back} <span>${esc(t('back_label'))}</span></button><h1 class="ptitle">${esc(t('hist_title'))} · ${esc(t('last_7_days'))}</h1></div>${speakBtn(U.sayHistory())}</div>`
      + `<div class="filtrow">${filts}</div>`
      + `<div class="card"><div class="trendlist">${rows.map((r) => {
          const vs = (r.vals || []).filter((v) => v != null && Number.isFinite(+v));
          const min = vs.length ? Math.min(...vs) : '—';
          const max = vs.length ? Math.max(...vs) : '—';
          return `<div class="trenditem">`
            + `<div class="ti-meta"><strong>${esc(r.name)}</strong><span class="ti-word">${esc(r.word)}</span><small class="muted">${esc(t('display_min'))} ${fmt1(min)} · ${esc(t('display_max'))} ${fmt1(max)}</small></div>`
            + `<div class="ti-now">${esc(r.now)}</div>`
            + `<div class="tspark">${U.spark(r.vals, { w: 132, h: 44 })}</div>`
            + `</div>`;
        }).join('')}</div></div>`
      + `<div class="card"><div class="card-hd"><span class="seclabel2">${esc(t('hist_cloud_title'))}</span>`
      + `<button class="btn secondary sm" type="button" id="btn-cloud">${IC.refresh} <span>${esc(t('hist_refresh'))}</span></button></div>`
      + `<div id="cloudbox"><p class="muted">${esc(t('hist_empty'))}</p></div>`
      + `</div>`;
  };
  U.sayHistory = () => {
    const s = U.snapshot, a = U.analysis;
    if (!s || !a) return '';
    return t('v_ans_stats')
      .replace('{moist}', trendWord(s.series && s.series.moisture, 'moist'))
      .replace('{m}', Math.round(s.moisture || 0))
      .replace('{temp}', trendWord(s.series && s.series.temp, 'temp'))
      .replace('{t}', Math.round(s.tempC || 0))
      .replace('{g}', Math.round(a.crop.cumulativeGDD));
  };

  /* ---------- DOSING & IRRIGATION CONTROLS (Water, Fertilizer, Compost, Pesticide) ---------- */
  U.renderDosingControls = () => {
    const info = U.nodeInfo ? U.nodeInfo() : { cropId: 'bajra', cropName: 'Bajra', emoji: '', stage: 'vegetative', sizeValue: 2.5, crop: { moistureLow: 20, moistureGood: 35 } };
    const crop = info.crop || { moistureLow: 20, moistureGood: 35 };
    const p = U.pump ? U.pump.status() : { running: false, mode: 'auto', startBelow: 20, stopAbove: 35, moisture: 26 };
    const dAll = U.dosing ? U.dosing.status() : {
      fertilizer: { rate: 35, recommended: 35, min: 2, max: 250, step: 2.5, unitKey: 'dosing_unit_kg_ac', level: 82, mode: 'auto', active: false },
      compost: { rate: 300, recommended: 300, min: 20, max: 2500, step: 25, unitKey: 'dosing_unit_kg_ac', level: 68, mode: 'auto', active: false },
      pesticide: { rate: 3.0, recommended: 3.0, min: 0.5, max: 25, step: 0.5, unitKey: 'dosing_unit_ml_l', level: 90, mode: 'auto', active: false },
      calc: E.agri && E.agri.calcDosing ? E.agri.calcDosing(U.snapshot, info, {}) : null,
      calcOpts: {}
    };
    const calc = dAll.calc || (E.agri && E.agri.calcDosing ? E.agri.calcDosing(U.snapshot, info, {}) : null);
    const m1 = calc ? calc.module1 : {};
    const m2 = calc ? calc.module2 : {};
    const m3 = calc ? calc.module3 : {};
    const C = E.DOSING_CONSTANTS || {};

    // Crop Prescription Banner (clean and beautiful without raw formula text; full equations live in Settings -> Formulae)
    const rxBanner = `<div class="card dose-rx-banner">`
      + `<div class="dose-rx-main">`
      + `<span class="dose-rx-emo" aria-hidden="true">${info.emoji || U.icons.sprout}</span>`
      + `<div class="dose-rx-copy">`
      + `<div class="dose-rx-title"><strong>${esc(info.cropName)}</strong> <span class="stagepill">${esc(t('stage_' + info.stage))}</span></div>`
      + `<div class="dose-rx-sub">${fmt1(info.sizeValue)} ${esc(t('acres_unit'))} (${calc ? calc.hectares : fmt1(info.sizeValue * 0.405)} ha) • <span class="dose-active-badge">${esc(t('dosing_title'))}</span></div>`
      + `</div>`
      + `</div>`
      + `<div class="dose-rx-actions">`
      + `<button class="btn secondary sm" type="button" data-open-profile="1">${U.icons.farm} <span>${esc(t('farm_crop'))}</span></button>`
      + `<button class="btn primary sm" type="button" data-dose-sync-crop="1">${U.icons.sparkle} <span>${esc(t('dosing_sync_btn'))}</span></button>`
      + `</div>`
      + `</div>`;

    // 1. Water / Irrigation Card (integrated into Rover tab)
    const moist = p.moisture != null ? p.moisture : (U.snapshot ? U.snapshot.moisture : null);
    const moistPct = moist == null ? 0 : Math.min(100, Math.max(4, (moist / 60) * 100));
    const loPct = Math.min(100, Math.max(0, ((p.startBelow || 20) / 60) * 100));
    const hiPct = Math.min(100, Math.max(loPct + 5, ((p.stopAbove || 35) / 60) * 100));
    const moistTone = moist == null ? 'mute' : (moist < p.startBelow ? 'warn' : (moist > p.stopAbove ? 'bad' : 'good'));

    const waterCardHtml = `<div class="card dose-card water-dose-card ${p.running ? 'is-dosing' : ''}" data-dose-card="water">`
      + `<div class="dose-card-top">`
      + `<span class="stic sm" data-tone="${p.running ? 'good' : 'mute'}" aria-hidden="true">${U.icons.pump || U.icons.drop}</span>`
      + `<div class="dose-meta">`
      + `<strong>${esc(t('dosing_water'))}</strong>`
      + `<small>${esc(t('dosing_water_sub'))}</small>`
      + `</div>`
      + `<span class="stbadge sm ${p.running ? 'good' : 'mute'}">${p.running ? '● ' + esc(t('auto_watering')) : esc(t('auto_waiting'))}</span>`
      + `</div>`

      + `<div class="dose-rec-strip">`
      + `<span>${U.icons.drop} ${esc(t('dosing_rec_label'))} (${esc(info.cropName)}): <b>${crop.moistureLow || 20}–${crop.moistureGood || 35}%</b></span>`
      + `<span class="dose-synced-tag">${moist != null ? fmt1(moist) + '%' : '—'}</span>`
      + `</div>`

      + `<div class="dose-water-steps">`
      + `<div class="dose-mini-step">`
      + `<label class="dose-mini-lbl" for="f-start">${esc(t('auto_start_below'))} (%)</label>`
      + `<div class="numstep dose-step">`
      + `<button type="button" class="stepbtn sm" data-step="f-start" data-delta="-1" aria-label="Decrease start threshold"><span aria-hidden="true">${IC.minus}</span></button>`
      + `<input id="f-start" type="number" inputmode="numeric" class="dose-inp" min="5" max="60" value="${p.startBelow}">`
      + `<button type="button" class="stepbtn sm" data-step="f-start" data-delta="1" aria-label="Increase start threshold"><span aria-hidden="true">${IC.plus}</span></button>`
      + `</div>`
      + `</div>`
      + `<div class="dose-mini-step">`
      + `<label class="dose-mini-lbl" for="f-stop">${esc(t('auto_stop_above'))} (%)</label>`
      + `<div class="numstep dose-step">`
      + `<button type="button" class="stepbtn sm" data-step="f-stop" data-delta="-1" aria-label="Decrease stop threshold"><span aria-hidden="true">${IC.minus}</span></button>`
      + `<input id="f-stop" type="number" inputmode="numeric" class="dose-inp" min="10" max="80" value="${p.stopAbove}">`
      + `<button type="button" class="stepbtn sm" data-step="f-stop" data-delta="1" aria-label="Increase stop threshold"><span aria-hidden="true">${IC.plus}</span></button>`
      + `</div>`
      + `</div>`
      + `</div>`

      + `<div class="dose-summary-line">`
      + `<span>${esc(t('ev_moisture'))}</span>`
      + `<strong>${moist != null ? fmt1(moist) + '%' : '—'} <small>(${p.startBelow}%–${p.stopAbove}%)</small></strong>`
      + `</div>`

      + `<div class="dose-tank">`
      + `<div class="dose-tank-hd"><span>${esc(t('moisture_title'))}: <b>${moist != null ? fmt1(moist) + '%' : '—'}</b></span>`
      + `<span class="muted">${esc(t('st_good'))}: ${crop.moistureLow || 20}–${crop.moistureGood || 35}%</span>`
      + `</div>`
      + `<div class="meterbar"><span class="meterzone" style="left:${loPct.toFixed(1)}%;width:${Math.max(5, hiPct - loPct).toFixed(1)}%"></span>`
      + (moist != null ? `<span class="meterfill ${moistTone}" style="width:${moistPct.toFixed(1)}%"></span>` : '')
      + `</div>`
      + `</div>`

      + `<div class="dose-foot">`
      + `<div class="seg dose-seg" role="group" aria-label="${esc(t('pump_mode'))}">`
      + `<button class="segopt sm" type="button" data-seg="pump" data-val="auto" aria-pressed="${p.mode === 'auto'}">${esc(t('mode_auto'))}</button>`
      + `<button class="segopt sm" type="button" data-seg="pump" data-val="manual" aria-pressed="${p.mode === 'manual'}">${esc(t('mode_manual'))}</button>`
      + `</div>`
      + `<button class="btn ${p.running ? 'danger' : 'primary'} sm dose-act-btn" type="button" data-pump-toggle="1">`
      + `${p.running ? U.icons.stop + ' ' + esc(t('dir_stop')) : U.icons.play + ' ' + esc(t('pump_start'))}`
      + `</button>`
      + `</div>`
      + `</div>`;

    // Grade selector options for Fertilizer (Module 01)
    const grades = C.FERTILIZER_GRADES || {};
    const gradeSelectHtml = `<div class="dose-inline-select">`
      + `<label class="dose-mini-lbl" for="dose-fert-grade">${esc(t('dosing_grade_select'))}</label>`
      + `<select id="dose-fert-grade" class="dose-select" data-dose-calc-opt="fertGrade">`
      + Object.keys(grades).map((gk) => {
          const g = grades[gk];
          const cleanLabel = g.id === 'rdf_blend' ? (E.i18n.lang === 'hi' ? 'खेत मिश्रण (Urea + DAP + MOP)' : 'Crop Blend (Urea + DAP + MOP)') : g.label;
          return `<option value="${esc(g.id)}" ${m1.gradeId === g.id ? 'selected' : ''}>${esc(cleanLabel)}</option>`;
        }).join('')
      + `</select></div>`;

    // Top-dressing depth selector for Compost (Module 02)
    const depths = C.TOP_DRESS_DEPTHS || [];
    const depthSelectHtml = `<div class="dose-inline-select">`
      + `<label class="dose-mini-lbl" for="dose-comp-depth">${esc(t('dosing_top_dress'))}</label>`
      + `<select id="dose-comp-depth" class="dose-select" data-dose-calc-opt="topDressCm">`
      + depths.map((dp) => `<option value="${dp.depthCm}" ${+m2.topDressCm === +dp.depthCm ? 'selected' : ''}>${esc(t(dp.labelKey))}</option>`).join('')
      + `</select></div>`;

    // Canopy preset selector for Pesticide (Module 03)
    const canopies = C.CANOPY_REFERENCE_MATRIX || {};
    const canopySelectHtml = `<div class="dose-inline-select">`
      + `<label class="dose-mini-lbl" for="dose-pest-canopy">${esc(t('dosing_trv_label'))}</label>`
      + `<select id="dose-pest-canopy" class="dose-select" data-dose-calc-opt="canopyPreset">`
      + Object.keys(canopies).map((ck) => {
          const cp = canopies[ck];
          const lbl = ck === 'crop_auto' ? `${info.cropName} (${esc(t('stage_' + info.stage))})` : cp.label;
          return `<option value="${esc(cp.id)}" ${m3.canopyPresetId === cp.id ? 'selected' : ''}>${esc(lbl)}</option>`;
        }).join('')
      + `</select></div>`;

    const configs = [
      {
        id: 'fertilizer',
        titleKey: 'dosing_fertilizer',
        subKey: 'dosing_fert_sub',
        icon: U.icons.flask,
        actKey: 'dosing_dispense',
        selectorHtml: gradeSelectHtml,
        summaryLabel: `${esc(t('dosing_total_farm'))} (${fmt1(info.sizeValue)} ac)`,
        summaryVal: `${fmt1((dAll.fertilizer.rate || 0) * info.sizeValue)} kg`
      },
      {
        id: 'compost',
        titleKey: 'dosing_compost',
        subKey: 'dosing_comp_sub',
        icon: U.icons.compost || U.icons.leaf,
        actKey: 'dosing_dispense',
        selectorHtml: depthSelectHtml,
        summaryLabel: `${esc(t('dosing_total_farm'))} (${fmt1(info.sizeValue)} ac)`,
        summaryVal: `${fmtInt((dAll.compost.rate || 0) * info.sizeValue)} kg`
      },
      {
        id: 'pesticide',
        titleKey: 'dosing_pesticide',
        subKey: 'dosing_pest_sub',
        icon: U.icons.bug,
        actKey: 'dosing_spray',
        selectorHtml: canopySelectHtml,
        summaryLabel: `${esc(t('dosing_tank_mix'))} (${m3.vTankL || 16}L)`,
        summaryVal: `${fmt1((m3.vTankL || 16) * (dAll.pesticide.rate || 0))} mL`
      }
    ];

    const dosingCardsHtml = configs.map((cfg) => {
      const d = dAll[cfg.id] || {};
      const unit = t(d.unitKey || 'dosing_unit_kg_ac');
      const lvl = d.level != null ? d.level : 80;
      const lvlTone = lvl < 25 ? 'bad' : (lvl < 50 ? 'warn' : 'good');
      const rec = d.recommended != null ? d.recommended : d.rate;
      const isDiff = Math.abs((+d.rate || 0) - (+rec || 0)) >= 0.2;

      return `<div class="card dose-card ${d.active ? 'is-dosing' : ''}" data-dose-card="${cfg.id}">`
        + `<div class="dose-card-top">`
        + `<span class="stic sm" data-tone="${d.active ? 'good' : 'mute'}" aria-hidden="true">${cfg.icon}</span>`
        + `<div class="dose-meta">`
        + `<strong>${esc(t(cfg.titleKey))}</strong>`
        + `<small>${esc(t(cfg.subKey))}</small>`
        + `</div>`
        + `<span class="stbadge sm ${d.active ? 'good' : 'mute'}">${d.active ? '● ' + esc(t('dosing_active')) : esc(t('dosing_standby'))}</span>`
        + `</div>`

        + `<div class="dose-rec-strip">`
        + `<span>${U.icons.sprout} ${esc(t('dosing_rec_label'))} (${esc(info.cropName)}): <b>${fmt1(rec)} ${esc(unit)}</b></span>`
        + (isDiff ? `<button type="button" class="textlink xs" data-dose-apply-rec="${cfg.id}">${U.icons.check} ${esc(t('dosing_apply_rec'))}</button>` : `<span class="dose-synced-tag">${U.icons.check} Auto Rx</span>`)
        + `</div>`

        + cfg.selectorHtml

        + `<div class="dose-rate-box">`
        + `<div class="dose-rate-hd"><span>${esc(t('dosing_rate'))}</span><strong>${fmt1(d.rate)} <small>${esc(unit)}</small></strong></div>`
        + `<div class="numstep dose-step">`
        + `<button type="button" class="stepbtn sm" data-dose-step="${cfg.id}" data-delta="${-d.step}" aria-label="Decrease ${esc(t(cfg.titleKey))}"><span aria-hidden="true">${IC.minus}</span></button>`
        + `<input type="number" inputmode="decimal" class="dose-inp" data-dose-input="${cfg.id}" min="${d.min}" max="${d.max}" step="${d.step}" value="${d.rate}" aria-label="${esc(t(cfg.titleKey))} ${esc(t('dosing_rate'))}">`
        + `<button type="button" class="stepbtn sm" data-dose-step="${cfg.id}" data-delta="${d.step}" aria-label="Increase ${esc(t(cfg.titleKey))}"><span aria-hidden="true">${IC.plus}</span></button>`
        + `</div>`
        + `</div>`

        + `<div class="dose-summary-line">`
        + `<span>${cfg.summaryLabel}</span>`
        + `<strong>${esc(cfg.summaryVal)}</strong>`
        + `</div>`

        + `<div class="dose-tank">`
        + `<div class="dose-tank-hd"><span>${esc(t('dosing_level'))}: <b>${lvl}%</b></span>`
        + (lvl < 100 ? `<button type="button" class="textlink xs" data-dose-refill="${cfg.id}">${U.icons.refresh} ${esc(t('dosing_refill'))}</button>` : '')
        + `</div>`
        + `<div class="meterbar"><span class="meterfill ${lvlTone}" style="width:${lvl}%"></span></div>`
        + `</div>`

        + `<div class="dose-foot">`
        + `<div class="seg dose-seg" role="group" aria-label="${esc(t(cfg.titleKey))} mode">`
        + `<button class="segopt sm" type="button" data-dose-mode="${cfg.id}" data-val="auto" aria-pressed="${d.mode === 'auto'}">${esc(t('mode_auto'))}</button>`
        + `<button class="segopt sm" type="button" data-dose-mode="${cfg.id}" data-val="manual" aria-pressed="${d.mode !== 'auto'}">${esc(t('mode_manual'))}</button>`
        + `</div>`
        + `<button class="btn ${d.active ? 'danger' : 'primary'} sm dose-act-btn" type="button" data-dose-toggle="${cfg.id}">`
        + `${d.active ? U.icons.stop + ' ' + esc(t('dir_stop')) : U.icons.play + ' ' + esc(t(cfg.actKey))}`
        + `</button>`
        + `</div>`
        + `</div>`;
    }).join('');

    return rxBanner + `<div class="dosing-grid cols4">` + waterCardHtml + dosingCardsHtml + `</div>`;
  };

  /* ---------- PUMP (Smart Threshold Visualizer & Tactile Controls) ---------- */
  U.vRobot = () => {
    const info = U.nodeInfo();
    const crop = info.crop;
    const p = U.pump ? U.pump.status() : { available: false, startBelow: 20, stopAbove: 35 };
    const r = U.rover ? U.rover.status() : { moving: false, direction: 'stopped', speed: 150 };
    const moist = p.moisture;
    const loPct = Math.min(100, Math.max(0, (p.startBelow / 60) * 100));
    const hiPct = Math.min(100, Math.max(0, (p.stopAbove / 60) * 100));
    const curPct = moist == null ? null : Math.min(98, Math.max(2, (moist / 60) * 100));

    const node2Notice = info.isNode2 && U.source !== 'demo'
      ? `<div class="noticecard warn"><div class="notice-txt"><strong>${esc(U.deviceLabel(E.MQTT_SECOND_DEVICE))}</strong><p>${esc(t('node_basic_motor_notice'))}</p></div>`
        + `<button class="btn primary sm" type="button" data-switch-node="${E.MQTT_DEFAULT_DEVICE}">${esc(t('node_switch_btn'))}</button></div>`
      : '';

    return `<div class="screen-top"><h1 class="ptitle">${esc(t('pump_title'))}</h1></div>`
      + farmHeader(false)
      + node2Notice
      + `<div class="grid2">`
      + `<div class="card">`
      + `<div class="card-hd"><span class="seclabel2">${esc(t('pump_title'))}</span>`
      + `<span class="stbadge ${p.health === 'fault' ? 'bad' : (p.running ? 'good' : 'mute')}">${p.health === 'fault' ? esc(t('health_fault')) : (p.running ? '● ' + esc(t('auto_watering')) : esc(t('auto_waiting')))}</span></div>`
      + `<div class="pumpstate ${p.running ? 'on' : ''}">${p.running ? esc(t('auto_watering')) : esc(t('auto_waiting'))}</div>`
      + (p.fault ? `<div class="whybox bad">${esc(p.fault)} <button class="btn secondary sm" type="button" data-pump-clear-fault="1">OK</button></div>` : '')
      + `<button class="btn ${p.running ? 'danger' : 'primary'} block lg" type="button" data-pump-toggle="1">${p.running ? U.icons.stop + ' ' + esc(t('dir_stop')) : U.icons.play + ' ' + esc(t('pump_start'))}</button>`
      + `<div class="seg" role="group" aria-label="${esc(t('pump_title'))}">`
      + `<button class="segopt" type="button" data-pump-mode="auto" aria-pressed="${p.mode === 'auto'}">${esc(t('mode_auto'))}</button>`
      + `<button class="segopt" type="button" data-pump-mode="manual" aria-pressed="${p.mode === 'manual'}">${esc(t('mode_manual'))}</button></div>`

      + `<div class="thresh-viz">`
      + `<div class="tv-head"><span>${esc(t('ev_moisture'))}: <strong>${moist != null ? fmt1(moist) + '%' : '—'}</strong></span>`
      + `<button class="textlink" type="button" data-pump-preset="1">${U.icons.sprout} ${esc(info.cropName)} (${crop.moistureLow}–${crop.moistureGood}%)</button></div>`
      + `<div class="meterbar lg"><span class="meterzone" style="left:${loPct.toFixed(1)}%;width:${Math.max(4, hiPct - loPct).toFixed(1)}%"></span>`
      + (curPct == null ? '' : `<span class="phpin" style="left:${curPct.toFixed(1)}%"></span>`)
      + `</div>`
      + `<div class="meter-legend"><span>${U.icons.play} ${esc(t('auto_start_below'))}: <b>${p.startBelow}%</b></span><span>${U.icons.stop} ${esc(t('auto_stop_above'))}: <b>${p.stopAbove}%</b></span></div>`
      + `</div>`

      + `<div class="step-fields">`
      + `<div class="field"><label for="f-lo">${esc(t('auto_start_below'))} (%)</label>`
      + `<div class="numstep"><button type="button" class="stepbtn" data-step-input="f-lo" data-delta="-1">${IC.minus}</button><input id="f-lo" type="number" inputmode="decimal" value="${p.startBelow}"><button type="button" class="stepbtn" data-step-input="f-lo" data-delta="1">${IC.plus}</button></div></div>`
      + `<div class="field"><label for="f-hi">${esc(t('auto_stop_above'))} (%)</label>`
      + `<div class="numstep"><button type="button" class="stepbtn" data-step-input="f-hi" data-delta="-1">${IC.minus}</button><input id="f-hi" type="number" inputmode="decimal" value="${p.stopAbove}"><button type="button" class="stepbtn" data-step-input="f-hi" data-delta="1">${IC.plus}</button></div></div>`
      + `</div>`
      + `<div class="step-fields">`
      + `<div class="field"><label for="f-tp">${esc(t('auto_temp_above'))} (°C)</label><input id="f-tp" type="number" inputmode="decimal" placeholder="${esc(t('off_label'))}" value="${p.tempAbove == null ? '' : p.tempAbove}"></div>`
      + `<div class="field"><label for="f-lx">${esc(t('auto_lux_above'))} (lux)</label><input id="f-lx" type="number" inputmode="numeric" placeholder="${esc(t('off_label'))}" value="${p.luxAbove == null ? '' : p.luxAbove}"></div>`
      + `</div>`
      + `<p class="hint">${esc(t('triggers_hint'))}</p>`
      + `<button class="btn secondary block" type="button" data-pump-save="1">${U.icons.check} ${esc(t('save_label'))}</button>`
      + `</div>`

      + `<div>`
      + `<button class="card link-banner rover-banner" type="button" data-go="rover" style="width:100%;margin-bottom:12px">`
      + `<span class="lb-ic">${U.icons.rover}</span>`
      + `<div class="lb-copy"><strong>${esc(t('rover_title'))}</strong><small>${esc(t('rover_sub'))}</small></div>`
      + `<span class="lb-cta">${r.moving ? esc(t('motor_moving')) : esc(t('manual_drive'))} ›</span>`
      + `</button>`

      + `<div class="card"><div class="seclabel2">${esc(t('event_log'))}</div>`
      + (p.log && p.log.length
        ? `<ul class="loglist">${p.log.slice().reverse().map((e) => `<li><span class="logtime">${esc(e.time || '')}</span><span>${esc(e.msg)}</span></li>`).join('')}</ul>`
        : `<p class="muted">${esc(t('todo_none'))}</p>`)
      + `</div>`
      + `</div>`
      + `</div>`
      + secLabel('dosing_title', `<small class="muted">${esc(t('dosing_sub'))}</small>`)
      + U.renderDosingControls();
  };

  /* ---------- ROVER: full Pi / ESP32 mission control ---------- */
  U.vRover = () => `<div class="screen-top"><h1 class="ptitle">${esc(t('rover_title'))}</h1></div>`
    + `<iframe id="rover-mission-control" title="${esc(t('rover_title'))}" data-i18n-title="rover_title" src="${import.meta.env.BASE_URL}rover/index.html?embedded=1${import.meta.env.DEV ? '&amp;localPi=1' : ''}" allow="geolocation; fullscreen" class="rover-mission-frame"></iframe>`;

  U.sayRover = () => {
    const r = (U.rover && U.rover.status) ? U.rover.status() : { moving: false, speed: 150 };
    const d = (U.dosing && U.dosing.status) ? U.dosing.status() : null;
    const stWord = r.moving ? t('motor_moving') : t('motor_stopped');
    const doseTxt = (d && d.fertilizer && d.compost && d.pesticide)
      ? `${t('dosing_fertilizer')} ${d.fertilizer.rate} ${t(d.fertilizer.unitKey || 'dosing_unit_kg_ac')}. ${t('dosing_compost')} ${d.compost.rate} ${t(d.compost.unitKey || 'dosing_unit_kg_ac')}. ${t('dosing_pesticide')} ${d.pesticide.rate} ${t(d.pesticide.unitKey || 'dosing_unit_ml_l')}.`
      : '';
    return `${t('rover_title')}. ${stWord}. ${t('speed_label')} ${r.speed || 150}. ${doseTxt}`;
  };

  /* ---------- detail sheets ---------- */
  U.sheetHead = (condKey, st) =>
    `<div class="sheethead"><span class="stic big" data-tone="${st.tone}" aria-hidden="true">${st.tone === 'good' ? IC.check : IC.warn}</span>`
    + `<div><div class="stcond">${esc(t(condKey))}</div><div class="sheetval">${esc(st.value)}</div></div>`
    + `<span class="flexsp"></span><button class="iconbtn dark" type="button" data-close-sheet="1" aria-label="${esc(t('close_label'))}">${IC.close}</button></div>`;

  U.paintSheet = (id) => {
    const a = U.analysis, s = U.snapshot;
    if (!a || !s) return;
    const d = U.sheetData(id);
    if (!d) return;
    const routeMap = { water: 'soil', heat: 'weather', soil: 'soil', weather: 'weather', crop: 'crop' };
    const targetRoute = routeMap[id] || 'home';
    U.openSheet(
      U.sheetHead(d.cond, d.status)
      + `<div class="seclabel2" style="margin-top:14px">${esc(t('why_label'))}</div><div class="whybox"><strong>${esc(d.why)}</strong><p style="margin-top:4px">${esc(d.todo)}</p></div>`
      + `<div class="seclabel2">${esc(t('level_evidence'))}</div>` + evRows(d.evidence)
      + `<div class="sheet-actions">${speakBtn(d.say)}<button class="btn secondary" type="button" data-close-sheet="1" data-go="${targetRoute}">${esc(t('act_view'))} ›</button></div>`
      + `<details class="tech"><summary>${esc(t('tech_label'))} ▾</summary>${evRows(d.tech)}</details>`
    );
  };

  U.sheetData = (id) => {
    const s = U.snapshot, a = U.analysis;
    if (!s || !a) return null;
    const crop = E.getCrop(s.cropId);
    const full = [
      [t('ev_moisture'), `${fmt1(s.moisture)} %`], [t('ev_temp'), `${fmt1(s.tempC)} °C`],
      [t('ev_sun'), U.sunWord()], [t('ev_humidity'), s.humidity == null ? '—' : `${fmtInt(s.humidity)} %`],
      [t('ev_pressure'), `${fmt1(s.pressureHpa)} hPa`], [t('gdd_total'), `${Math.round(a.crop.progress * 100)} %`]
    ];
    const say = (parts) => parts.filter(Boolean).join('. ');
    if (id === 'water') {
      const st = U.statusOf('water');
      return {
        cond: 'cond_water', status: st,
        why: t(a.water.moistureBand === 'excess' ? 'why_water_excess' : (a.water.moistureBand === 'high' ? 'why_water_high' : 'why_water')),
        todo: t(a.water.moistureBand === 'excess' ? 'todo_water_excess' : (a.water.moistureBand === 'high' ? 'todo_water_high' : 'todo_water')),
        evidence: [[t('ev_moisture'), `${fmt1(s.moisture)} %`], [t('ev_temp'), `${fmt1(s.tempC)} °C`], [t('ev_sun'), U.sunWord()]],
        tech: full, say: say([`${t('cond_water')} ${st.value}`, `${t('ev_moisture')} ${fmt1(s.moisture)}%`])
      };
    }
    if (id === 'heat') {
      const st = U.statusOf('heat');
      return {
        cond: 'cond_heat', status: st,
        why: t(s.tempC < (crop.tempMin || 0) ? 'why_heat_cold' : 'why_heat'),
        todo: t(s.tempC < (crop.tempMin || 0) ? 'todo_heat_cold' : 'todo_heat'),
        evidence: [[t('ev_temp'), `${fmt1(s.tempC)} °C`], [t('ev_sun'), U.sunWord()], [t('ev_moisture'), `${fmt1(s.moisture)} %`]],
        tech: full, say: say([`${t('cond_heat')} ${st.value}`, `${fmt1(s.tempC)}°C`])
      };
    }
    if (id === 'soil') {
      const st = U.statusOf('soil');
      const f = a.nutrients.focus;
      return {
        cond: 'cond_soil', status: st,
        why: t(f === 'n' ? (a.nutrients.n === 'low' ? 'why_soil_n' : 'why_soil_n_high') : f === 'p' ? (a.nutrients.p === 'low' ? 'why_soil_p' : 'why_soil_p_high') : f === 'k' ? (a.nutrients.k === 'low' ? 'why_soil_k' : 'why_soil_k_high') : (a.ph.level === 'watch' ? 'why_soil_ph' : 'why_soil_ok')),
        todo: t(f ? 'todo_soil' : (a.nutrients.level === 'watch' && !f ? 'todo_soil_excess' : 'todo_none')),
        evidence: [[t('ev_n'), `${fmtInt(s.n)} mg/kg`], [t('ev_p'), `${fmtInt(s.p)} mg/kg`], [t('ev_k'), `${fmtInt(s.k)} mg/kg`], [t('ev_ph'), fmt1(s.ph)], [t('ev_moisture'), `${fmt1(s.moisture)} %`]],
        tech: full.concat([[t('ev_ph'), `${fmt1(s.ph)}`]]),
        say: say([`${t('cond_soil')} ${st.value}`, `N ${fmtInt(s.n)} P ${fmtInt(s.p)} K ${fmtInt(s.k)}`])
      };
    }
    if (id === 'weather') {
      const st = U.statusOf('weather');
      return {
        cond: 'cond_weather', status: st,
        why: t(a.weather.level === 'watch' ? 'why_weather_changing' : 'why_weather_ok'),
        todo: t('todo_weather'),
        evidence: [[t('ev_pressure'), `${fmt1(s.pressureHpa)} hPa`], [t('ev_temp'), `${fmt1(s.tempC)} °C`], [t('ev_sun'), U.sunWord()]],
        tech: full, say: say([`${t('pressure_title')} ${fmt1(s.pressureHpa)}`, st.value])
      };
    }
    if (id === 'crop') {
      const st = U.statusOf('crop');
      return {
        cond: 'cond_crop', status: st,
        why: t('why_crop_ok'), todo: t('todo_none'),
        evidence: [[t('crop_title'), U.nodeInfo().cropName], [t('farm_stage'), t('stage_' + s.stage)], [t('next_label'), t('stage_' + a.crop.nextStage)], [t('gdd_total'), `${Math.round(a.crop.progress * 100)} %`]],
        tech: full, say: say([`${U.nodeInfo().cropName}. ${t('stage_' + s.stage)}. ${t('gdd_total')} ${Math.round(a.crop.cumulativeGDD)}`])
      };
    }
    return null;
  };

  /* ---------- alerts sheet ---------- */
  U.sheetAlerts = () => {
    const a = U.analysis;
    const items = [];
    if (a) {
      const map = { water: 'cond_water', heat: 'cond_heat', soil: 'cond_soil', weather: 'cond_weather' };
      for (const id of a.issues) {
        const st = U.statusOf(id);
        items.push(`<button class="alertrow" type="button" data-sheet="${id}"><span class="stic sm" data-tone="${st.tone}" aria-hidden="true">${st.tone === 'good' ? IC.check : IC.warn}</span><span><strong>${esc(t(map[id]))}</strong><br><span class="muted">${esc(st.value)} — ${esc(st.action)}</span></span><span class="flexsp"></span><span aria-hidden="true">${IC.chev}</span></button>`);
      }
    }
    const p = U.pump ? U.pump.status() : null;
    if (p && p.fault) {
      items.push(`<div class="alertrow"><span class="stic sm" data-tone="bad" aria-hidden="true">${IC.warn}</span><span><strong>${esc(t('pump_title'))}</strong><br><span class="muted">${esc(p.fault)}</span></span></div>`);
    }
    U.openSheetId = null;
    const sayAll = items.length && a ? t('v_alert_say').replace('{items}', a.issues.map((id) => {
      const st = U.statusOf(id);
      return `${t({ water: 'cond_water', heat: 'cond_heat', soil: 'cond_soil', weather: 'cond_weather' }[id])} ${st.value}`;
    }).join('. ')) : '';
    U.openSheet(
      `<div class="sheethead"><div><div class="stcond">${esc(t('alerts_title'))}</div>`
      + `<div class="sheetval">${items.length ? `${items.length} ${esc(t('things_to_check'))}` : esc(t('no_alerts'))}</div></div>`
      + `<span class="flexsp"></span><button class="iconbtn dark" type="button" data-close-sheet="1" aria-label="${esc(t('close_label'))}">${IC.close}</button></div>`
      + (items.length ? `<div style="margin-top:12px">${items.join('')}</div>` + speakBtn(sayAll) : `<p class="muted" style="padding:12px 0">${esc(t('no_alerts'))}</p>`)
    );
  };

  /* ---------- dialogs ---------- */
  U.renderLangSelector = () => {
    const cur = E.i18n.lang || 'en';
    const langs = E.i18n.LANGS || [];
    const neutral = langs.find((l) => l.group === 'neutral') || { id: 'en', name: 'English', native: 'English' };
    const indian = langs.filter((l) => l.group === 'indian');
    const intl = langs.filter((l) => l.group === 'international');
    const curObj = langs.find((l) => l.id === cur);
    const activeTab = (curObj && curObj.group === 'international') ? 'international' : 'indian';

    const card = (l) => {
      const on = l.id === cur;
      return `<button class="choice lang-card ${on ? 'is-active' : ''}" type="button" data-lang="${l.id}" aria-pressed="${on}">`
        + `<span class="lang-card-top"><span class="lang-code-pill">${l.id.toUpperCase()}</span>${on ? `<span class="lang-check" aria-hidden="true">${U.icons.check}</span>` : ''}</span>`
        + `<span class="lang-native">${esc(l.native)}</span>`
        + `<small class="lang-sub">${esc(l.name || '')}</small>`
        + `</button>`;
    };

    const enOn = neutral.id === cur;
    return `<div class="lang-selector">`
      + `<div class="lang-neutral-section">`
      + `<div class="lang-sec-label">${esc(t('lang_neutral_label'))}</div>`
      + `<button class="lang-neutral-card ${enOn ? 'is-active' : ''}" type="button" data-lang="${neutral.id}" aria-pressed="${enOn}">`
      + `<span class="lang-neutral-ico" aria-hidden="true">${U.icons.globe}</span>`
      + `<span class="lang-neutral-meta"><strong>${esc(neutral.native)}</strong><small>${esc(t('lang_neutral_label'))} · Default</small></span>`
      + `<span class="lang-neutral-badge">${enOn ? U.icons.check + ' Active' : 'Select'}</span>`
      + `</button>`
      + `</div>`
      + `<div class="lang-tabs" role="tablist" aria-label="${esc(t('lang_title'))}">`
      + `<button class="lang-tab ${activeTab === 'indian' ? 'active' : ''}" type="button" role="tab" data-lang-tab="indian" aria-selected="${activeTab === 'indian'}">`
      + `<span class="lang-tab-ico" aria-hidden="true">${U.icons.flag}</span><span>${esc(t('lang_tab_indian'))}</span><span class="lang-tab-cnt">${indian.length}</span>`
      + `</button>`
      + `<button class="lang-tab ${activeTab === 'international' ? 'active' : ''}" type="button" role="tab" data-lang-tab="international" aria-selected="${activeTab === 'international'}">`
      + `<span class="lang-tab-ico" aria-hidden="true">${U.icons.globe}</span><span>${esc(t('lang_tab_intl'))}</span><span class="lang-tab-cnt">${intl.length}</span>`
      + `</button>`
      + `</div>`
      + `<div class="lang-pane ${activeTab === 'indian' ? 'active' : ''}" data-lang-pane="indian" ${activeTab === 'indian' ? '' : 'hidden'}>`
      + `<div class="choicegrid cols3 lang-grid">${indian.map(card).join('')}</div>`
      + `</div>`
      + `<div class="lang-pane ${activeTab === 'international' ? 'active' : ''}" data-lang-pane="international" ${activeTab === 'international' ? '' : 'hidden'}>`
      + `<div class="choicegrid cols3 lang-grid">${intl.map(card).join('')}</div>`
      + `</div>`
      + `</div>`;
  };

  U.dlgLang = () => {
    U.openDlg(`<div class="dlg-hd"><h2>${esc(t('lang_title'))}</h2><button class="iconbtn dark" type="button" data-close-dlg="1" aria-label="${esc(t('close_label'))}">${IC.close}</button></div>`
      + U.renderLangSelector()
      + `<button class="btn secondary block" type="button" data-close-dlg="1" style="margin-top:14px">${esc(t('close_label'))}</button>`);
  };

  U.dlgNodes = () => {
    let devs = [];
    try { if (U.mqtt) devs = U.mqtt.getDevices() || []; } catch (_) { /* ignore */ }
    const main = {model:U.deviceLabel(E.MQTT_DEFAULT_DEVICE), id:E.MQTT_DEFAULT_DEVICE};
    const nodes = [main, ...U.otherNodes()];
    const body = `<div class="nodelist">` + nodes.map(({model, id, key}, index) => {
      const node = key ? U.otherNodeStatus?.(key) : devs.find(device => device.id === id);
      const deviceId = key ? node?.deviceId || '' : id;
      const on = key ? U.otherDeviceForRoute(U.route)?.key === key : U.route === 'home' || U.route === 'rover';
      const label = key ? U.otherDeviceTabLabel(index - 1) : t('device_main');
      return `<button class="nodeitem ${on ? 'on' : ''}" type="button" data-pick-node="${esc(deviceId)}" ${key ? `data-open-device-slot="${esc(key)}"` : ''} aria-pressed="${on}">`
        + `<span class="half-emoji" aria-hidden="true">${key ? U.icons.node : U.icons.leaf}</span>`
        + `<span class="half-meta"><strong>${esc(label)} · ${esc(model)}</strong>`
        + `<small>${node?.online ? '<span class="pulsedot inline"></span> ' + esc(t('node_signal_online')) : '<span class="dot-waiting inline"></span> ' + esc(t(deviceId ? 'node_signal_waiting' : 'node_not_paired'))}</small></span>`
        + `<span class="half-st ${on ? 'on' : ''}">${on ? esc(t('node_active_badge')) : esc(t('node_select_action'))}</span></button>`;
    }).join('') + `</div>`
    + `<div class="seclabel2" style="margin-top:14px">${esc(t('data_source'))}</div>`
    + `<div class="seg">` + [['auto', 'src_auto'], ['live', 'src_live'], ['demo', 'src_mock']].map(([v, k]) =>
        `<button class="segopt" type="button" data-seg="source" data-val="${v}" aria-pressed="${U.source === v}">${esc(t(k))}</button>`).join('') + `</div>`
    + `<p class="hint">${esc(t('node_sheet_sub'))}</p>`;

    U.openDlg(`<div class="dlg-hd"><h2>${esc(t('node_sheet_title'))}</h2><button class="iconbtn dark" type="button" data-close-dlg="1" aria-label="${esc(t('close_label'))}">${IC.close}</button></div>`
      + body + `<button class="btn secondary block" type="button" data-close-dlg="1">${esc(t('close_label'))}</button>`);
  };

  U.dlgProfile = () => {
    const p = U.profile;
    const info = U.nodeInfo();
    const crops = Object.keys(E.CROPS).map((id) =>
      `<button class="choice crop-choice" type="button" data-crop="${id}" aria-pressed="${(info.cropId || 'bajra') === id}"><span class="c-emo">${U.cropEmoji(id)}</span><span>${esc(t(E.CROPS[id].labelKey))}</span></button>`).join('');
    U.openDlg(`<div class="dlg-hd"><h2>${esc(t('profile_title'))} (${esc(info.shortLabel)})</h2><button class="iconbtn dark" type="button" data-close-dlg="1" aria-label="${esc(t('close_label'))}">${IC.close}</button></div>`
      + `<div class="seclabel2">${esc(t('farm_crop'))}</div><div class="choicegrid cols3" id="f-crops">${crops}</div>`
      + `<div class="seclabel2">${esc(t('farm_stage'))}</div><div class="choicegrid cols3" id="f-stage">` + E.CROP_STAGES.map((s) =>
        `<button class="choice" type="button" data-stage="${s}" aria-pressed="${info.stage === s}">${esc(t('stage_' + s))}</button>`).join('') + `</div>`
      + `<div class="step-fields">`
      + `<div class="field"><label for="f-pin">${esc(t('farm_pincode'))}</label><div class="inputrow"><input id="f-pin" inputmode="numeric" value="${esc(p.pincode || '')}">${(E.voice && E.voice.sttSupported) ? `<button type="button" class="micbtn" data-dictate="f-pin" aria-label="${esc(t('hf_talk'))}">${IC.mic}</button>` : ''}</div></div>`
      + `<div class="field"><label for="f-size">${esc(t('farm_size'))} (${esc(t('acres_unit'))})</label><input id="f-size" type="number" inputmode="decimal" value="${info.sizeValue}"></div>`
      + `</div>`
      + `<div class="row2"><button class="btn secondary" type="button" data-close-dlg="1">${esc(t('close_label'))}</button><button class="btn primary" type="button" id="f-save-profile">${U.icons.check} ${esc(t('save_label'))}</button></div>`);
    $('dlg-body').querySelectorAll('[data-crop]').forEach((b) => b.addEventListener('click', () => {
      $('dlg-body').querySelectorAll('[data-crop]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      $('dlg-body').dataset.crop = b.dataset.crop;
    }));
    $('dlg-body').querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => {
      $('dlg-body').querySelectorAll('[data-stage]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      $('dlg-body').dataset.stage = b.dataset.stage;
    }));
  };

  U.saveProfileDlg = () => {
    const body = $('dlg-body');
    const info = U.nodeInfo();
    const crop = body.dataset.crop || info.cropId;
    const stage = body.dataset.stage || info.stage;
    const pin = ($('f-pin') && $('f-pin').value.trim()) || U.profile.pincode;
    const size = $('f-size') ? +$('f-size').value : info.sizeValue;
    const cleanSize = Number.isFinite(size) && size > 0 ? size : 2.5;
    Object.assign(U.profile, { cropId: crop, stage, pincode: pin || '342001', sizeValue: cleanSize });
    U.profile[info.isNode2 ? 'node2' : 'node1'] = { cropId: crop, stage, sizeValue: cleanSize };
    U.saveProfile();
    U.closeDlg();
    U.bootProviderRefresh();
    U.render();
  };

  U.bootProviderRefresh = () => {
    try {
      if (U.mock) { U.mock.profile = U.profile; }
      if (U.provider === U.mock && U.mock) { U.onSnap(U.mock.getCurrent()); }
      else if (U.provider && U.provider.getCurrent) { try { U.onSnap(U.provider.getCurrent()); } catch (_) { /* ignore */ } }
    } catch (_) { /* ignore */ }
  };

  /* ---------- AGRONOMIC FORMULAE SUB-TAB (Inside Settings) ---------- */
  U.renderFormulaeSubTab = () => {
    const info = U.nodeInfo ? U.nodeInfo() : { cropId: 'bajra', cropName: 'Bajra', emoji: '', stage: 'vegetative', sizeValue: 2.5 };
    const dAll = U.dosing ? U.dosing.status() : {
      fertilizer: { rate: 35 },
      compost: { rate: 300 },
      pesticide: { rate: 3.0 },
      calc: E.agri && E.agri.calcDosing ? E.agri.calcDosing(U.snapshot, info, {}) : null
    };
    const calc = dAll.calc || (E.agri && E.agri.calcDosing ? E.agri.calcDosing(U.snapshot, info, {}) : null);
    if (!calc) return `<p class="muted">Agronomic engine initializing…</p>`;
    const m1 = calc.module1 || {};
    const m2 = calc.module2 || {};
    const m3 = calc.module3 || {};
    const C = E.DOSING_CONSTANTS || {};
    const grades = C.FERTILIZER_GRADES || {};
    const depths = C.TOP_DRESS_DEPTHS || [];
    const canopies = C.CANOPY_REFERENCE_MATRIX || {};

    return `<div class="formulae-pane">`
      + `<div class="dose-rx-banner card" style="margin-bottom:12px;padding:12px 14px">`
      + `<div class="dose-rx-main">`
      + `<span class="dose-rx-emo" aria-hidden="true">${info.emoji || U.icons.sprout}</span>`
      + `<div class="dose-rx-copy">`
      + `<div class="dose-rx-title"><strong>${esc(info.cropName)}</strong> <span class="stagepill">${esc(t('stage_' + info.stage))}</span></div>`
      + `<div class="dose-rx-sub">${fmt1(info.sizeValue)} ${esc(t('acres_unit'))} (${calc.hectares} ha · ${calc.areaM2} m²) • ICAR RDF: <b>${m1.targetN_ha}:${m1.targetP2O5_ha}:${m1.targetK2O_ha}</b> kg/ha</div>`
      + `</div>`
      + `</div>`
      + `<button class="btn primary sm" type="button" data-dose-sync-crop="1">${U.icons.sparkle} <span>${esc(t('dosing_sync_btn'))}</span></button>`
      + `</div>`

      + `<div class="dose-manual-grid settings-formula-grid">`

      // Module 01 Card
      + `<div class="dose-manual-sec">`
      + `<div class="seclabel2">${esc(t('dosing_mod1_title'))}</div>`
      + `<p class="dose-eq"><code>Mass_product (g) = [ Mass_target (g) / %_nutrient ] × 100</code><br><code>Mass_P = Mass_P₂O₅ × 0.4364</code> · <code>Mass_K = Mass_K₂O × 0.8302</code> · <code>Mass_Ca = Mass_CaO × 0.7147</code></p>`
      + `<div class="tblwrap"><table class="datatable sm"><thead><tr><th>Element</th><th>Field Rate</th><th>Oxide Factor</th><th>Elemental</th><th>Product Eq.</th></tr></thead><tbody>`
      + `<tr><td>Nitrogen (N)</td><td>${m1.targetN_ha} kg/ha</td><td>1.0000</td><td>${m1.elemN_ha} kg/ha (${m1.elemN_gm2} g/m²)</td><td>Urea: ${m1.ureaKgHa} kg/ha (${m1.ureaKgAc} kg/ac)</td></tr>`
      + `<tr><td>Phosphorus (P)</td><td>${m1.targetP2O5_ha} kg/ha P₂O₅</td><td>0.4364</td><td>${m1.elemP_ha} kg/ha (${m1.elemP_gm2} g/m²)</td><td>DAP: ${m1.dapKgHa} kg/ha (${m1.dapKgAc} kg/ac)</td></tr>`
      + `<tr><td>Potassium (K)</td><td>${m1.targetK2O_ha} kg/ha K₂O</td><td>0.8302</td><td>${m1.elemK_ha} kg/ha (${m1.elemK_gm2} g/m²)</td><td>MOP: ${m1.mopKgHa} kg/ha (${m1.mopKgAc} kg/ac)</td></tr>`
      + `<tr><td>Calcium (Ca)</td><td>${m1.targetCaO_ha} kg/ha CaO</td><td>0.7147</td><td>${m1.elemCa_ha} kg/ha (${m1.elemCa_gm2} g/m²)</td><td>Gypsum: ${m1.gypsumKgHa} kg/ha</td></tr>`
      + `</tbody></table></div>`
      + `<div class="field" style="margin-top:6px"><label>${esc(t('dosing_grade_select'))}</label>`
      + `<select class="dose-select" data-dose-calc-opt="fertGrade">`
      + Object.keys(grades).map((gk) => {
          const g = grades[gk];
          return `<option value="${esc(g.id)}" ${m1.gradeId === g.id ? 'selected' : ''}>${esc(g.label)}</option>`;
        }).join('')
      + `</select></div>`
      + `<div class="step-fields" style="margin-top:6px">`
      + `<div class="field"><label>Mass_target (g)</label><input type="number" inputmode="decimal" data-dose-calc-opt="targetNutrientG" value="${m1.customTargetG}"></div>`
      + `<div class="field"><label>%_nutrient (Grade %)</label><input type="number" inputmode="decimal" data-dose-calc-opt="nutrientPct" value="${m1.customPct}"></div>`
      + `</div>`
      + `<div class="dose-calc-result">Required Product Mass: <strong>${m1.customProductG} g</strong> (<code>[${m1.customTargetG} / ${m1.customPct}] × 100</code>) · Split Rx: <strong>${m1.recommendedFertKgAc} kg/ac</strong></div>`
      + `</div>`

      // Module 02 Card
      + `<div class="dose-manual-sec">`
      + `<div class="seclabel2">${esc(t('dosing_mod2_title'))}</div>`
      + `<p class="dose-eq"><code>V_pot (L) = [(π × h) / 3000] × [R_top² + (R_top × R_base) + R_base²]</code><br><code>Mass_compost (kg) = (V_pot × f_ratio / 1000) × ρ_b</code></p>`
      + `<div class="field"><label>${esc(t('dosing_top_dress'))}</label>`
      + `<select class="dose-select" data-dose-calc-opt="topDressCm">`
      + depths.map((dp) => `<option value="${dp.depthCm}" ${+m2.topDressCm === +dp.depthCm ? 'selected' : ''}>${esc(t(dp.labelKey))} → ${dp.massAt600} kg/m²</option>`).join('')
      + `</select></div>`
      + `<div class="step-fields">`
      + `<div class="field"><label>Pot Depth h (cm)</label><input type="number" inputmode="decimal" data-dose-calc-opt="potHeightCm" value="${m2.potH}"></div>`
      + `<div class="field"><label>R_top / R_base (cm)</label><div class="row2"><input type="number" inputmode="decimal" data-dose-calc-opt="potRTopCm" value="${m2.potRTop}" aria-label="R_top"><input type="number" inputmode="decimal" data-dose-calc-opt="potRBaseCm" value="${m2.potRBase}" aria-label="R_base"></div></div>`
      + `</div>`
      + `<div class="step-fields">`
      + `<div class="field"><label>Blend Ratio (f_ratio)</label><input type="number" step="0.05" inputmode="decimal" data-dose-calc-opt="compostFRatio" value="${m2.fRatio}"></div>`
      + `<div class="field"><label>Bulk Density ρ_b (kg/m³)</label><input type="number" step="25" inputmode="numeric" data-dose-calc-opt="compostBulkDensity" value="${m2.rhoB}"></div>`
      + `</div>`
      + `<div class="dose-calc-result">V_pot = <strong>${m2.vPotL} L</strong> → Volume_compost = <strong>${m2.volCompostPotL} L</strong> → Dry Mass = <strong>${m2.massCompostPotKg} kg/pot</strong> · Top-Dress = <strong>${m2.topDressKgM2} kg/m²</strong></div>`
      + `</div>`

      // Module 03 Card
      + `<div class="dose-manual-sec">`
      + `<div class="seclabel2">${esc(t('dosing_mod3_title'))}</div>`
      + `<p class="dose-eq"><code>TRV (m³/ha) = [Height × Width / Row_Spacing] × 10,000</code><br><code>V_concentrate (mL) = V_tank (L) × Rate (mL/L)</code> · <code>Mass_a.i. (g) = [V_tank × Target_a.i.] / Purity</code></p>`
      + `<div class="field"><label>${esc(t('dosing_trv_label'))}</label>`
      + `<select class="dose-select" data-dose-calc-opt="canopyPreset">`
      + Object.keys(canopies).map((ck) => {
          const cp = canopies[ck];
          const lbl = ck === 'crop_auto' ? `${info.cropName} (${m3.canopyHeightM}m × ${m3.canopyWidthM}m / ${m3.rowSpacingM}m)` : cp.label;
          return `<option value="${esc(cp.id)}" ${m3.canopyPresetId === cp.id ? 'selected' : ''}>${esc(lbl)}</option>`;
        }).join('')
      + `</select></div>`
      + `<div class="step-fields">`
      + `<div class="field"><label>Sprayer Tank V_tank (L)</label><input type="number" step="5" inputmode="decimal" data-dose-calc-opt="tankVolumeL" value="${m3.vTankL}"></div>`
      + `<div class="field"><label>Purity Fraction (0.1–1.0)</label><input type="number" step="0.05" inputmode="decimal" data-dose-calc-opt="purityFrac" value="${m3.purityFrac}"></div>`
      + `</div>`
      + `<div class="dose-calc-result">TRV = <strong>${fmt1(m3.trvM3Ha)} m³/ha</strong> → Spray = <strong>${m3.carrierSprayLHa} L/ha</strong> (${m3.carrierSprayLAc} L/ac) → Tank Mix = <strong>${fmt1(m3.vTankL * (dAll.pesticide.rate || 0))} mL</strong> (${m3.massActiveIngredientG} g a.i.)</div>`
      + `</div>`

      + `</div>`
      + `</div>`;
  };

  U.dlgSettings = (initialTab) => {
    if (initialTab === 'general' || initialTab === 'formulae') {
      U.settingsTab = initialTab;
    }
    const activeTab = U.settingsTab || 'general';
    const theme = (() => { try { return localStorage.getItem('enviroos.theme') || 'system'; } catch (_) { return 'system'; } })();
    const vOn = !!(E.voice && E.voice.enabled);
    const gOn = document.body.classList.contains('glass');
    let sb = { configured: false };
    try { sb = (E.supabase && E.supabase.getStatus && E.supabase.getStatus()) || sb; } catch (_) { /* ignore */ }

    const subTabsHtml = `<div class="seg settings-tabs" role="tablist" aria-label="${esc(t('settings_title'))}">`
      + `<button class="segopt" type="button" role="tab" data-settings-tab="general" aria-pressed="${activeTab === 'general'}">${IC.gear} <span>${esc(t('settings_tab_general'))}</span></button>`
      + `<button class="segopt" type="button" role="tab" data-settings-tab="formulae" aria-pressed="${activeTab === 'formulae'}">${U.icons.scale} <span>${esc(t('settings_tab_formulae'))}</span></button>`
      + `</div>`;

    const generalBodyHtml = `<div class="seclabel2">${esc(t('display_title'))}</div><div class="seg">` + ['light', 'dark', 'system'].map((v) =>
        `<button class="segopt" type="button" data-seg="theme" data-val="${v}" aria-pressed="${theme === v}">${esc(t('theme_' + v))}</button>`).join('') + `</div>`
      + `<div class="seclabel2">${esc(t('data_source'))}</div><div class="seg">` + [['auto', 'src_auto'], ['live', 'src_live'], ['demo', 'src_mock']].map(([v, k]) =>
        `<button class="segopt" type="button" data-seg="source" data-val="${v}" aria-pressed="${U.source === v}">${esc(t(k))}</button>`).join('') + `</div>`
      + `<div class="setrow"><span><strong>${esc(t('signin_title'))}</strong><small>${(U.auth && U.auth.name) ? `${esc(U.auth.name)} (${esc(U.auth.mainModel || 'Enviro Pro')})` : esc(t('signin_sub'))}</small></span><button class="btn secondary sm" type="button" data-open-signin="1">${U.icons.user || MI('person')} <span>${(U.auth && U.auth.name) ? esc(t('signin_switch_account')) : esc(t('signin_title'))}</span></button></div>`
      + (U.hasSecondary() ? `<div class="setrow"><span><strong>${esc(U.otherDeviceTabLabel(0))}</strong><small>${U.isSecondDeviceOn() ? esc(t('second_connect_connected')) : esc(t('second_connect_not_connected'))}</small></span><button class="btn secondary sm" type="button" data-toggle-second-device="1">${U.icons.power} <span>${esc(t(U.secondDevice?.status().enabled ? 'second_connect_pause' : 'second_connect_btn'))}</span></button></div>` : '')
      + `<div class="setrow"><span><strong>${esc(t('voice_title'))}</strong><small>${esc(t('voice_hint'))}</small></span><button class="switch" type="button" data-sw="voice" aria-pressed="${vOn}" aria-label="${esc(t('voice_title'))}"></button></div>`
      + (U.handsFreeSettings?.() || '')
      + `<div class="setrow"><span><strong>${esc(t('voice_accent_title'))}</strong><small>${esc(t('voice_accent_sub'))}</small></span><button class="btn secondary sm" type="button" data-test-voice="1">${U.icons.speaker} <span>${esc(t('voice_accent_test'))}</span></button></div>`
      + `<div class="setrow"><span><strong>${esc(t('beta_glass'))}</strong><small>${esc(t('beta_glass_sub'))}</small></span><button class="switch" type="button" data-sw="glass" aria-pressed="${gOn}" aria-label="${esc(t('beta_glass'))}"></button></div>`
      + `<details class="tech" style="margin-top:14px"><summary>${esc(t('supabase_title'))} ▾</summary>`
      + `<div class="field"><label for="f-sburl">${esc(t('supabase_url'))}</label><input id="f-sburl" type="text" inputmode="url" autocomplete="off"></div>`
      + `<div class="field"><label for="f-sbkey">${esc(t('supabase_key'))}</label><input id="f-sbkey" type="text" autocomplete="off"></div>`
      + `<div class="field"><label for="f-sbint">${esc(t('supabase_interval'))} (${esc(t('min_unit'))})</label><input id="f-sbint" type="number" inputmode="numeric" value="15"></div>`
      + `<div class="row2"><button class="btn secondary" type="button" id="f-sbtest">${esc(t('supabase_test'))}</button>`
      + `<button class="btn secondary" type="button" id="f-sbsave">${esc(t('supabase_save_now'))}</button></div>`
      + `<p class="hint" id="f-sbstatus">${esc(sb.configured ? t('supabase_connected') : t('supabase_not_configured'))}</p>`
      + `</details>`;

    U.openDlg(`<div class="dlg-hd"><h2>${esc(t('settings_title'))}</h2><button class="iconbtn dark" type="button" data-close-dlg="1" aria-label="${esc(t('close_label'))}">${IC.close}</button></div>`
      + subTabsHtml
      + (activeTab === 'formulae' ? U.renderFormulaeSubTab() : generalBodyHtml)
      + `<button class="btn primary block" type="button" data-close-dlg="1" style="margin-top:16px">${esc(t('close_label'))}</button>`);

    U.refreshHandsFreeUI?.();
    const tv = $('dlg-body') ? $('dlg-body').querySelector('[data-test-voice]') : null;
    if (tv) tv.addEventListener('click', () => {
      const sample = E.i18n && E.i18n.lang === 'hi'
        ? 'नमस्ते! मैं एग्री हूँ, आपका स्मार्ट फार्मिंग असिस्टेंट। खेत की मिट्टी में नमी और मौसम बिल्कुल अनुकूल है।'
        : 'Hello! I am Agri, your smart farming assistant. All field sensors, moisture, and microclimate telemetry are running optimally.';
      U.speak(sample);
    });

    const tb = $('f-sbtest'), sv = $('f-sbsave');
    if (tb) tb.addEventListener('click', async () => {
      U.saveSbCfg();
      try { const ok = await E.supabase.testConnection(); U.toast(ok ? t('supabase_connected') : t('supabase_not_configured')); }
      catch (_) { U.toast(t('supabase_not_configured')); }
    });
    if (sv) sv.addEventListener('click', async () => {
      U.saveSbCfg();
      try { await E.supabase.recordFromApp('manual'); U.toast(t('supabase_save_now')); } catch (_) { U.toast(t('supabase_not_configured')); }
    });
  };
  U.saveSbCfg = () => {
    const u = $('f-sburl'), k = $('f-sbkey'), m = $('f-sbint');
    try {
      if (E.supabase && E.supabase.updateConfig) E.supabase.updateConfig(u ? u.value : '', k ? k.value : '');
      if (E.supabase && E.supabase.setIntervalMin && m && +m.value > 0) E.supabase.setIntervalMin(+m.value);
    } catch (_) { /* ignore */ }
  };
  U.saveSettingsDlg = () => { U.saveSbCfg(); U.closeDlg(); };
  U.segChoice = (group, val) => {
    if (group === 'theme') {
      try { localStorage.setItem('enviroos.theme', val); } catch (_) { /* ignore */ }
      U.applyTheme();
      $('dlg-body').querySelectorAll('[data-seg="theme"]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.val === val ? 'true' : 'false'));
    } else if (group === 'source') {
      U.useSource(val);
      $('dlg-body').querySelectorAll('[data-seg="source"]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.val === val ? 'true' : 'false'));
    }
  };
  U.flipSwitch = (key) => {
    const btns = $('dlg-body').querySelectorAll(`[data-sw="${key}"]`);
    if (key === 'voice' && E.voice) {
      try { E.voice.enabled ? E.voice.stopSpotting() : E.voice.startSpotting(); } catch (_) { /* ignore */ }
      btns.forEach((x) => x.setAttribute('aria-pressed', E.voice.enabled ? 'true' : 'false'));
    } else if (key === 'glass') {
      const on = !document.body.classList.contains('glass');
      document.body.classList.toggle('glass', on);
      try { localStorage.setItem('enviroos.glass', on ? '1' : '0'); } catch (_) { /* ignore */ }
      btns.forEach((x) => x.setAttribute('aria-pressed', on ? 'true' : 'false'));
    }
  };
  U.dlgOnboard = () => {
    U.openDlg(`<div class="onboard"><div class="sprout" aria-hidden="true">${U.icons.sprout}</div><h2>EnviroOS</h2>`
      + `<p class="muted">${esc(t('voice_hint'))}</p>`
      + U.renderLangSelector()
      + `<button class="btn primary block lg" type="button" id="f-start" style="margin-top:14px"><span>${esc(t('check_now'))}</span> ${U.icons.chev}</button></div>`);
    const st = $('f-start');
    if (st) st.addEventListener('click', () => {
      U.profile.onboarded = true; U.saveProfile(); U.closeDlg(); U.render();
    });
  };

  /* ---------- SIGN IN SCREEN / MODAL DIALOG ---------- */
  U.dlgSignIn = (allowClose = false) => {
    const auth = U.getAuth ? (U.getAuth() || {}) : {};
    const models = U.MODELS.filter(({id}) => id !== 'enviro_pro').map(({label}) => ({id:label, label}));

    const available = model => models.find(({id}) => id === U.modelName(model))?.id || '';
    const curMain = available(auth.mainModel);
    const optionalModel = model => available(model) || 'none';
    const curAsst = String(auth.assistantModel || '').trim().toLowerCase() === 'none'
      ? 'none' : available(auth.assistantModel);
    const curOther = optionalModel(auth.otherModel);

    const modelOptions = selected => models.map((m) =>
      `<option value="${esc(m.id)}" ${selected === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('');
    const noneOption = selected =>
      `<option value="none" ${selected === 'none' ? 'selected' : ''}>${esc(t('signin_assistant_model_none'))}</option>`;
    const mainOpts = `<option value="" disabled ${!curMain ? 'selected' : ''}>-- ${esc(t('signin_main_model_select'))} --</option>`
      + modelOptions(curMain);
    const asstOpts = `<option value="" disabled ${!curAsst ? 'selected' : ''}>-- ${esc(t('signin_assistant_model_select'))} --</option>`
      + modelOptions(curAsst) + noneOption(curAsst);
    const otherOpts = modelOptions(curOther) + noneOption(curOther);

    const closeBtn = allowClose
      ? `<button class="iconbtn dark" type="button" data-close-dlg="1" aria-label="${esc(t('close_label'))}">${IC.close}</button>`
      : '';

    const html = `<div class="signin-box">`
      + `  <div class="dlg-hd">`
      + `    <div class="signin-brand"><span class="brand-mark">${U.icons.leaf}</span><h2>${esc(t('signin_title'))}</h2></div>`
      + `    ${closeBtn}`
      + `  </div>`
      + `  <p class="muted signin-sub">${esc(t('signin_sub'))}</p>`
      + `  <form class="signin-form" id="f-signin" onsubmit="return false;">`
      + `    <div class="field">`
      + `      <label for="signin-name">${esc(t('signin_name_label'))} <span class="req">*</span></label>`
      + `      <div class="inputrow">`
      + `        <input id="signin-name" type="text" autocomplete="name" required placeholder="${esc(t('signin_name_placeholder'))}" value="${esc(auth.name || '')}">`
      + `      </div>`
      + `    </div>`
      + `    <div class="field">`
      + `      <label for="signin-pass">${esc(t('signin_pass_label'))} <span class="req">*</span></label>`
      + `      <div class="inputrow">`
      + `        <input id="signin-pass" type="password" autocomplete="current-password" required placeholder="${esc(t('signin_pass_placeholder'))}" value="${esc(auth.pass || '')}">`
      + `      </div>`
      + `    </div>`
      + `    <div class="field">`
      + `      <label for="signin-main-model">${esc(t('signin_main_model_label'))} <span class="req">*</span></label>`
      + `      <select class="styled-select" id="signin-main-model" required>`
      + `        ${mainOpts}`
      + `      </select>`
      + `    </div>`
      + `    <div class="field" id="signin-asst-field" style="${curMain ? '' : 'display:none;'}">`
      + `      <label for="signin-asst-model">${esc(t('signin_assistant_model_label'))} <span class="req">*</span></label>`
      + `      <select class="styled-select" id="signin-asst-model">`
      + `        ${asstOpts}`
      + `      </select>`
      + `    </div>`
      + `    <div class="field" id="signin-other-field" hidden>
      <label for="signin-other-model">${esc(t('signin_other_model_label'))}</label>
      <select class="styled-select" id="signin-other-model">${otherOpts}</select>
    </div>`
      + `    <div class="signin-err" id="signin-err" role="alert" style="display:none;"></div>`
      + `    <button class="btn primary block lg signin-btn" type="button" id="signin-submit">`
      + `      ${U.icons.check} <span>${esc(t('signin_btn'))}</span>`
      + `    </button>`
      + `  </form>`
      + `</div>`;

    U.openDlg(html);

    const mainSelect = $('signin-main-model');
    const asstField = $('signin-asst-field');
    const asstSelect = $('signin-asst-model');
    const submitBtn = $('signin-submit');
    const errBox = $('signin-err');

    const otherSelect = $('signin-other-model');
    function updateModelFields() {
      asstField.style.display = mainSelect.value ? '' : 'none';
      const showOther = Boolean(mainSelect.value && asstSelect.value);
      $('signin-other-field').hidden = !showOther;
      otherSelect.disabled = !showOther;
    }
    mainSelect.addEventListener('change', updateModelFields);
    asstSelect.addEventListener('change', updateModelFields);
    updateModelFields();

    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const name = (($('signin-name') || {}).value || '').trim();
        const pass = (($('signin-pass') || {}).value || '').trim();
        const main = mainSelect ? mainSelect.value : '';
        const asst = asstSelect ? asstSelect.value : '';

        const showErr = (msg) => {
          if (errBox) {
            errBox.textContent = msg;
            errBox.style.display = 'block';
          } else {
            U.toast(msg);
          }
        };

        if (!name) { showErr(t('signin_err_name')); return; }
        if (!pass) { showErr(t('signin_err_pass')); return; }
        if (!main) { showErr(t('signin_err_main')); return; }
        if (!asst) { showErr(t('signin_err_asst')); return; }

        if (errBox) errBox.style.display = 'none';

        const authObj = {
          name,
          pass,
          mainModel: main,
          assistantModel: asst,
          otherModel: otherSelect.value,
          signedInAt: Date.now()
        };

        if (U.saveAuth) U.saveAuth(authObj);
        U.auth = authObj;

        // Auto sync user name to farm profile if empty
        if (U.profile && !U.profile.farmerName) {
          U.profile.farmerName = name;
          U.saveProfile();
        }

        U.closeDlg();
        U.toast(t('signin_welcome').replace('{name}', name));

        if (!U.profile.onboarded) {
          setTimeout(() => U.dlgOnboard(), 300);
        } else {
          U.render();
        }
      });
    }
  };

  // The second-device screen and remembered connection live in second-device.js.
})();
