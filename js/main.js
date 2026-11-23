import './responsive-layout.js';
import 'material-symbols/outlined.css';

// EnviroOS — Vite entry. Bundles the classic side-effect scripts in the
// exact order index.html used to load them (each file attaches to
// window.EnviroOS via IIFE; app.js boots on import, after DOM is parsed
// because module scripts are deferred).
import './crop-data.js';
import './agri.js';
import './mock.js';
import './mqtt.js';
import './mqtt-provider.js';
import './supabase.js';
import './gemini-config.js';
import './gemini-live.js';
import './weather-live.js';
import './voice.js';
import './i18n.js';
import './ui-core.js';
import './ui-components.js';
import './ui-screens.js';
import './ui-agri.js';
import './hands-free-ui.js';
import './ui-market.js';

import './rover-integration.js';

import './second-device.js';

import './transport.js';
