/* EnviroOS — crop-specific agronomic parameters.
 * DATA layer. No UI, no formulas here — just reference values.
 * Ranges are simplified, conservative interpretations of commonly published
 * extension guidance (e.g. ICAR / state agri-university crop guides).
 * They drive "good / watch / low-high" bands, never fertilizer doses. */

'use strict';

window.EnviroOS = window.EnviroOS || {};

/**
 * Per-crop parameters:
 *  gddBase / gddUpper (°C): base + heat-cap for Growing Degree Days
 *  gddStageTargets: cumulative GDD needed to reach each stage boundary
 *  phMin / phMax: suitable soil pH band
 *  nLow / pLow / kLow: below this => LOW (mg/kg, indicative)
 *  nHigh / pHigh / kHigh: above this => HIGH (indicative)
 *  heatWatch / heatHigh (°C): air-temp bands for this crop
 *  moistureLow / moistureGood (% volumetric VWC): soil-moisture bands
 */
EnviroOS.DOSING_CONSTANTS = {
  // Module 01: Oxide-to-Elemental Atomic Mass Conversion Constants
  P2O5_TO_P: 0.4364, // 2(30.97) / [2(30.97) + 5(16.00)]
  K2O_TO_K: 0.8302,  // 2(39.10) / [2(39.10) + 16.00]
  CAO_TO_CA: 0.7147, // 40.08 / [40.08 + 16.00]
  HA_TO_ACRE: 2.47105,
  ACRE_TO_HA: 0.404686,
  // Commercial Fertilizer Grades (% N - % P2O5 - % K2O - % CaO)
  FERTILIZER_GRADES: {
    rdf_blend: { id: 'rdf_blend', label: 'ICAR RDF Split Blend (Urea + DAP + MOP)', nPct: 46, p2o5Pct: 46, k2oPct: 60 },
    urea:      { id: 'urea',      label: 'Urea (46% N)',          nPct: 46, p2o5Pct: 0,  k2oPct: 0  },
    dap:       { id: 'dap',       label: 'DAP (18-46-0)',         nPct: 18, p2o5Pct: 46, k2oPct: 0  },
    mop:       { id: 'mop',       label: 'MOP (0-0-60)',          nPct: 0,  p2o5Pct: 0,  k2oPct: 60 },
    npk_20_10_10: { id: 'npk_20_10_10', label: 'NPK (20-10-10)', nPct: 20, p2o5Pct: 10, k2oPct: 10 },
    npk_19_19_19: { id: 'npk_19_19_19', label: 'NPK (19-19-19)', nPct: 19, p2o5Pct: 19, k2oPct: 19 },
    gypsum:    { id: 'gypsum',    label: 'Gypsum / Calcite (40% CaO)', nPct: 0, p2o5Pct: 0, k2oPct: 0, caoPct: 40 }
  },
  // Module 02: Field Bed Top-Dressing Volumetrics Reference
  TOP_DRESS_DEPTHS: [
    { depthCm: 0.5, labelKey: 'comp_depth_seed', volM3M2: 0.005, volLM2: 5.0,  massAt600: 3.0 },
    { depthCm: 1.0, labelKey: 'comp_depth_std',  volM3M2: 0.010, volLM2: 10.0, massAt600: 6.0 },
    { depthCm: 2.5, labelKey: 'comp_depth_heavy',volM3M2: 0.025, volLM2: 25.0, massAt600: 15.0 },
    { depthCm: 5.0, labelKey: 'comp_depth_over', volM3M2: 0.050, volLM2: 50.0, massAt600: 30.0 }
  ],
  // Module 03: Standard Crop Canopy Spray Reference Matrix
  CANOPY_REFERENCE_MATRIX: {
    crop_auto:  { id: 'crop_auto',  label: 'Selected Crop Canopy (Research)', heightM: null, widthM: null, rowSpacingM: null, densityConst: null },
    vineyard:   { id: 'vineyard',   label: 'Vineyard / Bush Fruit',  heightM: 1.8, widthM: 1.0, rowSpacingM: 2.5, densityConst: 0.080, trvRef: 7200,  sprayRef: 576 },
    orchard:    { id: 'orchard',    label: 'Semi-Dwarf Orchard',     heightM: 3.2, widthM: 2.1, rowSpacingM: 4.0, densityConst: 0.080, trvRef: 16800, sprayRef: 1344 },
    citrus:     { id: 'citrus',     label: 'High-Density Citrus',    heightM: 4.0, widthM: 3.0, rowSpacingM: 5.5, densityConst: 0.090, trvRef: 21818, sprayRef: 1963 },
    greenhouse: { id: 'greenhouse', label: 'Greenhouse Row Crop',    heightM: 2.2, widthM: 0.8, rowSpacingM: 1.5, densityConst: 0.090, trvRef: 11733, sprayRef: 1056 }
  },
  // Growth Stage Split Multipliers for Active Application Pass
  STAGE_SPLITS: {
    seedling:   { nSplit: 0.40, pSplit: 1.00, kSplit: 0.50, compostSplit: 0.50, canopyScale: 0.35, pestMult: 0.75 },
    vegetative: { nSplit: 0.40, pSplit: 0.25, kSplit: 0.25, compostSplit: 0.30, canopyScale: 0.75, pestMult: 1.00 },
    flowering:  { nSplit: 0.20, pSplit: 0.15, kSplit: 0.25, compostSplit: 0.20, canopyScale: 1.00, pestMult: 1.15 },
    fruiting:   { nSplit: 0.15, pSplit: 0.10, kSplit: 0.35, compostSplit: 0.15, canopyScale: 1.00, pestMult: 1.10 },
    maturity:   { nSplit: 0.05, pSplit: 0.00, kSplit: 0.10, compostSplit: 0.10, canopyScale: 0.95, pestMult: 0.60 },
    harvest:    { nSplit: 0.00, pSplit: 0.00, kSplit: 0.00, compostSplit: 0.05, canopyScale: 0.90, pestMult: 0.00 }
  }
};

