/* EnviroOS — LIVE WEATHER layer.
 * Primary: Free keyless wttr.in API with direct Indian PIN code support.
 * Fallback: Open-Meteo geocoding & current weather endpoint.
 * Offline / failed: Conservative field estimate from local pressure trend. */

'use strict';

window.EnviroOS = window.EnviroOS || {};

(function () {
  const E = EnviroOS;
  const CACHE_KEY = 'enviroos.forecast';
  const CACHE_MS = 30 * 60 * 1000; // 30 minutes cache

  function withTimeout(ms) {
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), ms);
    return { signal: c.signal, done: () => clearTimeout(id) };
  }

  function codeBand(code, precip) {
    if (code == null) return 'clear';
    if (code === 0 || code === 1 || code === 113) return 'clear';
    if (code === 2 || code === 116) return 'partly';
    if (code === 3 || code === 45 || code === 48 || code === 119 || code === 122 || code === 143 || code === 248) return 'cloud';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 263 && code <= 359)) return 'rain';
    if (code >= 95 || code >= 386) return 'storm';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86 || (code >= 368 && code <= 377)) return 'rain';
    return (precip && precip > 0.5) ? 'rain' : 'clear';
  }

  function descToBand(desc) {
    const d = (desc || '').toLowerCase();
    if (d.includes('thunder') || d.includes('storm')) return 'storm';
    if (d.includes('rain') || d.includes('drizzle') || d.includes('shower')) return 'rain';
    if (d.includes('cloud') || d.includes('overcast') || d.includes('fog') || d.includes('mist') || d.includes('haze')) return 'cloud';
    if (d.includes('partly')) return 'partly';
    return 'clear';
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (!c || (Date.now() - c.at) > CACHE_MS) return null;
      return c.data;
    } catch (_) { return null; }
  }

  function saveCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch (_) { /* ignore */ }
  }

  // ---- Field estimate (offline fallback) ----
  function fieldEstimate(snap, trendPer3h) {
    const humid = snap.humidity != null && snap.humidity >= 60;
    const fallingFast = trendPer3h <= -2, falling = trendPer3h <= -0.8 && trendPer3h > -2;
    const low = snap.pressureHpa < 1005;
    let prob, band;
    if (fallingFast && (humid || low)) { prob = 65; band = 'rain'; }
    else if (fallingFast || (falling && humid)) { prob = 45; band = 'rain'; }
    else if (falling) { prob = 20; band = 'cloud'; }
    else if (trendPer3h >= 0.8) { prob = 0; band = 'clear'; }
    else { prob = humid ? 15 : 0; band = humid ? 'cloud' : 'clear'; }
    return { source: 'estimate', prob, band };
  }

  // Direct PIN code weather fetch from wttr.in
  async function fetchWttrIn(pincode) {
    const pin = (pincode || '342001').replace(/[^0-9]/g, '');
    const t = withTimeout(7000);
    try {
      const res = await fetch(`https://wttr.in/${pin}?format=j1`, { signal: t.signal });
      if (!res.ok) return null;
      const j = await res.json();
      if (!j.current_condition || !j.current_condition.length) return null;

      const cur = j.current_condition[0];
      const area = (j.nearest_area && j.nearest_area[0]) || {};
      const areaName = (area.areaName && area.areaName[0] && area.areaName[0].value) || '';
      const region = (area.region && area.region[0] && area.region[0].value) || '';
      const placeName = [areaName, region, pin].filter(Boolean).join(', ');

      const curPrecip = parseFloat(cur.precipMM || 0);
      const curDesc = (cur.weatherDesc && cur.weatherDesc[0] && cur.weatherDesc[0].value) || 'Clear';
      const curBand = descToBand(curDesc);

      // Hourly data (from today's hourly segments)
      const hourly = [];
      const today = (j.weather && j.weather[0]) || {};
      const hList = today.hourly || [];
      const nowH = new Date().getHours();

      for (let i = 0; i < hList.length; i++) {
        const item = hList[i];
        const hTime = parseInt(item.time, 10) / 100; // e.g. 300 -> 3, 1200 -> 12
        const pMm = parseFloat(item.precipMM || 0);
        let rainChance = parseInt(item.chanceofrain || 0, 10);
        const hDesc = (item.weatherDesc && item.weatherDesc[0] && item.weatherDesc[0].value) || 'Clear';
        const band = descToBand(hDesc);

        // IMD / Google standard: if 0.0mm rain and clear sky, calibrate to 0%
        if (pMm === 0 && (band === 'clear' || band === 'partly') && rainChance <= 20) {
          rainChance = 0;
        }

        hourly.push({
          time: `${String(hTime).padStart(2, '0')}:00`,
          tempC: parseFloat(item.tempC || 0),
          precip: pMm,
          prob: rainChance,
          band: band
        });
      }

      // Daily data
      const daily = (j.weather || []).slice(0, 3).map((d) => {
        const pSum = parseFloat(d.totalSnow_cm || 0) + ((d.hourly || []).reduce((acc, h) => acc + parseFloat(h.precipMM || 0), 0) / 8);
        const maxProb = Math.max(...(d.hourly || []).map((h) => parseInt(h.chanceofrain || 0, 10)));
        const noonDesc = (d.hourly && d.hourly[4] && d.hourly[4].weatherDesc && d.hourly[4].weatherDesc[0] && d.hourly[4].weatherDesc[0].value) || 'Clear';
        let calibratedProb = maxProb;
        if (pSum < 0.2 && calibratedProb <= 20) calibratedProb = 0;

        return {
          date: d.date,
          tmax: parseFloat(d.maxtempC || 0),
          tmin: parseFloat(d.mintempC || 0),
          precip: Math.round(pSum * 10) / 10,
          prob: calibratedProb,
          band: descToBand(noonDesc)
        };
      });

      const currentProb = hourly[0] ? hourly[0].prob : (curPrecip > 0 ? 80 : 0);

      return {
        source: 'online',
        place: placeName,
        updatedAt: Date.now(),
        current: {
          tempC: parseFloat(cur.temp_C || 0),
          humidity: parseFloat(cur.humidity || 0),
          precip: curPrecip,
          prob: currentProb,
          band: curBand,
          windSpeed: parseFloat(cur.windspeedKmph || 0),
          desc: curDesc
        },
        hourly: hourly.slice(0, 8),
        daily
      };
    } catch (_) { return null; }
    finally { t.done(); }
  }

  // Open-Meteo Fallback Geocoding
  async function geocodeOpenMeteo(pincode) {
    let q = pincode;
    const pinMatch = String(pincode).match(/\b(\d{6})\b/);
    if (pinMatch) {
      try {
        const pRes = await fetch(`https://api.postalpincode.in/pincode/${pinMatch[1]}`);
        const pData = await pRes.json();
        if (pData && pData[0] && pData[0].Status === 'Success' && pData[0].PostOffice) {
          const po = pData[0].PostOffice[0];
          q = `${po.District || po.Block || po.Region}, ${po.State}`;
        }
      } catch (e) {}
    }

    q = encodeURIComponent(q);
    const t = withTimeout(6000);
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`, { signal: t.signal });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.results || !j.results.length) return null;
      const g = j.results[0];
      return { lat: g.latitude, lon: g.longitude, name: g.name, admin: g.admin1 || '' };
    } catch (_) { return null; }
    finally { t.done(); }
  }

  // Open-Meteo Forecast
  async function fetchOpenMeteo(pincode) {
    const geo = await geocodeOpenMeteo(pincode);
    if (!geo) return null;

    const t = withTimeout(7000);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
        `&current=temperature_2m,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m` +
        `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum` +
        `&timezone=auto&forecast_days=3`;
      const r = await fetch(url, { signal: t.signal });
      if (!r.ok) return null;
      const fc = await r.json();
      if (!fc || !fc.hourly) return null;

      const cur = fc.current || {};
      const curWCode = cur.weather_code != null ? cur.weather_code : 0;
      const curPrecip = cur.precipitation != null ? cur.precipitation : 0;
      const curProb = (curPrecip > 0 || curWCode >= 51)
        ? Math.max(60, (fc.hourly.precipitation_probability && fc.hourly.precipitation_probability[0]) || 0)
        : ((curPrecip === 0 && curWCode <= 2) ? 0 : ((fc.hourly.precipitation_probability && fc.hourly.precipitation_probability[0]) || 0));

      const nowMs = Date.now();
      const hourly = [];
      const hTime = fc.hourly.time || [];
      const hTemp = fc.hourly.temperature_2m || [];
      const hProb = fc.hourly.precipitation_probability || [];
      const hPrecip = fc.hourly.precipitation || [];
      const hWCode = fc.hourly.weather_code || fc.hourly.weathercode || [];

      for (let i = 0; i < hTime.length; i++) {
        const tMs = new Date(hTime[i]).getTime();
        if (tMs < nowMs - 3600 * 1000) continue;
        const pAmt = hPrecip[i] != null ? hPrecip[i] : 0;
        const wCode = hWCode[i] != null ? hWCode[i] : 0;
        let prob = hProb[i] != null ? hProb[i] : 0;
        if ((pAmt == null || pAmt < 0.1) && wCode <= 2) prob = 0;
        else if (wCode >= 51 || pAmt >= 0.5) prob = Math.max(prob, 60);

        hourly.push({
          time: hTime[i],
          tempC: hTemp[i],
          precip: pAmt,
          prob: prob,
          band: codeBand(wCode, pAmt)
        });
        if (hourly.length >= 8) break;
      }

      const daily = (fc.daily.time || []).map((d, i) => {
        const sum = fc.daily.precipitation_sum ? fc.daily.precipitation_sum[i] : 0;
        const code = fc.daily.weather_code ? fc.daily.weather_code[i] : (fc.daily.weathercode ? fc.daily.weathercode[i] : 0);
        let prob = fc.daily.precipitation_probability_max ? fc.daily.precipitation_probability_max[i] : 0;
        if ((sum == null || sum < 0.2) && code <= 2) prob = 0;
        return {
          date: d,
          tmax: fc.daily.temperature_2m_max[i],
          tmin: fc.daily.temperature_2m_min[i],
          precip: sum,
          prob: prob,
          band: codeBand(code, sum)
        };
      });

      return {
        source: 'online',
        place: `${geo.name}${geo.admin ? ', ' + geo.admin : ''}`,
        updatedAt: Date.now(),
        current: {
          tempC: cur.temperature_2m,
          humidity: cur.relative_humidity_2m,
          precip: curPrecip,
          prob: curProb,
          band: codeBand(curWCode, curPrecip),
          windSpeed: cur.wind_speed_10m || 0
        },
        hourly,
        daily
      };
    } catch (_) { return null; }
    finally { t.done(); }
  }

  async function getOutlook(profile, snap, analysis) {
    const pincode = profile.pincode || '342001';
    const trend = analysis ? analysis.weather.trend.changeHpa : 0;
    const est = fieldEstimate(snap, trend);

    // Reuse fresh cache without hitting network
    const cached = loadCache();
    if (cached && cached.pincode === pincode) {
      return Object.assign({}, cached, { estimate: est });
    }

    if (!navigator.onLine) {
      return { source: 'estimate', pincode, estimate: est, updatedAt: Date.now() };
    }

    // Try wttr.in first (exact Indian PIN support)
    let res = await fetchWttrIn(pincode);

    // If wttr.in fails or times out, fallback to Open-Meteo
    if (!res || !res.hourly || !res.hourly.length) {
      res = await fetchOpenMeteo(pincode);
    }

    if (!res) {
      return { source: 'estimate', pincode, estimate: est, updatedAt: Date.now(), geoFailed: true };
    }

    res.pincode = pincode;
    res.estimate = est;
    saveCache(res);
    return res;
  }

  E.liveWeather = { getOutlook, codeBand, descToBand, fieldEstimate };
})();
