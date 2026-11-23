/* EnviroOS — AGRI MARKET (Farm Store & Precision Gear).
 * Shelves:
 *   1. Seeds & Saplings for all 12 crops in the app with full agronomic perspective stats.
 *   2. Sprinklers & Drip irrigation hardware with engineering specs.
 *   3. Dosing & Nutrition pumps with chemical compatibility & IoT sync specs.
 *   4. My Orders with multi-stage live tracking and COD / UPI checkout.
 * Cart and orders are persisted in localStorage.
 */

'use strict';

window.EnviroOS = window.EnviroOS || {};

(function () {
  const E = EnviroOS, U = E.UI;
  const t = U.t, esc = U.esc, $ = U.$;
  const MI = (name) => `<span class="material-symbols-outlined ui-ic" aria-hidden="true">${name}</span>`;
  const SVG = (body) => `<svg class="crop-svg gear-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g stroke="none">${body}</g></svg>`;
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

  /* ---------- Gear Vector Icons ---------- */
  const GEAR_ICONS = {
    mini: SVG('<path d="M12 22v-8" stroke="#64748B" stroke-width="1.8" stroke-linecap="round" fill="none"/>'
      + '<rect x="9.5" y="11" width="5" height="3.4" rx="1" fill="#16A34A"/><path d="M12 11V8.6" stroke="#16A34A" stroke-width="1.6" fill="none"/>'
      + '<path d="M6.5 9.5c1.5-2 3.4-3 5.5-3s4 1 5.5 3" stroke="#93C5FD" stroke-width="1.2" fill="none" stroke-linecap="round"/>'
      + '<g fill="#3B82F6"><circle cx="5" cy="7" r="1.1"/><circle cx="8" cy="4.6" r="1.1"/><circle cx="12" cy="3.6" r="1.1"/><circle cx="16" cy="4.6" r="1.1"/><circle cx="19" cy="7" r="1.1"/></g>'),
    micro: SVG('<path d="M12 22v-6" stroke="#64748B" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
      + '<path d="M9 16.2h6l-1-3.2h-4z" fill="#16A34A"/><path d="M10 11.4h4M12 9.4v3.6" stroke="#15803D" stroke-width="1.4" stroke-linecap="round" fill="none"/>'
      + '<g fill="#3B82F6"><circle cx="6" cy="11" r=".95"/><circle cx="7" cy="7.2" r=".95"/><circle cx="9.6" cy="4.6" r=".95"/><circle cx="14.4" cy="4.6" r=".95"/><circle cx="17" cy="7.2" r=".95"/><circle cx="18" cy="11" r=".95"/><circle cx="12" cy="3.6" r=".95"/></g>'),
    drip: SVG('<path d="M2 8h20" stroke="#334155" stroke-width="2.4" stroke-linecap="round" fill="none"/>'
      + '<g fill="#16A34A"><rect x="5" y="9" width="2" height="2.4" rx=".5"/><rect x="11" y="9" width="2" height="2.4" rx=".5"/><rect x="17" y="9" width="2" height="2.4" rx=".5"/></g>'
      + '<g fill="#3B82F6"><path d="M6 13.2c.9 1.2 1.4 2 1.4 2.7a1.4 1.4 0 0 1-2.8 0c0-.7.5-1.5 1.4-2.7z"/><path d="M12 14.2c.9 1.2 1.4 2 1.4 2.7a1.4 1.4 0 0 1-2.8 0c0-.7.5-1.5 1.4-2.7z"/><path d="M18 13.2c.9 1.2 1.4 2 1.4 2.7a1.4 1.4 0 0 1-2.8 0c0-.7.5-1.5 1.4-2.7z"/></g>'
      + '<path d="M2 21h20" stroke="#A16207" stroke-width="1.4" stroke-dasharray="2 2" fill="none"/>'),
    raingun: SVG('<path d="M7 22l3-7M17 22l-3-7M12 22v-7" stroke="#64748B" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
      + '<path d="M9 13.5l9-6 1.4 2-9 6z" fill="#F59E0B"/><circle cx="10.5" cy="14.5" r="2.2" fill="#B45309"/>'
      + '<path d="M19.6 7.4C20.5 5.2 21.2 3.8 22.4 2.6" stroke="#3B82F6" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="1.5 1.8" fill="none"/>'),
    popup: SVG('<rect x="8" y="10" width="8" height="12" rx="1.5" fill="#334155"/>'
      + '<rect x="10" y="5" width="4" height="6" fill="#16A34A"/>'
      + '<circle cx="12" cy="4" r="2" fill="#22C55E"/>'
      + '<path d="M12 3C8 2 5 4 3 6" stroke="#38BDF8" stroke-width="1.4" stroke-linecap="round" fill="none"/>'
      + '<path d="M12 3c4-1 7 1 9 3" stroke="#38BDF8" stroke-width="1.4" stroke-linecap="round" fill="none"/>'),
    peristaltic: SVG('<rect x="3" y="5" width="18" height="14" rx="3" fill="#0F766E"/><circle cx="10" cy="12" r="4.4" fill="#ECFEFF"/>'
      + '<path d="M5.6 12a4.4 4.4 0 0 0 8.8 0" stroke="#F59E0B" stroke-width="1.4" fill="none"/>'
      + '<g fill="#0F766E"><circle cx="10" cy="9.4" r="1"/><circle cx="12.3" cy="13.3" r="1"/><circle cx="7.7" cy="13.3" r="1"/></g>'
      + '<rect x="16" y="8" width="3" height="2" rx=".6" fill="#5EEAD4"/><circle cx="17.5" cy="14.5" r="1.2" fill="#F59E0B"/>'),
    smart: SVG('<rect x="4" y="9" width="16" height="12" rx="3" fill="#16A34A"/><circle cx="12" cy="15" r="3.4" fill="#DCFCE7"/>'
      + '<path d="M12 13.2v3.6M10.2 15h3.6" stroke="#16A34A" stroke-width="1.4" stroke-linecap="round" fill="none"/>'
      + '<path d="M8.4 6a5.2 5.2 0 0 1 7.2 0M10.2 7.7a2.6 2.6 0 0 1 3.6 0" stroke="#16A34A" stroke-width="1.5" stroke-linecap="round" fill="none"/>'),
    venturi: SVG('<path d="M2 10h6l3 1.3h2l3-1.3h6v4h-6l-3-1.3h-2l-3 1.3H2z" fill="#22C55E"/>'
      + '<path d="M12 12.8V19" stroke="#64748B" stroke-width="2" stroke-linecap="round" fill="none"/><rect x="9" y="18.6" width="6" height="3.6" rx="1.2" fill="#F59E0B"/>'
      + '<path d="M3 7h4M5.6 5.6L7 7 5.6 8.4" stroke="#3B82F6" stroke-width="1.2" stroke-linecap="round" fill="none"/>'),
    diaphragm: SVG('<rect x="5" y="7" width="14" height="11" rx="2" fill="#1E293B"/>'
      + '<circle cx="12" cy="12.5" r="3.2" fill="#475569"/>'
      + '<path d="M2 11h3v3H2zM19 11h3v3h-3z" fill="#F59E0B"/>'
      + '<circle cx="12" cy="12.5" r="1.4" fill="#22C55E"/>'
      + '<path d="M9 5h6v2H9z" fill="#64748B"/>'),
    sprayer: SVG('<rect x="4" y="5" width="9" height="15" rx="3" fill="#EAB308"/><rect x="6" y="3" width="5" height="3" rx="1" fill="#A16207"/>'
      + '<rect x="5.5" y="8" width="6" height="2" rx=".8" fill="#FEF9C3"/>'
      + '<path d="M13 16c3 0 4-1 5-4l2-6" stroke="#475569" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
      + '<g fill="#3B82F6"><circle cx="21" cy="3.6" r=".8"/><circle cx="22.2" cy="5.6" r=".7"/><circle cx="19.6" cy="2.4" r=".7"/></g>')
  };

  /* ---------- Comprehensive Crop Perspective Catalog ---------- */
  const CROP_CATALOG = {
    bajra: {
      variety: 'GHB-538 Certified Hybrid',
      category: 'cereals',
      pack: '1.5 kg pack',
      price: 480,
      rating: 4.6,
      reviews: 184,
      badge: 'certified',
      specs: {
        optTemp: '28–35°C (Tolerates up to 42°C)',
        optMoist: '15–25% VWC (Drought hardy)',
        targetNpk: '80:40:40 kg/ha split',
        season: 'Kharif / Summer (85–95 days)',
        yield: '12–16 Quintals / Acre',
        soil: 'Well-drained sandy loam / light soils (pH 5.5–8.0)',
        sowing: 'Drill 2–3 cm depth, 45cm × 15cm spacing',
        cert: '≥ 95% Germination, ≥ 98% Purity',
        package: '1.5 kg multi-layer pouch + Thiram fungicide seed treatment',
        warranty: 'NSC / ICAR certified tag with lot test certificate',
        enviroTip: 'Maintain optimal moisture above 15% at panicle emergence and grain filling for peak yield.'
      }
    },
    wheat: {
      variety: 'HD-2967 Sharbati Certified High Yield',
      category: 'cereals',
      pack: '40 kg bag',
      price: 1850,
      rating: 4.8,
      reviews: 342,
      badge: 'best',
      specs: {
        optTemp: '18–24°C (Heat stress above 30°C)',
        optMoist: '20–30% VWC (CRI stage critical)',
        targetNpk: '120:60:40 kg/ha',
        season: 'Rabi / Winter (135–145 days)',
        yield: '20–25 Quintals / Acre',
        soil: 'Clay loam / fertile alluvial (pH 6.0–7.8)',
        sowing: 'Line sowing 20cm row spacing, 4–5 cm depth',
        cert: '≥ 96% Germination, Certified Foundation Grade',
        package: '40 kg HDPE woven bag with tamper-evident seal',
        warranty: 'Certified Seed Class II, ICAR-IIWBR Karnal verified',
        enviroTip: 'First irrigation at Crown Root Initiation (21 days) is vital; pair with sprinklers for uniform emergence.'
      }
    },
    rice: {
      variety: 'Pusa Basmati 1121 Extra Long Grain',
      category: 'cereals',
      pack: '10 kg bag',
      price: 950,
      rating: 4.7,
      reviews: 215,
      badge: 'certified',
      specs: {
        optTemp: '24–32°C',
        optMoist: '30–45% VWC (Shallow water 2–5 cm)',
        targetNpk: '120:60:60 kg/ha + 25 kg Zinc Sulphate',
        season: 'Kharif / Monsoon (120–135 days)',
        yield: '18–22 Quintals / Acre',
        soil: 'Heavy clay / silt loam with high water holding (pH 5.5–7.2)',
        sowing: 'Nursery 25 days, transplant 20cm × 15cm spacing',
        cert: '≥ 95% Germination, High genetic purity',
        package: '10 kg moisture-barrier sack with holographic verification',
        warranty: 'IARI Pusa genuine Breeder seed progeny',
        enviroTip: 'Monitor soil moisture carefully during panicle initiation; apply zinc if soil tests low.'
      }
    },
    maize: {
      variety: 'Pioneer P3396 High Starch Yellow Hybrid',
      category: 'cereals',
      pack: '4 kg bag',
      price: 1350,
      rating: 4.7,
      reviews: 198,
      badge: 'best',
      specs: {
        optTemp: '21–30°C',
        optMoist: '20–30% VWC (Avoid standing water)',
        targetNpk: '120:60:50 kg/ha',
        season: 'Kharif / Rabi / Spring (95–105 days)',
        yield: '25–32 Quintals / Acre',
        soil: 'Deep well-drained fertile loam (pH 5.8–7.5)',
        sowing: 'Ridge & furrow 60cm × 20cm spacing, 4cm depth',
        cert: '≥ 98% Germination, Vigorous seedling push',
        package: '4 kg poly bag with Cruiser insecticide coating',
        warranty: 'Corteva Pioneer original certified hybrid',
        enviroTip: 'Tasseling and silking are the most moisture-sensitive stages; prevent moisture drops below 20%.'
      }
    },
    cotton: {
      variety: 'RCH-659 BG-II Bollgard Bt Hybrid',
      category: 'fruits_cash',
      pack: '475 g pack (includes refuge)',
      price: 864,
      rating: 4.6,
      reviews: 160,
      badge: 'certified',
      specs: {
        optTemp: '25–35°C (Warm sunshine for boll opening)',
        optMoist: '18–28% VWC (Deep taproot)',
        targetNpk: '120:60:60 kg/ha split across 3 doses',
        season: 'Kharif (150–170 days)',
        yield: '10–14 Quintals / Acre seed cotton',
        soil: 'Deep black cotton soil / vertisols (pH 6.5–8.2)',
        sowing: '90cm × 60cm spacing, dibbling 3–4 cm depth',
        cert: '≥ 90% Germination, BG-II cry1Ac+cry2Ab protection',
        package: '475g multi-layer pack (450g Bt + 25g non-Bt refuge)',
        warranty: 'Rasi Seeds Govt price-capped certified packet',
        enviroTip: 'Avoid over-watering in early stages to prevent vegetative runaway; drip saves up to 55% water.'
      }
    },
    tomato: {
      variety: 'Abhinav F1 Syngenta Determinate Hybrid',
      category: 'vegetables',
      pack: '10 g pack (~3,500 seeds)',
      price: 650,
      rating: 4.8,
      reviews: 290,
      badge: 'best',
      specs: {
        optTemp: '20–28°C (Night temp 16–20°C ideal)',
        optMoist: '22–32% VWC (Drip prevents blossom end rot)',
        targetNpk: '150:100:120 kg/ha + Calcium Nitrate',
        season: 'Year-round Kharif/Rabi (65–70 days to pick)',
        yield: '25–35 Tonnes / Acre',
        soil: 'Rich well-aerated sandy loam (pH 6.0–7.0)',
        sowing: 'Pro-tray nursery, 60cm × 45cm field planting',
        cert: '≥ 95% Germination, TYLCV tolerant',
        package: '10g hermetically sealed foil pack',
        warranty: 'Syngenta authentic imported hybrid seed lot',
        enviroTip: 'Pair with peristaltic dosing pump for proportional calcium fertigation during fruit set.'
      }
    },
    onion: {
      variety: 'Fursungi Nasik Red (Export Grade)',
      category: 'vegetables',
      pack: '500 g tin',
      price: 1200,
      rating: 4.5,
      reviews: 145,
      badge: 'certified',
      specs: {
        optTemp: '15–26°C during bulbing',
        optMoist: '20–28% VWC (Frequent light irrigation)',
        targetNpk: '100:50:50 kg/ha + 20 kg Sulphur',
        season: 'Late Kharif & Rabi (110–125 days)',
        yield: '12–16 Tonnes / Acre (5-month storage life)',
        soil: 'Friable sandy loam rich in organic matter (pH 6.2–7.5)',
        sowing: 'Raised nursery bed, transplant 15cm × 10cm',
        cert: '≥ 92% Germination, High pungency',
        package: '500g tin can with pull-ring airtight lid',
        warranty: 'DOGR / State Agri Dept certified strain',
        enviroTip: 'Stop watering 10 days before harvest to tighten outer scales and ensure 5+ months storage life.'
      }
    },
    chilli: {
      variety: 'G4 Teja High-Pungency Export Grade',
      category: 'vegetables',
      pack: '10 g pack (~2,500 seeds)',
      price: 550,
      rating: 4.7,
      reviews: 180,
      badge: 'best',
      specs: {
        optTemp: '22–30°C',
        optMoist: '18–26% VWC (Avoid standing water)',
        targetNpk: '120:60:60 kg/ha',
        season: 'Kharif / Rabi (140–160 days)',
        yield: '2.0–2.8 Tonnes / Acre dry chilli (75,000+ SHU)',
        soil: 'Light loamy soil with excellent drainage (pH 6.0–7.0)',
        sowing: 'Plug tray nursery 30 days, transplant 75cm × 45cm',
        cert: '≥ 94% Germination, Thrips & mite tolerant',
        package: '10g aluminium vacuum pouch',
        warranty: 'High germination lab-certified seed lot',
        enviroTip: 'Use micro-sprinklers for humidity control on dry hot afternoons to avoid flower drop.'
      }
    },
    soybean: {
      variety: 'JS-335 Certified High Oil Seed',
      category: 'fruits_cash',
      pack: '30 kg bag',
      price: 2400,
      rating: 4.5,
      reviews: 132,
      badge: 'certified',
      specs: {
        optTemp: '22–32°C',
        optMoist: '20–30% VWC (Pod fill stage critical)',
        targetNpk: '25:60:40 kg/ha (Rhizobium inoculated)',
        season: 'Kharif (95–102 days)',
        yield: '10–14 Quintals / Acre (20% Oil, 40% Protein)',
        soil: 'Clay loam to medium black soil (pH 6.0–7.5)',
        sowing: 'Seed drill 45cm row spacing, 3–4 cm depth',
        cert: '≥ 92% Germination, Hand-cleaned graded',
        package: '30 kg breathable jute bag with lead seal',
        warranty: 'ICAR-IISR Indore certified variety',
        enviroTip: 'Do not sow deeper than 4 cm; Rhizobium culture supplied free with pack for nitrogen fixation.'
      }
    },
    potato: {
      variety: 'Kufri Pukhraj Early Bulking Tubers',
      category: 'vegetables',
      pack: '50 kg sack',
      price: 1800,
      rating: 4.6,
      reviews: 155,
      badge: 'certified',
      specs: {
        optTemp: '15–22°C (Night temp <20°C for tuberization)',
        optMoist: '22–32% VWC (Ridge furrow or drip)',
        targetNpk: '150:100:120 kg/ha',
        season: 'Rabi / Winter (70–90 days)',
        yield: '120–160 Quintals / Acre (Yellow oval tubers)',
        soil: 'Loose, friable sandy loam rich in organic matter (pH 5.2–6.8)',
        sowing: 'Cut tuber pieces 35–45g with 2 eyes, 60cm × 20cm',
        cert: '≥ 98% Sprout emergence, Cold-chain maintained',
        package: '50 kg ventilated hessian sack from cold storage',
        warranty: 'CPRI Shimla certified virus-tested seed stock',
        enviroTip: 'Earthing up at 30 days protects growing tubers from light-induced greening and solanine build-up.'
      }
    },
    grapes: {
      variety: 'Thompson Seedless / Tas-A-Ganesh Grafted Vine',
      category: 'fruits_cash',
      pack: '1 Grafted Sapling (Dogridge rootstock)',
      price: 120,
      rating: 4.9,
      reviews: 240,
      badge: 'best',
      specs: {
        optTemp: '22–35°C (Warm dry climate prevents powdery mildew)',
        optMoist: '18–26% VWC (Controlled deficit irrigation)',
        targetNpk: '160:80:200 kg/ha (High potash demand for Brix)',
        season: 'Perennial (October pruning, March–April harvest)',
        yield: '10–14 Tonnes / Acre mature vineyard (Brix 20–22°)',
        soil: 'Deep well-drained sandy loam with gravel (pH 6.5–8.0)',
        sowing: 'Plant in 1m × 1m pits with FYM, biochar & neem cake',
        cert: '100% Rooted live plant with active bud',
        package: 'Hardened container plant in UV polythene nursery pot',
        warranty: 'Grafted on Dogridge rootstock, NRCG Pune verified',
        enviroTip: 'EnviroOS canopy GDD model guides exact gibberellic acid (GA3) timing for uniform berry elongation.'
      }
    },
    olives: {
      variety: 'Picual / Arbequina High-Density Grafted Sapling',
      category: 'fruits_cash',
      pack: '1 Grafted Sapling (1.5 yr, 45cm)',
      price: 350,
      rating: 4.8,
      reviews: 118,
      badge: 'certified',
      specs: {
        optTemp: '15–30°C (Needs 200–400 chilling hours <7°C)',
        optMoist: '14–22% VWC (Extreme drought tolerance)',
        targetNpk: '80:40:100 kg/ha',
        season: 'Perennial (Productive for 50+ years)',
        yield: '2.5–3.5 Tonnes / Acre fruit (18–22% Extra Virgin Oil)',
        soil: 'Calcareous, rocky, well-aerated sandy loam (pH 6.5–8.5)',
        sowing: 'Pit 75cm × 75cm, drip emitter placed 30cm from trunk',
        cert: '100% Rooted grafted plant (1.5 years old, 45cm)',
        package: 'Containerized 5-litre root-ball bag with stake support',
        warranty: 'Rajasthan Olive Cultivation Mission (ROCM) certified',
        enviroTip: 'Thrives in arid/semi-arid regions of Rajasthan; keep soil moisture 14–18% during flowering.'
      }
    }
  };

  /* ---------- Comprehensive Farm Gear Perspective Catalog ---------- */
  const GEAR_CATALOG = [
    // Sprinklers
    {
      id: 'g_mini',
      cat: 'sprinklers',
      icon: 'mini',
      pack: '10 Nozzles + 1.2m Risers + Stakes',
      price: 1250,
      rating: 4.5,
      reviews: 168,
      badge: '',
      specs: {
        pressure: '1.5–2.5 bar (22–36 PSI)',
        flow: '180–240 LPH per nozzle',
        radius: '5.5–6.5 Metres circular throw',
        material: 'UV-Stabilized Polyacetal & Brass insert',
        connection: '1/2" Male BSP Thread / 16mm Grommet',
        package: '10 rotating sprinkler heads, 10 1.2m rigid PVC risers, 10 heavy ground support stakes, tubing adapters',
        warranty: '2 Years Manufacturer Replacement Warranty',
        suitability: 'Vegetables, onion, garlic, nurseries, pulses, intercropping',
        enviroTip: 'Operate at 2.0 bar with EnviroOS pump automated timer for 92% coefficient of uniformity.'
      }
    },
    {
      id: 'g_micro',
      cat: 'sprinklers',
      icon: 'micro',
      pack: '25 Pcs Mist/Spin Kit + 25m Microtube',
      price: 899,
      rating: 4.4,
      reviews: 142,
      badge: '',
      specs: {
        pressure: '1.0–2.0 bar (15–30 PSI)',
        flow: '60–100 Litres / Hour',
        radius: '3.0–4.0 Metres fine droplet radius',
        material: 'Engineered polymer with anti-clog vortex orifice',
        connection: '4/7mm feeder microtube with barbed adapter',
        package: '25 micro sprinklers, 25 support spikes, 25m 4/7mm feeder tubes, 25 barbed connectors',
        warranty: '1 Year Warranty against manufacturing defects',
        suitability: 'Polyhouses, grapevines, orchards, intercropping microclimate cooling',
        enviroTip: 'Ideal for lowering leaf temperature by 3–4°C during peak afternoon heatwaves.'
      }
    },
    {
      id: 'g_drip',
      cat: 'sprinklers',
      icon: 'drip',
      pack: '1 Acre Complete Modular Drip Kit',
      price: 4800,
      rating: 4.8,
      reviews: 310,
      badge: 'best',
      specs: {
        pressure: '1.0–3.0 bar working pressure',
        flow: '2.0 LPH per inline emitter (40cm spacing)',
        radius: 'Continuous root-zone wetting bulb (saves 65% water)',
        material: '16mm Class-2 UV-stabilized virgin LLDPE (400m coil)',
        connection: '1.5" Mainline connection with Screen filter & Venturi kit',
        package: '400m inline dripline coil, 1.5" screen filter (120 mesh), venturi fertilizer injector assembly, 20 joiners, 10 end caps, punch tool, flush valves',
        warranty: '3 Years Manufacturer Warranty against UV degradation',
        suitability: 'Cotton, sugarcane, maize, tomato, chilli, potato, vineyard rows',
        enviroTip: 'Connect to EnviroOS automatic pump controller for precision closed-loop moisture maintenance.'
      }
    },
    {
      id: 'g_raingun',
      cat: 'sprinklers',
      icon: 'raingun',
      pack: '1.5" Heavy Impact Brass Rain Gun',
      price: 3900,
      rating: 4.6,
      reviews: 185,
      badge: '',
      specs: {
        pressure: '2.5–5.0 bar (35–75 PSI)',
        flow: '9,000–18,000 Litres / Hour',
        radius: '26–36 Metres throw radius (covers up to 0.75 acre per shift)',
        material: 'Heavy-duty forged brass body & aluminium alloy arm',
        connection: '1.5" Female BSP flange mount with tripod clamp',
        package: '1.5" rain gun body, 3 interchangeable brass nozzles (10mm, 12mm, 14mm), tripod flange mount, quick-cam clamp',
        warranty: '2 Years Manufacturer Replacement Warranty',
        suitability: 'Wheat, bajra, soybean, sugarcane, open field rapid irrigation, frost protection',
        enviroTip: 'Best paired with a 5 HP or 7.5 HP monoblock/submersible pump delivering 3.5+ bar pressure.'
      }
    },
    {
      id: 'g_popup',
      cat: 'sprinklers',
      icon: 'popup',
      pack: '4 Pcs Pro Pop-up Rotor Sprinkler',
      price: 2199,
      rating: 4.5,
      reviews: 94,
      badge: '',
      specs: {
        pressure: '2.0–4.5 bar (30–65 PSI)',
        flow: '350–900 Litres / Hour per rotor',
        radius: '8–14 Metres radius, 40°–360° adjustable arc',
        material: 'UV-resistant ABS shell, stainless steel heavy retract spring',
        connection: '3/4" Female thread inlet, 4-inch pop-up wiper seal',
        package: '4 pop-up rotor assemblies, 12 precision nozzles, arc adjustment key',
        warranty: '2 Years Replacement Warranty',
        suitability: 'Fruit orchards, olive groves, lawn edges, perimeter boundary watering',
        enviroTip: 'Pops down flush with soil level so field rovers and tractors can pass freely overhead.'
      }
    },
    // Dosing Pumps
    {
      id: 'g_peristaltic',
      cat: 'dosing',
      icon: 'peristaltic',
      pack: '12V DC Variable Speed Dosing Pump (4 L/h)',
      price: 2450,
      rating: 4.5,
      reviews: 176,
      badge: '',
      specs: {
        pressure: '1.5 bar (22 PSI) maximum delivery head',
        flow: '0.2–4.0 Litres / Hour continuously adjustable',
        radius: 'Direct inline injection into irrigation line',
        material: 'Santoprene chemical tubing, 3-roller rotor assembly',
        connection: '12V DC / 18W power draw; 4/6mm PTFE suction/discharge hose',
        package: 'Peristaltic pump unit, 5m Santoprene spare tube, weighted suction foot strainer, injector quill with non-return check valve, wall mount bracket',
        warranty: '2 Years Warranty on motor and electronic drive',
        suitability: 'Liquid NPK fertilizers, acid pH balancing, micro-nutrients injection',
        enviroTip: 'Connect directly to EnviroOS Rover auxiliary 12V port or farm controller board.'
      }
    },
    {
      id: 'g_smart',
      cat: 'dosing',
      icon: 'smart',
      pack: 'Wi-Fi & RS485 EnviroOS IoT Smart Dosing Pump',
      price: 6499,
      rating: 4.9,
      reviews: 210,
      badge: 'smart',
      specs: {
        pressure: '3.0 bar (45 PSI) high head pressure',
        flow: '0.5–12.0 Litres / Hour precision digital stepper (±1% error)',
        radius: 'Automated synchronisation with EnviroOS crop stage formula',
        material: 'PVDF pump head, ceramic valves, industrial ABS enclosure',
        connection: 'Wi-Fi 802.11 b/g/n, RS485 Modbus, 12V/24V DC / 35W input',
        package: 'Smart dosing controller unit, digital in-line flow sensor, RS485 communication cable, 6mm quick push-fit fittings, mounting bracket, power supply',
        warranty: '2 Years Comprehensive Warranty + Lifetime Firmware Updates',
        suitability: 'Autonomous rover dosing, automated greenhouse fertigation, scheduled crop-stage nutrition',
        enviroTip: 'Syncs live with EnviroOS — automatically dispenses the exact NPK ratio calculated for your crop stage!'
      }
    },
    {
      id: 'g_venturi',
      cat: 'dosing',
      icon: 'venturi',
      pack: '3/4" PVDF Fertilizer Injector Kit + Flow Meter',
      price: 1150,
      rating: 4.4,
      reviews: 156,
      badge: '',
      specs: {
        pressure: '0.7–9.5 bar operational range (differential pressure operation)',
        flow: 'Suction 9–92 LPH; Mainline water flow 0.65–2.42 m³/h',
        radius: 'Inline hydrodynamic suction (no electricity required!)',
        material: 'Chemical-grade PVDF body (resistant to acids, chlorine & ozone)',
        connection: '3/4" BSP Male thread inlet and outlet',
        package: '3/4" PVDF venturi injector, clear braided suction tube with weighted stainless steel strainer, rotary micro-metering control valve',
        warranty: '1 Year Warranty against structural defects',
        suitability: 'Soluble fertilizers, bio-extracts, compost tea, chemical dosing into drip mains',
        enviroTip: 'Install on a bypass line across the main control valve to easily create the required 20% pressure drop.'
      }
    },
    {
      id: 'g_diaphragm',
      cat: 'dosing',
      icon: 'diaphragm',
      pack: '12V High-Pressure Diaphragm Pump (8 L/min)',
      price: 1850,
      rating: 4.5,
      reviews: 122,
      badge: '',
      specs: {
        pressure: '100 PSI (6.9 bar) automatic cut-off pressure switch',
        flow: '8.0 Litres / Minute (480 LPH) high volume discharge',
        radius: 'Up to 7m spray throw with appropriate lance nozzle',
        material: 'Santoprene diaphragm, Viton chemical check valves, copper motor',
        connection: '12V DC / 5A (60W); 1/2" (12mm) barbed hose inlet/outlet',
        package: '12V diaphragm pump unit with auto pressure switch, inlet strainer filter, two 1/2" brass hose barb adapters',
        warranty: '1 Year Replacement Warranty',
        suitability: 'Rover spot sprayer, foliar bio-pesticides, neem oil spray, liquid compost injection',
        enviroTip: 'High self-priming capacity up to 2.5m vertical lift; operates dry without damage.'
      }
    },
    {
      id: 'g_sprayer',
      cat: 'dosing',
      icon: 'sprayer',
      pack: '16 Litre 12V 12Ah Dual-Motor Backpack Sprayer',
      price: 2999,
      rating: 4.6,
      reviews: 204,
      badge: '',
      specs: {
        pressure: '80–100 PSI dual-switch high/low pressure regulator',
        flow: '3.6–4.2 Litres / Minute output',
        radius: 'Telescopic stainless steel lance reaches up to 3m canopy height',
        material: 'UV-stabilized virgin polymer 16L tank, padded ergonomic harness',
        connection: '12V 12Ah rechargeable battery (6+ hours continuous spray runtime)',
        package: '16L tank unit, 12V 12Ah battery & 1.7A smart fast charger, telescopic stainless steel lance, 4 brass nozzle attachments (fan, cone, 4-hole, shower), spare washer set',
        warranty: '1 Year Warranty on motor, 6 Months on battery',
        suitability: 'Canopy pest management, foliar liquid micro-nutrients, field sanitization',
        enviroTip: 'Includes voltmeter on front panel to monitor remaining battery charge in real time.'
      }
    }
  ];

  /* ---------- Products Accessor ---------- */
  const products = () => {
    const curCrop = (U.nodeInfo().cropId) || 'bajra';

    const crops = Object.keys(E.CROPS || {}).map((id) => {
      const c = CROP_CATALOG[id] || {
        variety: 'Certified Seed',
        category: 'cereals',
        pack: '1 kg',
        price: 500,
        rating: 4.5,
        reviews: 80,
        badge: '',
        specs: {}
      };
      const isCurrent = id === curCrop;
      return {
        id: 'c_' + id,
        kind: 'crop',
        cropId: id,
        icon: U.cropEmoji(id),
        name: t((E.CROPS[id] && E.CROPS[id].labelKey) || ('crop_' + id)),
        variety: c.variety,
        sub: `${c.variety} · ${c.pack}`,
        pack: c.pack,
        category: c.category,
        price: c.price,
        rating: c.rating,
        reviews: c.reviews,
        badge: isCurrent ? 'yours' : c.badge,
        specs: c.specs
      };
    }).sort((a, b) => (b.badge === 'yours') - (a.badge === 'yours'));

    const gear = GEAR_CATALOG.map((g) => ({
      id: g.id,
      kind: 'gear',
      cat: g.cat,
      icon: GEAR_ICONS[g.icon] || MI('handyman'),
      name: t('mk_' + g.id),
      variety: g.pack,
      sub: `${t('mk_cat_' + (g.cat === 'sprinklers' ? 'sprinkler' : 'dosing'))} · ${g.pack}`,
      pack: g.pack,
      category: g.cat,
      price: g.price,
      rating: g.rating,
      reviews: g.reviews,
      badge: g.badge || '',
      specs: g.specs
    }));

    return {
      crops,
      sprinklers: gear.filter((g) => g.cat === 'sprinklers'),
      dosing: gear.filter((g) => g.cat === 'dosing'),
      gear,
      all: crops.concat(gear)
    };
  };

  const findProduct = (id) => products().all.find((p) => p.id === id);

  /* ---------- Cart & Orders Persistence (localStorage) ---------- */
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (_) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } };

  const cart = () => load('enviroos.cart', {});
  const setQty = (id, q) => {
    const c = cart();
    if (q > 0) c[id] = Math.min(99, q); else delete c[id];
    save('enviroos.cart', c);
  };

  const cartLines = () => Object.entries(cart()).map(([id, q]) => ({ p: findProduct(id), q })).filter((l) => l.p);
  const cartTotals = () => {
    const lines = cartLines();
    const count = lines.reduce((a, l) => a + l.q, 0);
    const sub = lines.reduce((a, l) => a + l.q * l.p.price, 0);
    const delivery = sub === 0 || sub >= 2000 ? 0 : 99;
    return { lines, count, sub, delivery, total: sub + delivery };
  };

  const orders = () => load('enviroos.orders', []);

  /* ---------- Product Card Renderer ---------- */
  const card = (p, qty) => {
    const badgeText = p.badge ? t('mk_badge_' + p.badge) : '';
    const badgeHtml = badgeText ? `<span class="mk-badge ${p.badge}">${esc(badgeText)}</span>` : '';

    // Perspective Quick Chips
    let chip1 = '', chip2 = '';
    if (p.kind === 'crop') {
      chip1 = p.specs.season ? `<span class="mk-chip">${MI('calendar_month')} ${esc(p.specs.season.split('(')[0].trim())}</span>` : '';
      chip2 = `<span class="mk-chip mk-pack-quantity">${MI('inventory_2')} ${esc(p.pack)}</span>`;
    } else {
      chip1 = p.specs.pressure ? `<span class="mk-chip">${MI('speed')} ${esc(p.specs.pressure.split('(')[0].trim())}</span>` : '';
      chip2 = p.specs.flow ? `<span class="mk-chip">${MI('water')} ${esc(p.specs.flow.split('(')[0].trim())}</span>` : '';
    }

    const action = qty
      ? `<div class="mk-step" role="group"><button type="button" data-mk-dec="${p.id}" aria-label="−">${MI('remove')}</button><b>${qty}</b><button type="button" data-mk-inc="${p.id}" aria-label="+">${MI('add')}</button></div>`
      : `<button class="btn primary sm mk-add" type="button" data-mk-inc="${p.id}">${MI('add_shopping_cart')} <span>${esc(t('mk_add'))}</span></button>`;

    return `<div class="mk-card ${qty ? 'in-cart' : ''}" data-prod-id="${p.id}">`
      + badgeHtml
      + `<div class="mk-ic" data-mk-spec="${p.id}" role="button" tabindex="0" title="${esc(t('mk_specs'))}">${p.icon}</div>`
      + `<div class="mk-name" data-mk-spec="${p.id}" role="button" tabindex="0">${esc(p.name)}</div>`
      + `<div class="mk-sub">${esc(p.variety || p.sub)}</div>`
      + `<div class="mk-chips">${chip1}${chip2}</div>`
      + `<div class="mk-row">`
      + `  <span class="mk-price">${inr(p.price)}${p.kind === 'crop' ? `<small class="mk-per-pack">${esc(t('mk_fixed_pack'))}</small>` : ''}</span>`
      + `  <span class="mk-rate">★ ${p.rating.toFixed(1)} <small class="muted">(${p.reviews})</small></span>`
      + `</div>`
      + `<div class="mk-actions-row">`
      + `  <button class="btn secondary sm mk-spec-btn" type="button" data-mk-spec="${p.id}">${MI('info')} <span>${esc(t('mk_specs'))}</span></button>`
      + `  ${action}`
      + `</div>`
      + `</div>`;
  };

  /* ---------- Product Perspective Modal / Sheet ---------- */
  const openSpecSheet = (p) => {
    if (!p) return;
    const c = cart();
    const qty = c[p.id] || 0;
    const s = p.specs || {};

    let tableRows = '';
    if (p.kind === 'crop') {
      tableRows = [
        [t('mk_opt_temp'), s.optTemp],
        [t('mk_opt_moist'), s.optMoist],
        [t('mk_target_npk'), s.targetNpk],
        [t('mk_season'), s.season],
        [t('mk_yield'), s.yield],
        [t('mk_soil_suit'), s.soil],
        [t('mk_sow_guide'), s.sowing],
        [t('mk_cert'), s.cert],
        [t('mk_package'), s.package],
        [t('mk_warranty'), s.warranty]
      ].filter(([, v]) => v).map(([label, val]) =>
        `<div class="mk-spec-row"><span class="mk-spec-lbl">${esc(label)}</span><strong class="mk-spec-val">${esc(val)}</strong></div>`
      ).join('');
    } else {
      tableRows = [
        [t('mk_pressure'), s.pressure],
        [t('mk_flow'), s.flow],
        [t('mk_radius'), s.radius],
        [t('mk_voltage'), s.connection],
        [t('mk_compat'), s.material],
        [t('mk_package'), s.package],
        [t('mk_warranty'), s.warranty],
        [t('mk_soil_suit'), s.suitability]
      ].filter(([, v]) => v).map(([label, val]) =>
        `<div class="mk-spec-row"><span class="mk-spec-lbl">${esc(label)}</span><strong class="mk-spec-val">${esc(val)}</strong></div>`
      ).join('');
    }

    const enviroTip = s.enviroTip
      ? `<div class="mk-spec-tip"><span class="tip-ic">${MI('psychiatry')}</span><div><b>${esc(t('mk_enviro_tip'))}</b><p>${esc(s.enviroTip)}</p></div></div>`
      : '';

    const stepper = qty
      ? `<div class="mk-step" role="group"><button type="button" data-mk-dec="${p.id}" aria-label="−">${MI('remove')}</button><b>${qty}</b><button type="button" data-mk-inc="${p.id}" aria-label="+">${MI('add')}</button></div>`
      : `<button class="btn primary lg mk-spec-add" type="button" data-mk-inc="${p.id}">${MI('add_shopping_cart')} <span>${esc(t('mk_add'))} (${inr(p.price)})</span></button>`;

    const html = `<div class="sheethead">`
      + `  <div class="mk-spec-head-ic">${p.icon}</div>`
      + `  <div class="mk-spec-head-copy">`
      + `    <div class="stcond">${esc(p.name)}</div>`
      + `    <div class="sheetval">${inr(p.price)} · <span class="mk-rate">★ ${p.rating.toFixed(1)}</span> <small class="muted">(${p.reviews} ${t('reviews') || 'reviews'})</small></div>`
      + `    <div class="mk-spec-variety">${esc(p.variety || p.sub)}${p.kind === 'crop' ? ' · '+esc(p.pack) : ''}</div>`
      + `  </div>`
      + `  <span class="flexsp"></span>`
      + `  <button class="iconbtn dark" type="button" data-close-sheet="1" aria-label="${esc(t('close_label'))}">${U.icons.close}</button>`
      + `</div>`
      + `<div class="mk-spec-body">`
      + `  <div class="seclabel2">${esc(t('mk_perspective_title'))}</div>`
      + `  <div class="mk-spec-table">${tableRows}</div>`
      + `  ${enviroTip}`
      + `  <div class="mk-spec-footer">${stepper}</div>`
      + `</div>`;

    U.openSheet(html);
  };

  /* ---------- My Orders Shelf ---------- */
  const renderOrdersShelf = (ords) => {
    if (!ords || !ords.length) {
      return `<div class="card mk-empty-orders">`
        + `  <div class="empty-ic">${MI('inventory_2')}</div>`
        + `  <h3>${esc(t('mk_empty'))}</h3>`
        + `  <p class="muted">${esc(t('mk_banner_sub'))}</p>`
        + `  <button class="btn primary sm" type="button" data-mk-tab="crops">${MI('storefront')} <span>${esc(t('mk_shop_now'))}</span></button>`
        + `</div>`;
    }

    return `<div class="mk-orders-list">`
      + ords.map((o) => {
        const dateStr = new Date(o.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        const itemsList = (o.items || []).map(([pid, q, price]) => {
          const p = findProduct(pid);
          return `<div class="mk-ord-item">`
            + `  <span class="ord-ic">${p ? p.icon : MI('inventory_2')}</span>`
            + `  <span class="ord-name">${esc(p ? p.name : pid)} <b>× ${q}</b></span>`
            + `  <span class="ord-price">${inr((price || (p ? p.price : 0)) * q)}</span>`
            + `</div>`;
        }).join('');

        // 4-Stage Live Progress Simulation
        const elapsedHrs = (Date.now() - o.at) / 3600000;
        let step = 1; // 1: Requested, 2: Packed, 3: Dispatched, 4: Delivered
        if (elapsedHrs >= 24) step = 4;
        else if (elapsedHrs >= 6) step = 3;
        else if (elapsedHrs >= 0.5) step = 2;

        const stepsHtml = [
          [1, t('mk_track_1')],
          [2, t('mk_track_2')],
          [3, t('mk_track_3')],
          [4, t('mk_track_4')]
        ].map(([sNum, sLabel]) =>
          `<div class="mk-track-node ${sNum <= step ? 'active' : ''}">`
          + `  <div class="mk-track-dot">${sNum <= step ? '✓' : sNum}</div>`
          + `  <span class="mk-track-lbl">${esc(sLabel)}</span>`
          + `</div>`
        ).join('<div class="mk-track-line ' + (step >= 2 ? 'active' : '') + '"></div>');

        return `<div class="card mk-order-card">`
          + `  <div class="mk-ord-head">`
          + `    <div><strong class="mk-oid">#${esc(o.id)}</strong><span class="muted"> · ${dateStr}</span></div>`
          + `    <span class="stbadge sm good">${esc(t('mk_cod'))} · ${inr(o.total)}</span>`
          + `  </div>`
          + `  <div class="mk-track-bar">${stepsHtml}</div>`
          + `  <div class="mk-ord-items">${itemsList}</div>`
          + `  <div class="mk-ord-foot">`
          + `    <span class="muted">${MI('location_on')} ${esc(t('mk_deliver_to'))} <b>${esc(o.pincode)}</b> (${esc(o.phone || '')})</span>`
          + (step === 1 ? `    <button class="btn textlink sm warn" type="button" data-mk-cancel="${o.id}">${MI('close')} <span>${esc(t('mk_cancel'))}</span></button>` : '')
          + `  </div>`
          + `</div>`;
      }).join('')
      + `</div>`;
  };

  /* ---------- Main Screen View ---------- */
  U.vMarket = () => {
    const tab = U.mkTab || 'crops'; // 'crops' | 'sprinklers' | 'dosing' | 'orders'
    const q = (U.mkQuery || '').trim().toLowerCase();
    const sort = U.mkSort || 'recommended';
    const filt = U.mkFilter || 'all';

    const P = products();
    const c = cart();
    const tot = cartTotals();
    const pin = (U.profile && U.profile.pincode) || '342001';
    const ords = orders();

    // Determine items based on active shelf (or global search if query present)
    let items = [];
    if (q) {
      // Global intelligent search across crops, seeds, sprinklers & dosing pumps
      items = P.all.filter((p) => {
        const hay = [
          p.name,
          p.variety,
          p.cropId,
          p.category,
          p.pack,
          p.specs ? Object.values(p.specs).join(' ') : ''
        ].join(' ').toLowerCase();
        return hay.includes(q);
      });
    } else if (tab === 'crops') {
      items = P.crops;
      if (filt !== 'all') items = items.filter((p) => p.category === filt);
    } else if (tab === 'sprinklers') {
      items = P.sprinklers;
    } else if (tab === 'dosing') {
      items = P.dosing;
    }

    // Sort items
    if (sort === 'price_low') items = items.slice().sort((a, b) => a.price - b.price);
    else if (sort === 'price_high') items = items.slice().sort((a, b) => b.price - a.price);
    else if (sort === 'rating') items = items.slice().sort((a, b) => b.rating - a.rating);

    // Shelf Category Pills
    let filterPills = '';
    if (tab === 'crops') {
      const pills = [
        ['all', t('mk_filter_all')],
        ['cereals', t('mk_filter_cereals')],
        ['vegetables', t('mk_filter_vegetables')],
        ['fruits_cash', t('mk_filter_fruits_cash')]
      ];
      filterPills = `<div class="filtrow mk-filters">${pills.map(([f, lbl]) =>
        `<button class="filt" type="button" data-mk-filter="${f}" aria-pressed="${filt === f}">${esc(lbl)}</button>`
      ).join('')}</div>`;
    }

    // Header & Back row
    const headHtml = `<div class="screen-top">`
      + `<div class="mk-title-row">`
      + `  <button class="btn secondary sm" type="button" data-back="1">${U.icons.back} <span>${esc(t('back_label'))}</span></button>`
      + `  <div class="mk-title-group">`
      + `    <h1 class="ptitle">${esc(t('mk_title'))}</h1>`
      + `    <small class="muted mk-subhead">${esc(t('mk_subtitle'))}</small>`
      + `  </div>`
      + `</div>`
      + `<button class="pill mk-cartbtn" type="button" data-mk-cart="1" aria-label="${esc(t('mk_cart'))}">`
      + `  ${MI('shopping_cart')} <span>${esc(t('mk_cart'))}</span>`
      + (tot.count ? `  <b class="mk-count">${tot.count}</b>` : '')
      + `</button>`
      + `</div>`;

    // Search and Sort Bar
    const searchHtml = `<div class="mk-search-bar">`
      + `  <div class="mk-search-input-wrap">`
      + `    ${MI('search')}`
      + `    <input class="mk-search-input" id="mk-search" type="search" placeholder="${esc(t('mk_search_placeholder'))}" value="${esc(U.mkQuery || '')}" autocomplete="off" />`
      + (q ? `    <button class="iconbtn sm mk-search-clear" type="button" data-mk-clear-search="1" aria-label="Clear">${MI('close')}</button>` : '')
      + `  </div>`
      + `  <select class="mk-sort-select" id="mk-sort" aria-label="Sort">`
      + `    <option value="recommended" ${sort === 'recommended' ? 'selected' : ''}>${esc(t('mk_sort_recommended'))}</option>`
      + `    <option value="price_low" ${sort === 'price_low' ? 'selected' : ''}>${esc(t('mk_sort_price_low'))}</option>`
      + `    <option value="price_high" ${sort === 'price_high' ? 'selected' : ''}>${esc(t('mk_sort_price_high'))}</option>`
      + `    <option value="rating" ${sort === 'rating' ? 'selected' : ''}>${esc(t('mk_sort_rating'))}</option>`
      + `  </select>`
      + `</div>`;

    // Guarantee delivery strip
    const stripHtml = `<div class="mk-strip">`
      + `  ${MI('local_shipping')} <span>${esc(t('mk_deliver_to'))} <b>${esc(pin)}</b> · ${esc(t('mk_cod'))} · ${esc(t('mk_free_over'))}</span>`
      + `</div>`;

    // 4 Shelves Segment Switcher
    const segHtml = `<div class="seg mk-seg" role="group" aria-label="${esc(t('mk_title'))}">`
      + `  <button class="segopt" type="button" data-mk-tab="crops" aria-pressed="${tab === 'crops'}">${MI('grass')} <span>${esc(t('mk_tab_crops'))} (12)</span></button>`
      + `  <button class="segopt" type="button" data-mk-tab="sprinklers" aria-pressed="${tab === 'sprinklers'}">${MI('shower')} <span>${esc(t('mk_tab_sprinklers'))} (5)</span></button>`
      + `  <button class="segopt" type="button" data-mk-tab="dosing" aria-pressed="${tab === 'dosing'}">${MI('speed')} <span>${esc(t('mk_tab_dosing'))} (5)</span></button>`
      + `  <button class="segopt" type="button" data-mk-tab="transport" aria-pressed="${tab === 'transport'}">${MI('local_shipping')} <span>${esc(t('mk_tab_transport'))}</span></button>`
      + `  <button class="segopt" type="button" data-mk-tab="orders" aria-pressed="${tab === 'orders'}">${MI('inventory_2')} <span>${esc(t('mk_tab_orders'))}${ords.length ? ` (${ords.length})` : ''}</span></button>`
      + `</div>`;

    // Content Body
    let bodyHtml = '';
    if (tab === 'transport') {
      bodyHtml = U.renderTransport();
    } else if (tab === 'orders') {
      bodyHtml = renderOrdersShelf(ords) + U.renderTransportOrders();
    } else if (!items.length) {
      bodyHtml = `<div class="mk-empty">`
        + `  <div class="empty-ic">${MI('search_off')}</div>`
        + `  <h3>${esc(t('mk_no_results'))}</h3>`
        + `  <button class="btn secondary sm" type="button" data-mk-clear-search="1">${MI('refresh')} <span>${esc(t('mk_clear_search'))}</span></button>`
        + `</div>`;
    } else {
      bodyHtml = filterPills + `<div class="mk-grid">${items.map((p) => card(p, c[p.id] || 0)).join('')}</div>`;
    }

    // Sticky Bottom Cart Bar
    const cartBarHtml = tot.count
      ? `<div class="mk-cartbar">`
        + `  <div class="mk-cartbar-info">`
        + `    <b>${tot.count} ${esc(t('mk_items'))}</b> · <span class="mk-cartbar-total">${inr(tot.total)}</span>`
        + `    <small class="muted">${tot.delivery === 0 ? esc(t('mk_free')) : '+ ₹99 ' + esc(t('mk_delivery'))}</small>`
        + `  </div>`
        + `  <button class="btn primary sm mk-cartbar-btn" type="button" data-mk-cart="1">`
        + `    ${MI('shopping_cart_checkout')} <span>${esc(t('mk_view_cart'))}</span>`
        + `  </button>`
        + `</div>`
      : '';

    return headHtml
      + (tab !== 'transport' && tab !== 'orders' ? `<section class="market-welcome"><div><span>${esc(t('mk_market_eyebrow'))}</span><h2>${esc(t('mk_market_headline'))}</h2><p>${esc(t('mk_market_intro'))}</p></div><span class="market-welcome-icon" aria-hidden="true">${MI('storefront')}</span></section>` : '')
      + segHtml
      + (tab !== 'transport' && tab !== 'orders' ? searchHtml + stripHtml : '')
      + bodyHtml
      + (tab === 'transport' ? '' : `<p class="hint mk-note">${esc(t('mk_note'))}</p>`)
      + (tab === 'transport' ? '' : cartBarHtml);
  };

  /* ---------- Slide-up Cart Sheet ---------- */
  const paintCart = () => {
    const tot = cartTotals();
    const pin = (U.profile && U.profile.pincode) || '';
    const name = load('enviroos.mkName', (U.profile && U.profile.farmerName) || '');
    const phone = load('enviroos.mkPhone', (U.profile && U.profile.phone) || '');
    const addr = load('enviroos.mkAddr', (U.profile && U.profile.village) || '');
    const pay = load('enviroos.mkPay', 'cod');

    const body = tot.lines.length
      ? `<div class="mk-cart-lines">`
        + tot.lines.map((l) =>
            `<div class="mk-line">`
            + `  <span class="mk-line-ic">${l.p.icon}</span>`
            + `  <div class="mk-line-copy">`
            + `    <strong>${esc(l.p.name)}</strong>`
            + `    <small class="muted">${esc(l.p.variety || l.p.sub)} · ${inr(l.p.price)}</small>`
            + `  </div>`
            + `  <div class="mk-step sm">`
            + `    <button type="button" data-mk-dec="${l.p.id}" aria-label="−">${MI('remove')}</button>`
            + `    <b>${l.q}</b>`
            + `    <button type="button" data-mk-inc="${l.p.id}" aria-label="+">${MI('add')}</button>`
            + `  </div>`
            + `  <b class="mk-line-total">${inr(l.q * l.p.price)}</b>`
            + `</div>`
          ).join('')
        + `</div>`
        + `<div class="mk-cart-summary">`
        + `  <div class="mk-sum"><span>${esc(t('mk_subtotal'))}</span><b>${inr(tot.sub)}</b></div>`
        + `  <div class="mk-sum"><span>${esc(t('mk_delivery'))}</span><b>${tot.delivery ? inr(tot.delivery) : `<span class="tag-free">${esc(t('mk_free'))}</span>`}</b></div>`
        + `  <div class="mk-sum total"><span>${esc(t('mk_total'))}</span><b>${inr(tot.total)}</b></div>`
        + `</div>`
        + `<div class="mk-checkout-form">`
        + `  <div class="seclabel2">${esc(t('mk_deliver_to'))}</div>`
        + `  <div class="field">`
        + `    <label for="mk-name">${esc(t('mk_farmer_name'))}</label>`
        + `    <input id="mk-name" type="text" placeholder="e.g. Ramesh Patel" value="${esc(name)}" />`
        + `  </div>`
        + `  <div class="grid2">`
        + `    <div class="field">`
        + `      <label for="mk-phone">${esc(t('mk_phone'))}</label>`
        + `      <input id="mk-phone" type="tel" inputmode="tel" maxlength="13" placeholder="98XXXXXXXX" value="${esc(phone)}" />`
        + `    </div>`
        + `    <div class="field">`
        + `      <label for="mk-pin">${esc(t('mk_pincode'))}</label>`
        + `      <input id="mk-pin" type="text" inputmode="numeric" maxlength="6" placeholder="342001" value="${esc(pin)}" />`
        + `    </div>`
        + `  </div>`
        + `  <div class="field">`
        + `    <label for="mk-addr">${esc(t('mk_farmer_addr'))}</label>`
        + `    <input id="mk-addr" type="text" placeholder="Village / Tehsil / Landmark" value="${esc(addr)}" />`
        + `  </div>`
        + `  <div class="seclabel2">${esc(t('mk_pay_method'))}</div>`
        + `  <div class="mk-pay-options">`
        + `    <label class="mk-pay-opt"><input type="radio" name="mk-pay" value="cod" ${pay === 'cod' ? 'checked' : ''} /> <span>${MI('payments')} ${esc(t('mk_pay_cod'))}</span></label>`
        + `    <label class="mk-pay-opt"><input type="radio" name="mk-pay" value="upi" ${pay === 'upi' ? 'checked' : ''} /> <span>${MI('qr_code')} ${esc(t('mk_pay_upi'))}</span></label>`
        + `    <label class="mk-pay-opt"><input type="radio" name="mk-pay" value="kisan" ${pay === 'kisan' ? 'checked' : ''} /> <span>${MI('credit_card')} ${esc(t('mk_pay_kisan'))}</span></label>`
        + `  </div>`
        + `  <button class="btn primary block lg mk-submit-order" type="button" data-mk-order="1">`
        + `    ${MI('check_circle')} <span>${esc(t('mk_place_order'))} (${inr(tot.total)})</span>`
        + `  </button>`
        + `</div>`
      : `<div class="mk-empty">`
        + `  <div class="empty-ic">${MI('shopping_cart')}</div>`
        + `  <p>${esc(t('mk_empty'))}</p>`
        + `  <button class="btn primary sm" type="button" data-close-sheet="1">${MI('storefront')} <span>${esc(t('mk_shop_now'))}</span></button>`
        + `</div>`;

    U.openSheet(
      `<div class="sheethead">`
      + `  <span class="stic big" data-tone="good" aria-hidden="true">${MI('shopping_cart')}</span>`
      + `  <div>`
      + `    <div class="stcond">${esc(t('mk_cart'))}</div>`
      + `    <div class="sheetval">${tot.count} ${esc(t('mk_items'))} · ${inr(tot.total)}</div>`
      + `  </div>`
      + `  <span class="flexsp"></span>`
      + `  <button class="iconbtn dark" type="button" data-close-sheet="1" aria-label="${esc(t('close_label'))}">${U.icons.close}</button>`
      + `</div>`
      + `<div class="mk-cart">${body}</div>`
    );
    U.mkCartOpen = true;
  };

  const refresh = () => {
    if (U.route === 'market') U.render();
    if (U.mkCartOpen && $('sheet') && $('sheet').classList.contains('open')) paintCart();
  };

  /* ---------- Order Placement ---------- */
  const placeOrder = () => {
    const tot = cartTotals();
    if (!tot.lines.length) return;

    const name = (($('mk-name') || {}).value || '').trim();
    const pin = (($('mk-pin') || {}).value || '').trim();
    const phone = (($('mk-phone') || {}).value || '').replace(/[^\d+]/g, '');
    const addr = (($('mk-addr') || {}).value || '').trim();
    const payEl = document.querySelector('input[name="mk-pay"]:checked');
    const pay = payEl ? payEl.value : 'cod';

    if (!/^\d{6}$/.test(pin)) { U.toast(t('mk_err_pin')); return; }
    if (phone.replace(/\D/g, '').length < 10) { U.toast(t('mk_err_phone')); return; }

    save('enviroos.mkName', name);
    save('enviroos.mkPhone', phone);
    save('enviroos.mkAddr', addr);
    save('enviroos.mkPay', pay);

    const id = 'EO-' + Date.now().toString(36).toUpperCase().slice(-6);
    const list = orders();
    list.unshift({
      id,
      at: Date.now(),
      name,
      phone,
      pincode: pin,
      address: addr,
      payment: pay,
      items: tot.lines.map((l) => [l.p.id, l.q, l.p.price]),
      total: tot.total,
      status: 'requested'
    });
    save('enviroos.orders', list.slice(0, 30));
    save('enviroos.cart', {});

    U.mkCartOpen = false;
    U.closeSheet();
    U.toast(`${t('mk_order_done')}: #${id}`);

    U.mkTab = 'orders';
    if (U.route === 'market') U.render(); else U.go('market');
  };

  const cancelOrder = (orderId) => {
    const list = orders().filter((o) => o.id !== orderId);
    save('enviroos.orders', list);
    U.toast(t('mk_cancelled'));
    if (U.route === 'market') U.render();
  };

  /* ---------- Event Handlers ---------- */
  document.addEventListener('click', (e) => {
    const el = (sel) => e.target.closest(sel);
    let n;

    if ((n = el('[data-mk-open]'))) {
      U.mkTab = n.dataset.mkOpen;
      U.mkFilter = 'all';
      U.go('market');
      return;
    }

    if ((n = el('[data-mk-tab]'))) {
      U.mkTab = n.dataset.mkTab;
      U.render();
      return;
    }

    if ((n = el('[data-mk-filter]'))) {
      U.mkFilter = n.dataset.mkFilter;
      U.render();
      return;
    }

    if ((n = el('[data-mk-spec]'))) {
      const pid = n.dataset.mkSpec;
      const p = findProduct(pid);
      if (p) openSpecSheet(p);
      return;
    }

    if ((n = el('[data-mk-inc]'))) {
      const id = n.dataset.mkInc;
      const had = cart()[id] || 0;
      setQty(id, had + 1);
      if (!had) {
        const p = findProduct(id);
        if (p) U.toast(`${t('mk_added')}: ${p.name}`);
      }
      refresh();
      return;
    }

    if ((n = el('[data-mk-dec]'))) {
      const id = n.dataset.mkDec;
      setQty(id, (cart()[id] || 0) - 1);
      refresh();
      return;
    }

    if (el('[data-mk-clear-search]')) {
      U.mkQuery = '';
      const inp = $('mk-search');
      if (inp) inp.value = '';
      U.render();
      return;
    }

    if ((n = el('[data-mk-cancel]'))) {
      cancelOrder(n.dataset.mkCancel);
      return;
    }

    if (el('[data-mk-cart]')) {
      paintCart();
      return;
    }

    if (el('[data-mk-order]')) {
      placeOrder();
      return;
    }

    if (el('[data-close-sheet]') || el('#scrim')) {
      U.mkCartOpen = false;
    }
  });

  // Search and Sort input events
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'mk-search') {
      U.mkQuery = e.target.value;
      if (U.route === 'market') U.render();
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'mk-sort') {
      U.mkSort = e.target.value;
      if (U.route === 'market') U.render();
    }
  });

  U.openMarket = (tab) => {
    U.mkTab = tab || 'crops';
    U.mkFilter = 'all';
    U.go('market');
  };

  U.marketCartCount = () => cartTotals().count;
})();
