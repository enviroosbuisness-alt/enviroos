/* EnviroOS — AGRICULTURAL LOGIC layer.
 * Pure functions: sensor readings + farm profile -> plain-English-free status objects.
 * The UI layer translates status codes into localized strings.
 * No DOM access here. No fertilizer doses. No rain predictions. */

'use strict';

window.EnviroOS = window.EnviroOS || {};

(function () {
  const E = EnviroOS;

  // ---------- GDD ----------
  // Daily GDD = clamp(Tavg, Tbase..Tupper) - Tbase, floored at 0.
  function dailyGDD(tmin, tmax, base, upper) {
    const avg = (tmin + tmax) / 2;
    const capped = Math.min(Math.max(avg, base), upper);
    return Math.max(0, capped - base);
  }

  function cumulativeGDD(historyDays, base, upper) {
    let sum = 0;
    const perDay = historyDays.map((d) => {
      const g = dailyGDD(d.tmin, d.tmax, base, upper);
      sum += g;
      return g;
    });
    return { perDay, total: sum, today: perDay.length ? perDay[perDay.length - 1] : 0 };
  }

  // ---------- VPD (Tetens formula) ----------
  // Saturation vapour pressure from temperature; VPD = SVP * (1 - RH/100).
  // Returns kPa, or null when humidity is unavailable.
  function saturationVapourPressure(tempC) {
    return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  }

  function calcVPD(tempC, humidityRH) {
    if (humidityRH == null || Number.isNaN(humidityRH)) return null;
    const rh = Math.min(100, Math.max(0, humidityRH));
    return saturationVapourPressure(tempC) * (1 - rh / 100);
  }

  function vpdBand(vpdKpa) {
    if (vpdKpa == null) return 'unknown';
    if (vpdKpa < 0.8) return 'low';
    if (vpdKpa <= 1.5) return 'good';
    if (vpdKpa <= 2.5) return 'high';
    return 'very_high';
  }

  // ---------- Light ----------
  function lightBand(lux, crop) {
    if (lux == null || Number.isNaN(lux)) return 'unknown';
    const low = (crop && crop.luxLow) || 15000;
    const scorch = (crop && crop.luxScorch) || 75000;
    if (lux < low) return 'low';
    if (lux >= scorch) return 'scorch';
    if (lux >= 45000) return 'bright';
    return 'good';
  }

  // ---------- Pressure trend ----------
  // Uses a short rolling history [{t, hpa}]. Returns change over the window + band.
  // Fewer than 2 points: unknown (never invent a trend).
  function pressureTrend(history, windowHours) {
    windowHours = windowHours || 3;
    if (!history || history.length < 2) return { changeHpa: 0, band: 'unknown', windowHours };
    const now = history[history.length - 1].t;
    const cutoff = now - windowHours * 3600 * 1000;
    let past = history[0];
    for (const p of history) { if (p.t <= cutoff) past = p; }
    const change = history[history.length - 1].hpa - past.hpa;
    const band = Math.abs(change) >= 2 ? 'changing' : 'stable';
    return { changeHpa: change, band, windowHours };
  }

  // ---------- Moisture ----------
  function moistureBand(moisturePct, crop) {
    if (moisturePct == null || Number.isNaN(moisturePct)) return 'unknown';
    const dry = crop.moistureDry || (crop.moistureLow ? crop.moistureLow * 0.75 : 15);
    const low = crop.moistureLow || 20;
    const good = crop.moistureGood || 35;
    const excess = crop.moistureExcess || 45;

    if (moisturePct < dry) return 'crit_dry';
    if (moisturePct < low) return 'low';
    if (moisturePct > excess) return 'excess';
    if (moisturePct > good) return 'high';
    return 'good';
  }

  // ---------- WATER stress: moisture + temp + light + humidity/VPD ----------
  function assessWater(s) {
    if (s.moisture == null || Number.isNaN(s.moisture)) {
      return { level: 'unknown', moistureBand: 'unknown', dryAir: false, badgeKey: 'st_unknown', vpdKpa: calcVPD(s.tempC, s.humidity) };
    }
    const crop = E.getCrop(s.cropId);
    const m = moistureBand(s.moisture, crop);
    const hot = s.tempC >= (crop.heatWatch || 35);
    const strongSun = s.lux >= (crop.luxScorch || 75000);
    const vpd = calcVPD(s.tempC, s.humidity);
    const dryAir = vpd != null && vpd > 1.5;

    let level = 'good';
    let badgeKey = 'st_moisture_good';

    if (m === 'crit_dry') {
      level = 'high'; // Critical urgency
      badgeKey = 'st_crit_dry';
    } else if (m === 'low') {
      level = (hot || strongSun || dryAir) ? 'high' : 'low';
      badgeKey = 'st_water_needed';
    } else if (m === 'excess') {
      level = 'high';
      badgeKey = 'st_drain_water';
    } else if (m === 'high') {
      level = 'watch';
      badgeKey = 'st_stop_irrigation';
    } else {
      level = 'good';
      badgeKey = 'st_moisture_good';
    }
    return { level, moistureBand: m, dryAir, badgeKey, vpdKpa: vpd };
  }

  // ---------- HEAT stress: temp + sun + moisture + stage ----------
  function assessHeat(s) {
    if (s.tempC == null || Number.isNaN(s.tempC)) return { level: 'unknown', sensitive: false, badgeKey: 'st_unknown' };
    const crop = E.getCrop(s.cropId);
    const sensitiveStages = ['flowering', 'fruiting', 'seedling'];
    const sensitive = sensitiveStages.includes(s.stage);
    const thresholdHigh = sensitive ? (crop.heatHigh || 38) - 2 : (crop.heatHigh || 38);
    const thresholdWatch = sensitive ? (crop.heatWatch || 32) - 2 : (crop.heatWatch || 32);

    let level = 'good';
    let badgeKey = 'st_temp_good';

    if (crop.tempMin && s.tempC < crop.tempMin) {
      level = 'watch';
      badgeKey = 'st_frost_risk';
    } else if (s.tempC >= thresholdHigh) {
      level = 'high';
      badgeKey = 'st_heat_stress';
    } else if (s.tempC >= thresholdWatch) {
      level = 'watch';
      badgeKey = 'st_warm_weather';
    } else {
      level = 'good';
      badgeKey = 'st_temp_good';
    }
    // Strong sun + dry soil nudges a watch up to high (combined load).
    if (level === 'watch' && s.lux >= 45000 && s.moisture < (crop.moistureGood || 35)) {
      level = 'high';
      badgeKey = 'st_heat_stress';
    }
    return { level, sensitive, badgeKey };
  }

  // ---------- NUTRIENTS: N/P/K vs crop bands, pH-gated ----------
  // Unknown values stay unknown — never read as good.
  function nutrientBand(value, low, high) {
    if (value == null || Number.isNaN(value)) return 'unknown';
    if (value < low) return 'low';
    if (value > high) return 'high';
    return 'good';
  }

  function assessNutrients(s) {
    const crop = E.getCrop(s.cropId);
    const n = nutrientBand(s.n, crop.nLow, crop.nHigh);
    const p = nutrientBand(s.p, crop.pLow, crop.pHigh);
    const k = nutrientBand(s.k, crop.kLow, crop.kHigh);
    const phOK = s.ph == null ? null : (s.ph >= crop.phMin && s.ph <= crop.phMax);
    // pH outside band can lock nutrients: flag it, don't change NPK facts.
    let level = 'good';
    let focus = null;
    let badgeKey = 'st_nutrients_ok';

    if (n === 'low') { focus = 'n'; badgeKey = 'st_add_urea'; level = 'watch'; }
    else if (p === 'low') { focus = 'p'; badgeKey = 'st_add_dap'; level = 'watch'; }
    else if (k === 'low') { focus = 'k'; badgeKey = 'st_add_potash'; level = 'watch'; }
    else if (n === 'high') { focus = 'n'; badgeKey = 'st_excess_n'; level = 'watch'; }
    else if (p === 'high') { focus = 'p'; badgeKey = 'st_excess_p'; level = 'watch'; }
    else if (k === 'high') { focus = 'k'; badgeKey = 'st_excess_k'; level = 'watch'; }
    else if (n === 'unknown' || p === 'unknown' || k === 'unknown') {
      level = 'unknown';
      badgeKey = 'st_unknown';
    } else {
      level = 'good';
      badgeKey = 'st_nutrients_ok';
    }
    return { level, n, p, k, focus, badgeKey, phOK };
  }

  function assessPh(s) {
    if (s.ph == null || Number.isNaN(s.ph)) return { level: 'unknown', direction: 'unknown' };
    const crop = E.getCrop(s.cropId);
    if (s.ph < crop.phMin) return { level: 'watch', direction: 'acidic' };
    if (s.ph > crop.phMax) return { level: 'watch', direction: 'alkaline' };
    return { level: 'good', direction: 'suitable' };
  }

  // ---------- WEATHER change: pressure trend only (never a rain forecast) ----------
  function assessWeather(s) {
    const trend = pressureTrend(s.pressureHistory, 3);
    const level = trend.band === 'changing' ? 'watch' : (trend.band === 'unknown' ? 'unknown' : 'good');
    return { level, trend };
  }

  // ---------- CROP development from GDD (progress, explicitly not health) ----------
  // No temperature history: unknown (a zero would pretend nothing grew).
  function assessCrop(s) {
    const crop = E.getCrop(s.cropId);
    if (!s.tempHistory || !s.tempHistory.length) {
      return {
        level: 'unknown', dailyGDD: 0, cumulativeGDD: 0, perDay: [],
        nextStage: 'vegetative', nextTarget: crop.gddStageTargets.vegetative, progress: 0
      };
    }
    const g = cumulativeGDD(s.tempHistory, crop.gddBase, crop.gddUpper);
    const offset = s.gddOffset || 0; // heat accumulated before the displayed window
    const total = g.total + offset;
    const targets = crop.gddStageTargets;
    const stageOrder = ['seedling', 'vegetative', 'flowering', 'fruiting', 'maturity'];
    // Next boundary after the farmer's selected stage.
    const idx = Math.max(0, stageOrder.indexOf(s.stage === 'harvest' ? 'maturity' : s.stage));
    const nextKey = stageOrder[Math.min(idx + 1, stageOrder.length - 1)];
    const nextTarget = targets[nextKey] || targets.maturity;
    const progress = Math.min(1, total / nextTarget);
    return {
      level: 'good', // development tracking has no "bad" state; stress cards carry that
      dailyGDD: g.today,
      cumulativeGDD: total,
      perDay: g.perDay,
      nextStage: nextKey,
      nextTarget,
      progress
    };
  }

  // ---------- Master analysis ----------
  function analyze(snapshot) {
    const water = assessWater(snapshot);
    const heat = assessHeat(snapshot);
    const nutrients = assessNutrients(snapshot);
    const ph = assessPh(snapshot);
    const weather = assessWeather(snapshot);
    const crop = assessCrop(snapshot);
    const vpdKpa = calcVPD(snapshot.tempC, snapshot.humidity);
    const light = lightBand(snapshot.lux);

    // Soil card merges nutrients + pH: pH watch surfaces as its own line, not a number.
    // Unknowns never count as issues — they display as NO DATA.
    let soilLevel = 'good';
    if (nutrients.level === 'watch' || ph.level === 'watch') soilLevel = 'watch';
    else if (nutrients.level === 'unknown' || ph.level === 'unknown') soilLevel = 'unknown';

    const issues = [];
    if (water.level === 'high' || water.level === 'low' || water.level === 'watch') issues.push('water');
    if (heat.level === 'high' || heat.level === 'watch') issues.push('heat');
    if (soilLevel === 'watch') issues.push('soil');
    if (weather.level === 'watch') issues.push('weather');

    return { water, heat, nutrients, ph, weather, crop, soilLevel, vpdKpa, light, issues };
  }

  // ---------- PUMP auto-irrigation decision (pure, testable) ----------
  // Moisture hysteresis: start at/below startBelow, stop at/above stopAbove.
  // Heat/light triggers: also start when temp >= tempAbove or lux >= luxAbove
  // (null = off). Stopping always waits for the moisture target, so heat
  // waves water the field without runaway pumping (max-runtime backs it up).
  // Returns {action:'on'|'off'|'hold', trigger:'moisture'|'heat'|'light'|null}.
  // Never acts on missing/invalid config.
  function pumpDecision(read, running, cfg) {
    cfg = cfg || {};
    const moisture = read != null && typeof read === 'object' ? read.moisture : read;
    const tempC = read != null && typeof read === 'object' ? read.tempC : null;
    const lux = read != null && typeof read === 'object' ? read.lux : null;
    const lo = +cfg.startBelow, hi = +cfg.stopAbove;
    if (moisture == null || Number.isNaN(+moisture)) return { action: 'hold', trigger: null };
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) return { action: 'hold', trigger: null };
    const heatOn = cfg.tempAbove != null && cfg.tempAbove !== '' && Number.isFinite(+cfg.tempAbove) && tempC != null && !Number.isNaN(+tempC) && +tempC >= +cfg.tempAbove;
    const lightOn = cfg.luxAbove != null && cfg.luxAbove !== '' && Number.isFinite(+cfg.luxAbove) && lux != null && !Number.isNaN(+lux) && +lux >= +cfg.luxAbove;
    if (!running) {
      if (+moisture <= lo) return { action: 'on', trigger: 'moisture' };
      if (heatOn) return { action: 'on', trigger: 'heat' };
      if (lightOn) return { action: 'on', trigger: 'light' };
      return { action: 'hold', trigger: null };
    }
    if (+moisture >= hi) return { action: 'off', trigger: 'moisture' };
    return { action: 'hold', trigger: null };
  }

  // ---------- Trend helper for History ----------
  function trendOf(values) {
    if (!values || values.length < 2) return 'flat';
    const first = values[0], last = values[values.length - 1];
    const span = Math.max(1e-9, Math.abs(first) || 1);
    const rel = (last - first) / span;
    if (rel > 0.04) return 'rising';
    if (rel < -0.04) return 'falling';
    return 'flat';
  }

  // ---------- AGRONOMIC DOSAGE & APPLICATION CALCULATOR (Modules 01, 02, 03) ----------
  function round1(v) { return Math.round((+v || 0) * 10) / 10; }
  function round2(v) { return Math.round((+v || 0) * 100) / 100; }

  /**
   * Deterministic mathematical formulations from the Agronomic Dosage & Application
   * Reference Manual (Modules 01, 02, 03) combined with crop-specific ICAR research
   * and live sensor telemetry.
   */
  function calcDosing(snapshot, profile, opts) {
    snapshot = snapshot || {};
    profile = profile || {};
    opts = opts || {};

    const C = E.DOSING_CONSTANTS || {
      P2O5_TO_P: 0.4364, K2O_TO_K: 0.8302, CAO_TO_CA: 0.7147,
      HA_TO_ACRE: 2.47105, ACRE_TO_HA: 0.404686,
      STAGE_SPLITS: {}, CANOPY_REFERENCE_MATRIX: {}, FERTILIZER_GRADES: {}
    };

    const cropId = opts.cropId || profile.cropId || snapshot.cropId || 'bajra';
    const stage = opts.stage || profile.stage || snapshot.stage || 'vegetative';
    const acres = Math.max(0.1, +(opts.acres || profile.sizeValue || 2.5));
    const hectares = acres * C.ACRE_TO_HA;
    const areaM2 = hectares * 10000;

    const crop = E.getCrop(cropId);
    const cd = crop.dosing || {
      rdf: { n: 120, p2o5: 60, k2o: 60, cao: 35 },
      compost: { vermiTonHa: 2.5, fymTonHa: 10.0, topDressCm: 1.0, fRatio: 0.20, bulkDensity: 600 },
      canopy: { heightM: 1.2, widthM: 0.4, rowSpacingM: 0.5, densityConst: 0.080 },
      spray: { concMlPerL: 3.0, targetAiGPerL: 1.5, purity: 0.50, formulaName: 'Neem / Bio-Fungicide' }
    };
    const split = (C.STAGE_SPLITS && C.STAGE_SPLITS[stage]) || {
      nSplit: 0.40, pSplit: 0.30, kSplit: 0.30, compostSplit: 0.30, canopyScale: 0.85, pestMult: 1.00
    };

    // --- Soil Sensor STCR Adjustment Factors (Live NPK & Moisture) ---
    const nState = nutrientBand(snapshot.n, crop.nLow, crop.nHigh);
    const pState = nutrientBand(snapshot.p, crop.pLow, crop.pHigh);
    const kState = nutrientBand(snapshot.k, crop.kLow, crop.kHigh);
    const nFactor = nState === 'low' ? 1.25 : (nState === 'high' ? 0.75 : 1.0);
    const pFactor = pState === 'low' ? 1.25 : (pState === 'high' ? 0.75 : 1.0);
    const kFactor = kState === 'low' ? 1.25 : (kState === 'high' ? 0.75 : 1.0);

    // =========================================================================
    // MODULE 01: PRECISION FERTILIZER & NUTRIENT MASS BALANCE CALCULATIONS
    // =========================================================================
    // 1. Target Oxide Field Rates (kg/ha) adjusted by Soil Sensor state
    const targetN_ha = round1(cd.rdf.n * nFactor);
    const targetP2O5_ha = round1(cd.rdf.p2o5 * pFactor);
    const targetK2O_ha = round1(cd.rdf.k2o * kFactor);
    const targetCaO_ha = round1((cd.rdf.cao || 35));

    // 2. Oxide-to-Elemental Mass Conversions:
    //    Mass_P = Mass_P2O5 * 0.4364 | Mass_K = Mass_K2O * 0.8302 | Mass_Ca = Mass_CaO * 0.7147
    const elemN_ha = round1(targetN_ha * 1.0000);
    const elemP_ha = round1(targetP2O5_ha * C.P2O5_TO_P);
    const elemK_ha = round1(targetK2O_ha * C.K2O_TO_K);
    const elemCa_ha = round1(targetCaO_ha * C.CAO_TO_CA);

    // Area Density (g/m² = kg/ha / 10)
    const elemN_gm2 = round2(elemN_ha / 10);
    const elemP_gm2 = round2(elemP_ha / 10);
    const elemK_gm2 = round2(elemK_ha / 10);
    const elemCa_gm2 = round2(elemCa_ha / 10);

    // 3. Dry Granular Fertilizer Mass Balance:
    //    Mass_product = [ Mass_target / %_nutrient ] * 100
    //    DAP (18-46-0) supplies P2O5 (46%) and part of N (18%)
    const dapKgHa = round1((targetP2O5_ha / 46) * 100);
    const nFromDapKgHa = dapKgHa * 0.18;
    const remNKgHa = Math.max(0, targetN_ha - nFromDapKgHa);
    const ureaKgHa = round1((remNKgHa / 46) * 100);
    const mopKgHa = round1((targetK2O_ha / 60) * 100);
    const gypsumKgHa = round1((targetCaO_ha / 40) * 100);

    // Custom single-grade calculation: Mass_product = (Mass_target / nutrientPct) * 100
    const gradeId = opts.fertGrade || 'rdf_blend';
    const customPct = Math.max(1, Math.min(100, +(opts.nutrientPct || 46)));
    const customTargetG = Math.max(1, +(opts.targetNutrientG || (elemN_gm2 * 100)));
    const customProductG = round1((customTargetG / customPct) * 100);

    // Active Stage Split Fertilizer Rate (kg/ha and kg/acre)
    const stageUreaKgHa = ureaKgHa * (split.nSplit || 0.35);
    const stageDapKgHa = dapKgHa * (split.pSplit || 0.30);
    const stageMopKgHa = mopKgHa * (split.kSplit || 0.30);

    let activeFertKgHa = stageUreaKgHa + stageDapKgHa + stageMopKgHa;
    if (gradeId === 'urea') activeFertKgHa = ((targetN_ha * (split.nSplit || 0.4)) / 46) * 100;
    else if (gradeId === 'dap') activeFertKgHa = ((targetP2O5_ha * (split.pSplit || 0.5)) / 46) * 100;
    else if (gradeId === 'mop') activeFertKgHa = ((targetK2O_ha * (split.kSplit || 0.4)) / 60) * 100;
    else if (gradeId === 'npk_20_10_10') activeFertKgHa = ((targetN_ha * (split.nSplit || 0.4)) / 20) * 100;
    else if (gradeId === 'npk_19_19_19') activeFertKgHa = ((targetN_ha * (split.nSplit || 0.4)) / 19) * 100;
    else if (gradeId === 'gypsum') activeFertKgHa = (targetCaO_ha / 40) * 100 * 0.5;

    // Ensure a practical minimum pass even at late stages
    activeFertKgHa = Math.max(12, activeFertKgHa);
    const recommendedFertKgAc = round1(activeFertKgHa * C.ACRE_TO_HA);
    const recommendedFertGm2 = round2(activeFertKgHa / 10);
    const totalFarmFertKg = round1(recommendedFertKgAc * acres);

    // =========================================================================
    // MODULE 02: SOIL MATRIX VOLUMETRICS & ORGANIC COMPOST RATIOS
    // =========================================================================
    // 1. Container Geometry & Soil Volume Determination (Truncated Conical Pot):
    //    V_pot (L) = [ (pi * h) / 3000 ] * [ R_top^2 + (R_top * R_base) + R_base^2 ]
    const potH = Math.max(5, +(opts.potHeightCm || 28));
    const potRTop = Math.max(3, +(opts.potRTopCm || 15));
    const potRBase = Math.max(2, +(opts.potRBaseCm || 11));
    const vPotL = round2(((Math.PI * potH) / 3000) * ((potRTop * potRTop) + (potRTop * potRBase) + (potRBase * potRBase)));

    // 2. Organic Compost Ratio Blending Formula:
    //    Volume_compost (L) = V_pot * f_ratio
    //    Mass_dry_compost (kg) = Volume_compost (m³) * rho_b (kg/m³)
    const fRatio = Math.max(0.05, Math.min(0.60, +(opts.compostFRatio || cd.compost.fRatio || 0.20)));
    const rhoB = Math.max(300, Math.min(1000, +(opts.compostBulkDensity || cd.compost.bulkDensity || 600)));
    const volCompostPotL = round2(vPotL * fRatio);
    const massCompostPotKg = round2((volCompostPotL / 1000) * rhoB);

    // 3. Field Bed Top-Dressing Volumetrics:
    //    Volumetric Rate (m³/m²) = depthCm / 100 | (L/m²) = depthCm * 10 | Mass (kg/m²) = (depthCm / 100) * rho_b
    const topDressCm = +(opts.topDressCm || cd.compost.topDressCm || 1.0);
    const topDressVolM3M2 = round2(topDressCm / 100);
    const topDressVolLM2 = round1(topDressCm * 10);
    const topDressKgM2 = round1((topDressCm / 100) * rhoB);

    // ICAR Field-Scale Vermicompost / Enriched Compost Dosing Rate (kg/acre)
    // Vermicompost t/ha -> kg/ha = vermiTonHa * 1000; split across active pass
    const soilOrganicFactor = (nState === 'low' || (snapshot.moisture != null && snapshot.moisture < (crop.moistureLow || 20))) ? 1.15 : 1.0;
    const vermiKgHaFull = (cd.compost.vermiTonHa || 2.5) * 1000 * soilOrganicFactor;
    const fymKgHaFull = (cd.compost.fymTonHa || 10.0) * 1000 * soilOrganicFactor;
    const activeCompostKgHa = Math.max(60, vermiKgHaFull * (split.compostSplit || 0.30));
    const recommendedCompostKgAc = Math.round(activeCompostKgHa * C.ACRE_TO_HA / 5) * 5;
    const totalFarmCompostKg = round1(recommendedCompostKgAc * acres);

    // =========================================================================
    // MODULE 03: CHEMICAL DILUTION KINETICS & PESTICIDE SPRAY DYNAMICS
    // =========================================================================
    // 1. Tree Row Volume (TRV) Canopy Modeling:
    //    TRV (m³/ha) = [ Height_canopy (m) * Width_canopy (m) / Row_Spacing (m) ] * 10,000
    //    Carrier Spray Volume (L/ha) = TRV * Canopy_Density_Constant (0.07 - 0.10 L/m³)
    const canopyPresetId = opts.canopyPreset || 'crop_auto';
    const presetObj = (C.CANOPY_REFERENCE_MATRIX && C.CANOPY_REFERENCE_MATRIX[canopyPresetId]) || null;
    const usePreset = presetObj && presetObj.heightM != null;

    const rawHeightM = usePreset ? presetObj.heightM : (cd.canopy.heightM * ( opts.ignoreStageCanopy ? 1 : (split.canopyScale || 0.85) ));
    const canopyHeightM = round2(Math.max(0.20, +(opts.canopyHeightM || rawHeightM)));
    const canopyWidthM = round2(Math.max(0.10, +(opts.canopyWidthM || (usePreset ? presetObj.widthM : cd.canopy.widthM))));
    const rowSpacingM = round2(Math.max(0.15, +(opts.rowSpacingM || (usePreset ? presetObj.rowSpacingM : cd.canopy.rowSpacingM))));
    const densityConst = round2(Math.max(0.05, Math.min(0.15, +(opts.densityConst || (usePreset ? presetObj.densityConst : cd.canopy.densityConst)))));

    const trvM3Ha = Math.round(((canopyHeightM * canopyWidthM) / rowSpacingM) * 10000);
    const carrierSprayLHa = Math.round(trvM3Ha * densityConst);
    const carrierSprayLM2 = round2(carrierSprayLHa / 10000);
    const carrierSprayLAc = Math.round(carrierSprayLHa * C.ACRE_TO_HA);

    // 2. Solution Concentration & Tank-Mix Volumetrics:
    //    V_concentrate (mL) = V_tank (L) * Concentration_Rate (mL/L)
    //    Mass_active_ingredient (g) = [ V_tank (L) * Target_ai (g/L) ] / Purity_fraction
    const humidStress = (snapshot.humidity != null && snapshot.humidity > 75) || (snapshot.moisture != null && snapshot.moisture > (crop.moistureGood || 35));
    const pestStressFactor = humidStress ? 1.15 : 1.0;
    const recommendedPestMlL = round1(Math.max(1.0, (cd.spray.concMlPerL || 3.0) * (split.pestMult || 1.0) * pestStressFactor));

    const vTankL = Math.max(1, +(opts.tankVolumeL || 25)); // 25 L Rover payload sprayer tank default
    const concRateMlL = Math.max(0.5, +(opts.concRateMlL || recommendedPestMlL));
    const targetAiGL = round2(Math.max(0.1, +(opts.targetAiGL || (cd.spray.targetAiGPerL || (concRateMlL * 0.5)))));
    const purityFrac = round2(Math.max(0.05, Math.min(1.0, +(opts.purityFrac || cd.spray.purity || 0.50))));

    const vConcentrateMl = round1(vTankL * concRateMlL);
    const massActiveIngredientG = round1((vTankL * targetAiGL) / purityFrac);
    const fieldTotalConcentrateMl = Math.round(carrierSprayLAc * acres * concRateMlL);

    return {
      cropId,
      cropName: crop.name_en,
      stage,
      acres,
      hectares: round2(hectares),
      areaM2: Math.round(areaM2),
      soilAdjust: { nState, pState, kState, nFactor, pFactor, kFactor },
      module1: {
        targetN_ha, targetP2O5_ha, targetK2O_ha, targetCaO_ha,
        elemN_ha, elemP_ha, elemK_ha, elemCa_ha,
        elemN_gm2, elemP_gm2, elemK_gm2, elemCa_gm2,
        ureaKgHa, dapKgHa, mopKgHa, gypsumKgHa,
        ureaKgAc: round1(ureaKgHa * C.ACRE_TO_HA),
        dapKgAc: round1(dapKgHa * C.ACRE_TO_HA),
        mopKgAc: round1(mopKgHa * C.ACRE_TO_HA),
        gypsumKgAc: round1(gypsumKgHa * C.ACRE_TO_HA),
        gradeId,
        customPct, customTargetG, customProductG,
        activeFertKgHa: round1(activeFertKgHa),
        recommendedFertKgAc,
        recommendedFertGm2,
        totalFarmFertKg
      },
      module2: {
        potH, potRTop, potRBase, vPotL,
        fRatio, rhoB, volCompostPotL, massCompostPotKg,
        topDressCm, topDressVolM3M2, topDressVolLM2, topDressKgM2,
        vermiTonHa: cd.compost.vermiTonHa,
        fymTonHa: cd.compost.fymTonHa,
        vermiKgAcFull: Math.round(vermiKgHaFull * C.ACRE_TO_HA),
        fymKgAcFull: Math.round(fymKgHaFull * C.ACRE_TO_HA),
        recommendedCompostKgAc,
        totalFarmCompostKg
      },
      module3: {
        canopyPresetId,
        formulaName: cd.spray.formulaName,
        canopyHeightM, canopyWidthM, rowSpacingM, densityConst,
        trvM3Ha,
        carrierSprayLHa, carrierSprayLM2, carrierSprayLAc,
        vTankL, concRateMlL, targetAiGL, purityFrac,
        vConcentrateMl, massActiveIngredientG,
        recommendedPestMlL,
        fieldTotalConcentrateMl
      }
    };
  }

  E.agri = {
    dailyGDD, cumulativeGDD, calcVPD, vpdBand, lightBand,
    pressureTrend, moistureBand, assessWater, assessHeat,
    assessNutrients, assessPh, assessWeather, assessCrop,
    analyze, trendOf, pumpDecision, calcDosing
  };
})();

