/* EnviroOS — Gemini credentials.
 * WARNING: this key ships inside the app, so anyone with the app files can
 * read it. In the Google Cloud / AI Studio console, restrict this key:
 *   - API restrictions: "Generative Language API" only
 *   - Application restrictions: your Cloudflare Tunnel hostname
 * Rotate the key here any time it leaks. For production, move it behind
 * your own tiny server proxy instead of embedding it. */

'use strict';

window.EnviroOS = window.EnviroOS || {};

(function () {
  const E = EnviroOS;

  E.geminiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

  // Google Maps/Places key: real addresses + map links for Agri.
  // Same warning as above — restrict it (Places API only + your tunnel
  // hostname) and rotate it if it ever leaks outside this project.
  E.mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  // Live (realtime speech) model + Agri's voice.
  // Set to 'Fenrir': deep, confident, manly American male voice.
  E.geminiModel = 'gemini-3.1-flash-live-preview';
  try {
    E.geminiVoice = localStorage.getItem('enviroos.geminiVoice') || 'Fenrir';
  } catch (_) {
    E.geminiVoice = 'Fenrir';
  }

  try {
    if (!E.geminiKey || E.geminiKey.length < 20) console.warn('[EnviroOS] Gemini key missing — Agri uses offline answers.');
  } catch (_) { /* ignore */ }
})();
