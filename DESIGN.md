# Design — EnviroOS Field-First Tactile Daylight

Reworked from the ground up on top of the agricultural logic layer (`js/crop-data.js`, `js/agri.js`, `js/voice.js`, `js/i18n.js`, `js/weather-live.js`, `js/mqtt-provider.js`, `js/mock.js`).

## 1. Visual Aesthetic & Daylight Craft
- **Field-First Tactile Daylight**: Warm organic daylight background (`#F4F7EF`), crisp elevated white cards (`#FFFFFF`), warm limestone secondary surfaces (`#EBF1E3`), deep forest ink (`#0C1509`, contrast > 7:1), and semantic ICAR status badges (`good`, `warn`, `bad`, `water`).
- **Deep Canopy Dark Mode & Liquid Glass**: Full dark theme (`#090E06` ground, `#121B0D` cards, luminous leaf `#4ADE80`) and optional frosted glass (`body.glass`).
- **Oversized Touch Targets**: Every interactive button, chip, segment, and stepper is $\ge 48\text{px}$ (primary CTAs $56\text{px}\text{–}62\text{px}$) for one-handed outdoor use.

## 2. Shell, Global Voice Bar & 7-Tab Navigation
- **Streamlined Sticky Header**:
  - Interactive Brand & Farm Summary button (`#btn-farm`) displaying active crop emoji, crop name, growth stage, and pincode (1-tap opens Farm Profile).
  - Live Sensor Node pill (`#btn-node`), Language pill (`#btn-lang`), Alerts bell with badge (`#btn-alerts`), Command search (`#btn-cmd` / `Ctrl+K`), and Settings (`#btn-settings`).
- **Global Voice / Audio Status Bar (`#voicebar`)**:
  - Floating bar with live animated waveform and a 1-tap **Stop Audio** / **End Call** button whenever TTS advice is playing or a live Agri call is running in the background.
- **7 First-Class Navigation Tabs** (Bottom bar on mobile, left rail on desktop $\ge 1080\text{px}$):
  - `Home`, `Soil`, `Crop`, `Weather`, `Agri` (highlighted voice assistant tab), `Pump` (with live running indicator dot), and `History`.

## 3. Screen-by-Screen Architecture
- **Home (`U.vHome`) — Action-First Streamlined**:
  - Eliminates redundant KPI/alert/status duplication.
  - **Farm & Node Banner**: Active crop, stage badge, farm size, pincode, 1-tap Edit, and inline 2-node switcher (`Node 1: NPK + Motor` vs `Node 2: Basic Sensors`).
  - **Hero Verdict & Agri Daily Advice**: Overall field health banner (`Farm looks good` or `N things to check` with direct issue pills), Agri's plain-words daily advice, dual primary CTAs (**Listen / Stop Advice** + **Ask Agri**), and latest voice Q&A card with source links.
  - **Unified 4-Pillar Farm Signals Grid (`Water`, `Heat`, `Soil`, `Weather`)**: Self-contained cards with ICAR status badges, tabular readings, inline mini-gauges (moisture zone bar, temperature bar, NPK/pH mini-pills, pressure/rain), and self-reading Evidence Sheets.
  - **Inline Live Pump Controller**: Live watering status, mode badge, moisture hysteresis summary, and 1-tap Start/Stop + Settings controls.
- **Soil (`U.vSoil`)**:
  - Hardware capability notice with 1-tap switch to Node 1 when Node 2 (no NPK) is active.
  - Moisture hero gauge with crop target zone overlay + 7-day sparkline.
  - Soil pH spectrum meter (`4.0–9.0`) with crop ideal band and live marker pin.
  - NPK (`N`, `P`, `K`) target range bars comparing live `mg/kg` against ICAR crop thresholds + plain-words fertilizer guidance.
- **Crop (`U.vCrop`)**:
  - Interactive 5-stage crop journey stepper (1-tap stage update) + GDD progress gauge.
  - 7-day Daily GDD & Min/Max Temperature bar chart (`tempHistory` + `perDay`).
  - Crop Ideal Conditions reference grid comparing optimal targets against live field readings.
- **Weather (`U.vWeather`)**:
  - Location & Rain Probability hero card with wind speed (`wttr.in` / `Open-Meteo` online forecast or offline pressure-trend field estimate).
  - 4-card microclimate grid: Temperature, Sunlight (`k lux`), Air Dryness & Evaporation (`RH%` + Tetens `VPD kPa`), and Barometric Pressure trend + sparkline.
  - Scrollable **Hourly Forecast** strip (`Next hours`) and **3-Day Forecast** table (`Next days`).
- **Pump & Robot (`U.vRobot`)**:
  - Live pump controller with health/fault banner, Auto/Manual mode toggle, visual moisture hysteresis bar, 1-tap Crop Ideal preset button, tactile `- / +` numeric steppers, 3×3 directional robot drive pad with speed slider, and timestamped event log.
- **Agri Voice (`U.vAgri`)**:
  - Immersive voice stage with live field context pills, reactive multi-ring audio halo (`--lv`), 118px tap-to-talk orb, streaming captions, camera crop inspection (`Show crop`), wake-word toggle (`Hey Agri`), 1-tap question chips, and persistent chat log with grounding source links and per-reply TTS replay.
- **History (`U.vHistory`)**:
  - Filterable 7-day trend cards with min/max stats, trend words, and SVG area sparklines + Supabase cloud readings table.
