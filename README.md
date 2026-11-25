# enviroos

Dev: `npm install && npm run dev` · Build: `npm run build` (outputs `dist/`) · Preview: `npm run preview`

### Open the app on another device

Run `npm run dev` on the Raspberry Pi. On a device connected to the same
network, open the **Network** URL printed by Vite. If you need the Pi’s address,
run `hostname -I` and use its LAN address with port 5173.

The Rover tab defaults to the Pi API through the same app URL. Start the Pi
control service on port 8088 and enter its existing web API token on each
browser. This development setup is intended for a trusted local network.


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


The attached FarmRover Expanded sketch uses the **device01** MQTT topic by
default. Open **Rover → Settings → ESP32 network readings** to enter a custom
topic ID or use the one reported by the Pi. The Rover tab receives readings
without a Pi connection. Its refresh button sends only `DATA`. The expanded
sketch reports raw water and temperature inputs, ultrasonic distance, pump
and dispenser state, servo angles, mission phase, and configured speed.
Its NPK servo angle reports position. The sketch has no NPK sensor readings.
For Wi-Fi setup on the expanded sketch, join its open `FarmRover-Setup` network
and use the portal.

### FarmRover direct Wi-Fi controls

With the Expanded sketch and fresh MQTT readings, the Rover tab uses the existing steering pad and speed slider for **Wi-Fi control**. Extra firmware actions are under **Dispensing → ESP32 tools**. It uses the same HiveMQ connection and device ID
as the readings panel. Hold a direction to drive and release to send Stop.
In direct Wi-Fi mode, **Automatic → Start firmware mission** runs the ESP32’s
built-in routine. The pump, dispenser, probe-arm controls and sensor tests
use the commands already supported by the sketch. Status messages come
from the firmware. The pump command operates the rover's relay; Enviro
Advanced irrigation is a separate integration.

The direct controls are available with the Pi disconnected or when the Pi
provides the camera without an active or ready motor link. The Pi remains
the source for the camera and QR route controls. The sketch does not
publish measured wheel travel, heading or NPK concentrations.


### QR steering over MQTT

With the Pi camera connected and the direct MQTT motor link active, open
**Rover → Automatic → Start QR steering**. A movement card runs only its
selected direction for the number in the card’s **Wait in seconds** field.
Use 1–25 seconds for movement cards. A zero-second movement card does
not move the rover. Wait cards pause without driving, and Stop cards
stop and disarm QR steering. The firmware’s built-in routine is still
available from **Start firmware mission**.
