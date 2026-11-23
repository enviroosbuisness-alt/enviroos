# enviroos

Dev: `npm install && npm run dev` · Build: `npm run build` (outputs `dist/`) · Preview: `npm run preview`

Second Device: choose Connect, then switch on the existing ESP sensor node
`149853470968`. The app confirms non-retained live sensor messages, remembers
that node in this browser, and reconnects automatically on later visits or a
broker interruption. It keeps a separate read-only MQTT connection even when
the main dashboard uses demo data. Pause connection does not power down the ESP;
it preserves the remembered device and waits for Resume.

Rover navigation is available only when the signed-in main model is Rover.
Changing to Enviro Basic/Pro removes the tab and the embedded rover document.
The rover page and its QR library follow the app's light/dark colors and fonts.

Browser checks: `node checks/second-device.cjs` and
`APP_URL=http://127.0.0.1:5173 node checks/rover-integration.cjs` with the local
app running. The second-device check simulates MQTT frames and checks pairing,
persistence, stale/offline data, reconnection, model switching and theme sync.

### Agri AI hands-free mode

Tap the standby badge to turn the feature on or off. Grant browser
microphone access and install the offline speech pack if offered. Configure
spoken replies and view the wake language in **Settings → Hands-free mode**.
The settings show the actual wake phrase available on the device. The listener
uses a supported on-device pack only while the app is open and visible. Some
devices offer the English “Hey Agri” fallback. If no offline pack is available,
use **Tap to talk** or explicitly start the short wake test in the popup.
These bounded mic sessions may use the browser's speech service.

The top popup stays on the current screen. Completed questions use the same
Agri AI answer service and chat history as the Agri tab. Standby audio is not
sent to that service, and the app stores no raw audio. Spoken replies can be
disabled, and **Stop speaking** ends playback so the mic can resume. The
popup answers questions and has no equipment controls. Background and
locked-screen wake detection are unavailable in this web app.

### Local API configuration

Copy `.env.example` to `.env.local` and fill in the optional Gemini and
Google Maps keys. Vite embeds these values in the browser bundle, so use
restricted keys for local development and a server proxy for private
production credentials. Keep `.env.local` and generated builds out of Git.
