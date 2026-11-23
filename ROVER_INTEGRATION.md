# EnviroOS Rover integration

The app in `/home/reyansh/Downloads/my-project` bundles the full mission control
frontend under `public/rover/`. Rover keeps that document alive during sensor
updates and tab switches. Leaving the tab releases manual/automatic steering and
closes camera streams; returning resumes the views without losing the draft.

Included features: route drawing and waypoints, timed stops, no-go areas, map
checks, mission import/export, live camera and obstacle grid, manual hold-to-drive,
automatic QR steering, named QR stops, printable PNG/A4 PDF cards, trip replay,
GNSS status, and local sunset. Existing payload dosing remains below the planner.

## Connection to the existing ESP32

EnviroOS → authenticated Pi API on port 8088 → ROS `/esp32/manual`, enable and
hold services → `bridge.py` → `usb_serial_link.py` → `EnviroRoverSerial.ino`.
The current serial firmware uses the same 28-byte CMD1 and 40-byte TEL1 packets
and CRC as the existing bridge. No firmware reflash is required for this UI change.
Motor commands are never sent to the farm app's demo rover controller.

The webcam/QR/archive service remains on port 8091. The Pi API now relays
`/api/qr/cards`, `/api/qr/card/<payload>/png|pdf`, `/api/history/trips`, and
`/api/history/trips/<id>`. These relays require the existing web token and origin
allowlist; credentials are sent in headers, never in image/download URLs.

## Start on this Pi

The USB serial bridge and webcam service were running when integrated. Port 8088
was offline, and this session has no Docker socket access. From a terminal with
Docker access run:

```bash
cd /home/reyansh/workspace/image-processing/esp32_nav2
sudo bash start_control_server.sh
```

This installs the current web API/frontend into the existing `pi-navigation`
container and starts the control API when it is offline. If an older control API
is already running, restart that API process after installing the files. The
existing ROS stack and motor bridge must also be running.

Open the app, choose Rover → Connect rover, and enter `http://127.0.0.1:8088`
(on this Pi) and the existing token from `~/.config/enviro-rover/web-token`.
For another computer use the Pi's reachable address and allow the app's exact
origin through `ROVER_WEB_ORIGINS`. HTTPS apps require an HTTPS Pi endpoint.
The app sign-in password is separate from the Pi API token.

Use `npm run dev` in the app directory, or serve `dist/` after `npm run build`.
Default dev (5173), preview (4173), and local dashboard (8091) origins are included
in the startup script. A hosted app origin must be added explicitly.

## Checks

- `npm run build` in the app directory.
- `node checks/rover-integration.cjs` in the app directory with preview running
  on `http://127.0.0.1:5186` (or set `APP_URL`). Uses a simulated backend and camera;
  it never drives physical hardware.
- `.venv/bin/python -m unittest discover -s esp32_nav2/tests -p test_web.py -v`
  from the image-processing directory checks HTTP auth, CORS, map validation,
  QR create/download routing, and trip archive routing.

The full pre-existing suite also needs PyYAML and updated ROS test stubs for
`sensor_msgs`; those environment/test-fixture failures are separate from the 19
passing HTTP/map tests. Physical drive, camera and QR behavior must be verified
once the real control API is running.

## QR scanning and EnviroOS theme update

QR decoding now tries both OpenCV decoders, contrast enhancement, an enlarged
view, and perspective-corrected crops for located cards. Direction aliases are
exact, and named-card payloads continue to use the Pi's existing card library.
All decoded cards are returned, so conflicting directions still pause motion.
Seven generated-image tests cover directions, a named stop, low contrast/blur,
rotation, perspective, multiple cards, and a scene with no card. No model was
trained and no new inference weights are required.

Start keeps the automatic scanning session armed and its webcam running after
each action. Forward/reverse remain three-second movements. An explicit Stop
ends the session; missing connections/telemetry, hidden app views and conflicting
cards still pause motion. Camera/steering recover without requiring another
Start for an ordinary transient interruption.

The embedded planner and QR library use EnviroOS colors, fonts, rounded cards,
large controls, and the app's current light/dark theme. Theme changes propagate
without reloading the planner or discarding a mission.

To apply a subsequent backend update while the API is running:

```bash
sudo bash start_control_server.sh --restart
systemctl --user restart enviro-dashboard.service
```

The restart option requests Stop through the old API before replacing its
process. Firmware and the ESP32 serial bridge stay in place.