EnviroOS.CROPS = {
  bajra: {
    labelKey: 'crop_bajra', name_en: 'Bajra', name_hi: 'बाजरा',
    gddBase: 10, gddUpper: 35,
    gddStageTargets: { seedling: 120, vegetative: 450, flowering: 800, fruiting: 1100, maturity: 1400 },
    phMin: 5.5, phMax: 8.0,
    // Moisture (% VWC): Critical Dry <12%, Needed 12-15%, Good 15-25%, Excess >32%
    moistureDry: 12, moistureLow: 15, moistureGood: 25, moistureExcess: 32,
    // Soil Nutrients (ppm / mg/kg, ICAR Soil Health Card standard)
    nLow: 105, nGood: 215, nHigh: 215, pLow: 5.0, pGood: 10.0, pHigh: 10.0, kLow: 50, kGood: 125, kHigh: 125,
    // Sunlight (lux) & Temp (°C)
    luxLow: 20000, luxGood: 50000, luxScorch: 95000,
    tempMin: 12, tempOptMin: 28, tempOptMax: 35, tempHeatStress: 42,
    heatWatch: 36, heatHigh: 42,
    // Agronomic Dosing & Canopy Parameters (ICAR Pearl Millet Research)
    dosing: {
      rdf: { n: 80, p2o5: 40, k2o: 40, cao: 25 }, // kg/ha
      compost: { vermiTonHa: 2.0, fymTonHa: 6.0, topDressCm: 0.5, fRatio: 0.18, bulkDensity: 600 },
      canopy: { heightM: 1.80, widthM: 0.28, rowSpacingM: 0.45, densityConst: 0.075 },
      spray: { concMlPerL: 2.5, targetAiGPerL: 1.25, purity: 0.50, formulaName: 'Neem / Mancozeb Bio-Mix' }
    }
  },
  wheat: {
    labelKey: 'crop_wheat', name_en: 'Wheat', name_hi: 'गेहूं',
    gddBase: 4.5, gddUpper: 30,
    gddStageTargets: { seedling: 150, vegetative: 550, flowering: 950, fruiting: 1300, maturity: 1700 },
    phMin: 6.0, phMax: 7.8,
    moistureDry: 18, moistureLow: 20, moistureGood: 30, moistureExcess: 35,
    nLow: 105, nGood: 215, nHigh: 215, pLow: 5.0, pGood: 10.0, pHigh: 10.0, kLow: 50, kGood: 125, kHigh: 125,
    luxLow: 15000, luxGood: 35000, luxScorch: 75000,
    tempMin: 4, tempOptMin: 18, tempOptMax: 24, tempHeatStress: 30,
    heatWatch: 26, heatHigh: 30,
    // Agronomic Dosing & Canopy Parameters (ICAR-IIWBR Wheat Research)
    dosing: {
      rdf: { n: 120, p2o5: 60, k2o: 40, cao: 30 }, // kg/ha
      compost: { vermiTonHa: 2.5, fymTonHa: 10.0, topDressCm: 1.0, fRatio: 0.20, bulkDensity: 600 },
      canopy: { heightM: 0.85, widthM: 0.18, rowSpacingM: 0.20, densityConst: 0.070 },
      spray: { concMlPerL: 2.5, targetAiGPerL: 1.25, purity: 0.50, formulaName: 'Propiconazole / Bio-Fungicide' }
    }
  },
  rice: {
    labelKey: 'crop_rice', name_en: 'Rice', name_hi: 'धान',
    gddBase: 10, gddUpper: 35,
    gddStageTargets: { seedling: 200, vegetative: 700, flowering: 1200, fruiting: 1600, maturity: 2000 },
    phMin: 5.5, phMax: 7.0,
    moistureDry: 25, moistureLow: 35, moistureGood: 50, moistureExcess: 60,
    nLow: 105, nGood: 215, nHigh: 215, pLow: 5.0, pGood: 10.0, pHigh: 10.0, kLow: 50, kGood: 125, kHigh: 125,
    luxLow: 15000, luxGood: 40000, luxScorch: 80000,
    tempMin: 10, tempOptMin: 25, tempOptMax: 33, tempHeatStress: 36,
    heatWatch: 33, heatHigh: 36,
    // Agronomic Dosing & Canopy Parameters (ICAR-NRRI Paddy Research)
    dosing: {
      rdf: { n: 120, p2o5: 60, k2o: 60, cao: 30 }, // kg/ha
      compost: { vermiTonHa: 2.5, fymTonHa: 8.0, topDressCm: 1.0, fRatio: 0.20, bulkDensity: 620 },
      canopy: { heightM: 1.05, widthM: 0.22, rowSpacingM: 0.20, densityConst: 0.080 },
      spray: { concMlPerL: 3.0, targetAiGPerL: 1.50, purity: 0.50, formulaName: 'Tricyclazole / Neem Extract' }
    }
  },
  maize: {
    labelKey: 'crop_maize', name_en: 'Maize', name_hi: 'मक्का',
    gddBase: 10, gddUpper: 35,
    gddStageTargets: { seedling: 150, vegetative: 600, flowering: 1000, fruiting: 1350, maturity: 1700 },
    phMin: 5.8, phMax: 7.5,
    moistureDry: 18, moistureLow: 22, moistureGood: 32, moistureExcess: 35,
    nLow: 115, nGood: 225, nHigh: 225, pLow: 5.5, pGood: 11.0, pHigh: 11.0, kLow: 55, kGood: 135, kHigh: 135,
    luxLow: 20000, luxGood: 50000, luxScorch: 90000,
    tempMin: 10, tempOptMin: 24, tempOptMax: 32, tempHeatStress: 36,
    heatWatch: 33, heatHigh: 36,
    // Agronomic Dosing & Canopy Parameters (ICAR-IIMR Maize Research)
    dosing: {
      rdf: { n: 135, p2o5: 60, k2o: 50, cao: 35 }, // kg/ha
      compost: { vermiTonHa: 2.5, fymTonHa: 10.0, topDressCm: 1.0, fRatio: 0.22, bulkDensity: 600 },
      canopy: { heightM: 2.10, widthM: 0.50, rowSpacingM: 0.65, densityConst: 0.080 },
      spray: { concMlPerL: 3.5, targetAiGPerL: 1.75, purity: 0.50, formulaName: 'Spinetoram / Bio-Bt Spray' }
    }
  },
  cotton: {
    labelKey: 'crop_cotton', name_en: 'Cotton', name_hi: 'कपास',
    gddBase: 15.5, gddUpper: 38,
    gddStageTargets: { seedling: 120, vegetative: 450, flowering: 800, fruiting: 1200, maturity: 1600 },
    phMin: 5.8, phMax: 8.0,
    moistureDry: 18, moistureLow: 22, moistureGood: 32, moistureExcess: 38,
    nLow: 105, nGood: 215, nHigh: 215, pLow: 5.0, pGood: 10.0, pHigh: 10.0, kLow: 60, kGood: 135, kHigh: 135,
    luxLow: 20000, luxGood: 50000, luxScorch: 85000,
    tempMin: 14, tempOptMin: 25, tempOptMax: 32, tempHeatStress: 38,
    heatWatch: 34, heatHigh: 38,
    // Agronomic Dosing & Canopy Parameters (ICAR-CICR Cotton Research)
    dosing: {
      rdf: { n: 120, p2o5: 60, k2o: 60, cao: 40 }, // kg/ha
      compost: { vermiTonHa: 3.0, fymTonHa: 12.0, topDressCm: 1.0, fRatio: 0.22, bulkDensity: 600 },
      canopy: { heightM: 1.35, widthM: 0.75, rowSpacingM: 0.90, densityConst: 0.090 },
      spray: { concMlPerL: 4.5, targetAiGPerL: 2.25, purity: 0.50, formulaName: 'Azadirachtin / Bollworm Guard' }
    }
  },
  tomato: {
    labelKey: 'crop_tomato', name_en: 'Tomato', name_hi: 'टमाटर',
    gddBase: 10, gddUpper: 32,
    gddStageTargets: { seedling: 120, vegetative: 400, flowering: 700, fruiting: 1000, maturity: 1300 },
    phMin: 6.0, phMax: 7.0,
    moistureDry: 18, moistureLow: 22, moistureGood: 30, moistureExcess: 35,
    nLow: 105, nGood: 200, nHigh: 200, pLow: 5.5, pGood: 11.0, pHigh: 11.0, kLow: 65, kGood: 145, kHigh: 145,
    luxLow: 15000, luxGood: 35000, luxScorch: 70000,
    tempMin: 10, tempOptMin: 20, tempOptMax: 28, tempHeatStress: 34,
    heatWatch: 30, heatHigh: 34,
    // Agronomic Dosing & Canopy Parameters (ICAR-IIHR Tomato Research)
    dosing: {
      rdf: { n: 180, p2o5: 120, k2o: 150, cao: 60 }, // kg/ha
      compost: { vermiTonHa: 4.0, fymTonHa: 15.0, topDressCm: 2.5, fRatio: 0.25, bulkDensity: 580 },
      canopy: { heightM: 1.40, widthM: 0.65, rowSpacingM: 0.75, densityConst: 0.090 },
      spray: { concMlPerL: 4.0, targetAiGPerL: 2.00, purity: 0.50, formulaName: 'Copper Oxychloride / Neem' }
    }
  },
  onion: {
    labelKey: 'crop_onion', name_en: 'Onion', name_hi: 'प्याज',
    gddBase: 7, gddUpper: 30,
    gddStageTargets: { seedling: 150, vegetative: 500, flowering: 800, fruiting: 1050, maturity: 1300 },
    phMin: 6.0, phMax: 7.2,
    moistureDry: 20, moistureLow: 24, moistureGood: 32, moistureExcess: 35,
    nLow: 105, nGood: 200, nHigh: 200, pLow: 5.5, pGood: 11.0, pHigh: 11.0, kLow: 60, kGood: 125, kHigh: 125,
    luxLow: 12000, luxGood: 35000, luxScorch: 70000,
    tempMin: 7, tempOptMin: 18, tempOptMax: 28, tempHeatStress: 35,
    heatWatch: 30, heatHigh: 35,
    // Agronomic Dosing & Canopy Parameters (ICAR-DOGR Onion Research)
    dosing: {
      rdf: { n: 110, p2o5: 60, k2o: 80, cao: 35 }, // kg/ha
      compost: { vermiTonHa: 3.5, fymTonHa: 12.0, topDressCm: 1.0, fRatio: 0.22, bulkDensity: 600 },
      canopy: { heightM: 0.50, widthM: 0.15, rowSpacingM: 0.20, densityConst: 0.070 },
      spray: { concMlPerL: 2.5, targetAiGPerL: 1.25, purity: 0.50, formulaName: 'Fipronil / Thrips Bio-Control' }
    }
  },
  chilli: {
    labelKey: 'crop_chilli', name_en: 'Chilli', name_hi: 'मिर्च',
    gddBase: 10, gddUpper: 34,
    gddStageTargets: { seedling: 130, vegetative: 450, flowering: 750, fruiting: 1050, maturity: 1350 },
    phMin: 6.0, phMax: 7.2,
    moistureDry: 18, moistureLow: 20, moistureGood: 30, moistureExcess: 34,
    nLow: 100, nGood: 200, nHigh: 200, pLow: 5.0, pGood: 10.0, pHigh: 10.0, kLow: 60, kGood: 135, kHigh: 135,
    luxLow: 15000, luxGood: 35000, luxScorch: 70000,
    tempMin: 10, tempOptMin: 22, tempOptMax: 30, tempHeatStress: 35,
    heatWatch: 31, heatHigh: 35,
    // Agronomic Dosing & Canopy Parameters (ICAR-IIHR Chilli Research)
    dosing: {
      rdf: { n: 150, p2o5: 80, k2o: 100, cao: 45 }, // kg/ha
      compost: { vermiTonHa: 3.0, fymTonHa: 12.0, topDressCm: 1.0, fRatio: 0.25, bulkDensity: 600 },
      canopy: { heightM: 0.80, widthM: 0.50, rowSpacingM: 0.55, densityConst: 0.085 },
      spray: { concMlPerL: 4.0, targetAiGPerL: 2.00, purity: 0.50, formulaName: 'Abamectin / Mite-Curl Guard' }
    }
  },
  soybean: {
    labelKey: 'crop_soybean', name_en: 'Soybean', name_hi: 'सोयाबीन',
    gddBase: 10, gddUpper: 32,
    gddStageTargets: { seedling: 120, vegetative: 450, flowering: 800, fruiting: 1100, maturity: 1400 },
    phMin: 6.0, phMax: 7.2,
    moistureDry: 20, moistureLow: 24, moistureGood: 32, moistureExcess: 38,
    nLow: 105, nGood: 180, nHigh: 180, pLow: 5.5, pGood: 11.0, pHigh: 11.0, kLow: 55, kGood: 125, kHigh: 125,
    luxLow: 15000, luxGood: 40000, luxScorch: 80000,
    tempMin: 10, tempOptMin: 24, tempOptMax: 30, tempHeatStress: 35,
    heatWatch: 31, heatHigh: 35,
    // Agronomic Dosing & Canopy Parameters (ICAR-IISR Soybean Research)
    dosing: {
      rdf: { n: 30, p2o5: 75, k2o: 40, cao: 40 }, // kg/ha (N-fixing legume: low N starter, high P)
      compost: { vermiTonHa: 2.0, fymTonHa: 6.0, topDressCm: 0.5, fRatio: 0.18, bulkDensity: 600 },
      canopy: { heightM: 0.70, widthM: 0.40, rowSpacingM: 0.40, densityConst: 0.080 },
      spray: { concMlPerL: 3.0, targetAiGPerL: 1.50, purity: 0.50, formulaName: 'Chlorantraniliprole / Bio-Spray' }
    }
  },
  potato: {
    labelKey: 'crop_potato', name_en: 'Potato', name_hi: 'आलू',
    gddBase: 7, gddUpper: 28,
    gddStageTargets: { seedling: 150, vegetative: 500, flowering: 800, fruiting: 1100, maturity: 1400 },
    phMin: 5.2, phMax: 6.8,
    moistureDry: 20, moistureLow: 25, moistureGood: 34, moistureExcess: 36,
    nLow: 110, nGood: 215, nHigh: 215, pLow: 7.0, pGood: 13.5, pHigh: 13.5, kLow: 68, kGood: 150, kHigh: 150,
    luxLow: 15000, luxGood: 35000, luxScorch: 65000,
    tempMin: 6, tempOptMin: 16, tempOptMax: 22, tempHeatStress: 28,
    heatWatch: 24, heatHigh: 28,
    // Agronomic Dosing & Canopy Parameters (ICAR-CPRI Potato Research)
    dosing: {
      rdf: { n: 180, p2o5: 100, k2o: 150, cao: 50 }, // kg/ha (heavy tuber feeder)
      compost: { vermiTonHa: 5.0, fymTonHa: 18.0, topDressCm: 2.5, fRatio: 0.28, bulkDensity: 600 },
      canopy: { heightM: 0.65, widthM: 0.50, rowSpacingM: 0.55, densityConst: 0.085 },
      spray: { concMlPerL: 3.5, targetAiGPerL: 1.75, purity: 0.50, formulaName: 'Cymoxanil + Mancozeb (Blight)' }
    }
  },
  grapes: {
    labelKey: 'crop_grapes', name_en: 'Grapes', name_hi: 'अंगूर',
    gddBase: 10, gddUpper: 35,
    gddStageTargets: { seedling: 150, vegetative: 500, flowering: 950, fruiting: 1400, maturity: 1800 },
    phMin: 6.0, phMax: 7.5,
    // Moisture (% VWC): Critical Dry <14%, Needed 14-18%, Good 18-28%, Excess >34% (RDI deficit irrigation friendly)
    moistureDry: 14, moistureLow: 18, moistureGood: 28, moistureExcess: 34,
    // Soil Nutrients (ppm / mg/kg, ICAR-NRCG Viticulture Standard)
    nLow: 90, nGood: 180, nHigh: 180, pLow: 6.0, pGood: 12.0, pHigh: 12.0, kLow: 80, kGood: 180, kHigh: 180,
    // Sunlight (lux) & Temp (°C)
    luxLow: 25000, luxGood: 55000, luxScorch: 95000,
    tempMin: 10, tempOptMin: 22, tempOptMax: 32, tempHeatStress: 38,
    heatWatch: 34, heatHigh: 38,
    // Agronomic Dosing & Canopy Parameters (ICAR-NRCG Viticulture Research)
    dosing: {
      rdf: { n: 100, p2o5: 50, k2o: 120, cao: 50 }, // kg/ha (high K for berry sugar/brix)
      compost: { vermiTonHa: 3.5, fymTonHa: 10.0, topDressCm: 1.0, fRatio: 0.20, bulkDensity: 600 },
      canopy: { heightM: 1.80, widthM: 1.00, rowSpacingM: 2.50, densityConst: 0.080 }, // Trellised vineyard
      spray: { concMlPerL: 2.5, targetAiGPerL: 1.25, purity: 0.50, formulaName: 'Bordeaux Mix / Sulfur / Downy Guard' }
    }
  },
  olives: {
    labelKey: 'crop_olives', name_en: 'Olives', name_hi: 'जैतून',
    gddBase: 10, gddUpper: 36,
    gddStageTargets: { seedling: 180, vegetative: 550, flowering: 950, fruiting: 1400, maturity: 1850 },
    phMin: 6.5, phMax: 8.5, // Tolerates calcareous alkaline soils
    // Moisture (% VWC): Critical Dry <12%, Needed 12-16%, Good 16-26%, Excess >32% (Drought hardy xerophyte)
    moistureDry: 12, moistureLow: 16, moistureGood: 26, moistureExcess: 32,
    // Soil Nutrients (ppm / mg/kg, ROCL / Mediterranean Olive Standard)
    nLow: 80, nGood: 160, nHigh: 160, pLow: 5.0, pGood: 10.0, pHigh: 10.0, kLow: 75, kGood: 160, kHigh: 160,
    // Sunlight (lux) & Temp (°C)
    luxLow: 30000, luxGood: 65000, luxScorch: 100000,
    tempMin: 7, tempOptMin: 20, tempOptMax: 32, tempHeatStress: 40,
    heatWatch: 36, heatHigh: 40,
    // Agronomic Dosing & Canopy Parameters (ROCL / Semi-Arid Olive Research)
    dosing: {
      rdf: { n: 80, p2o5: 40, k2o: 90, cao: 60 }, // kg/ha (high calcium/potassium for oil synthesis)
      compost: { vermiTonHa: 3.0, fymTonHa: 12.0, topDressCm: 1.0, fRatio: 0.22, bulkDensity: 620 },
      canopy: { heightM: 3.20, widthM: 2.20, rowSpacingM: 5.00, densityConst: 0.085 }, // Olive orchard grove
      spray: { concMlPerL: 3.0, targetAiGPerL: 1.50, purity: 0.50, formulaName: 'Copper Hydroxide / Peacock Spot Guard' }
    }
  }
};

EnviroOS.CROP_STAGES = ['seedling', 'vegetative', 'flowering', 'fruiting', 'maturity', 'harvest'];
EnviroOS.CROP_IDS = Object.keys(EnviroOS.CROPS);

EnviroOS.getCrop = function (id) {
  return EnviroOS.CROPS[id] || EnviroOS.CROPS.bajra;
};

