/* EnviroOS keynote renderer — true 30fps, ultra-fast parallel RAM-disk + energetic stock music.
 * Every frame is a pure function of time (window.seek(t)), driving the real
 * EnviroOS web app inside the phone chassis iframe at http://localhost:5173/video/keynote.html.
 *
 * Speed optimizations (zero loss in smoothness or visual fidelity):
 *   1. 8 parallel headless Chrome workers (using all CPU threads)
 *   2. /dev/shm tmpfs RAM-disk frame buffering (zero SSD I/O bottleneck)
 *   3. Async buffered writes + CDP optimizeForSpeed JPEG capture (quality 92)
 *   4. Multi-threaded ultrafast H.264 encode @ CRF 16 (visually lossless) + energetic stock audio
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const FPS = 30, DURATION = 120, W = 1920, H = 1080;
const TOTAL = FPS * DURATION;
const WORKERS = Math.min(8, os.cpus().length);
const ROOT = __dirname;
// Use /dev/shm RAM disk if available for zero disk I/O latency
const SHM_BASE = fs.existsSync('/dev/shm') ? '/dev/shm' : ROOT;
const FRAMES = path.join(SHM_BASE, 'enviroos_keynote_frames');
const MUSIC = path.join(ROOT, 'track_120s.mp3');
const IS_ALT = process.argv.includes('--alt');
const OUT = path.join(ROOT, '..', IS_ALT ? 'EnviroOS_Keynote_Alt.mp4' : 'EnviroOS_Keynote.mp4');
const URL = 'http://localhost:5173/video/keynote.html';
const CHROME = '/usr/bin/google-chrome';

async function openPage() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      `--window-size=${W},${H}`
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('enviroos.lang', 'en');
    localStorage.setItem('enviroos.theme', 'light');
    localStorage.setItem('enviroos.source', 'demo');
    localStorage.setItem('enviroos.glass', '0');
    localStorage.setItem('enviroos.wake', '0');
    localStorage.setItem('enviroos.pump', JSON.stringify({
      mode: 'auto', startBelow: 20, stopAbove: 90, speed: 150,
      log: [
        { t: Date.now() - 3600000, time: '08:15 AM', msg: 'Auto started at 18% moisture' },
        { t: Date.now() - 1800000, time: '08:42 AM', msg: 'Auto stopped at 62% moisture' }
      ]
    }));
    localStorage.setItem('enviroos.profile', JSON.stringify({
      pincode: '342001',
      cropId: 'bajra',
      stage: 'vegetative',
      sizeValue: 2.5,
      sizeUnit: 'acres',
      onboarded: true,
      node1: { cropId: 'bajra', stage: 'vegetative', sizeValue: 2.5 },
      node2: { cropId: 'wheat', stage: 'vegetative', sizeValue: 2.0 }
    }));
    localStorage.setItem('enviroos.agri.sessions.v1', JSON.stringify([
      {
        id: 'chat_demo_1',
        title: 'Wheat leaf yellowing check',
        createdAt: Date.now() - 7200000,
        updatedAt: Date.now() - 3600000,
        messages: [
          { who: 'me', text: 'Why are my lower wheat leaves turning yellow?', ts: Date.now() - 3650000 },
          { who: 'agri', text: 'Soil Nitrogen is low in Node 1 (142 mg/kg). Apply 20 kg Urea per acre after light irrigation.', ts: Date.now() - 3600000 }
        ]
      },
      {
        id: 'chat_demo_2',
        title: 'Bajra irrigation schedule',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 86000000,
        messages: [
          { who: 'me', text: 'When should I irrigate Node 1 next?', ts: Date.now() - 86000000 },
          { who: 'agri', text: 'Moisture is at 62%. Hold watering for 2 days; rain chance is 72% by evening.', ts: Date.now() - 85900000 }
        ]
      }
    ]));
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__ready === true', { timeout: 25000 });
  const cdp = await page.target().createCDPSession();
  return { browser, page, cdp };
}

async function grab(page, cdp, t, file) {
  await page.evaluate(x => window.seek(x), t);
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 92,
    optimizeForSpeed: true
  });
  await fs.promises.writeFile(file, Buffer.from(data, 'base64'));
}

async function worker(id, frames, progress) {
  const { browser, page, cdp } = await openPage();
  for (const f of frames) {
    await grab(page, cdp, f / FPS, path.join(FRAMES, `f${String(f).padStart(5, '0')}.jpg`));
    progress.done++;
  }
  await browser.close();
}

function encode() {
  // Use downloaded energetic 135 BPM stock music ("Getting it Done" by Kevin MacLeod, Incompetech)
  // with smooth 1.5s fade-in and 3.5s fade-out at 2:00.
  const args = [
    '-y',
    '-threads', String(os.cpus().length),
    '-framerate', String(FPS),
    '-i', path.join(FRAMES, 'f%05d.jpg'),
    '-i', MUSIC,
    '-filter_complex', `[1:a]volume=0.85,afade=t=in:st=0:d=1.5,afade=t=out:st=${DURATION - 3.5}:d=3.5[a]`,
    '-map', '0:v',
    '-map', '[a]',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-r', String(FPS),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', String(DURATION),
    '-movflags', '+faststart',
    OUT
  ];
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => {
      err += d;
      const m = String(d).match(/frame=\s*(\d+)/);
      if (m) process.stdout.write(`\r  encoding frame ${m[1]}/${TOTAL}   `);
    });
    p.on('close', c => c === 0 ? res() : rej(new Error(err.slice(-2000))));
  });
}

async function preview() {
  const dir = path.join(ROOT, 'preview');
  fs.mkdirSync(dir, { recursive: true });
  const { browser, page, cdp } = await openPage();
  for (const t of [4, 11, 18, 23, 33, 47, 60, 74, 86, 98, 108, 116]) {
    await grab(page, cdp, t, path.join(dir, `t${String(t).padStart(3, '0')}.jpg`));
  }
  await browser.close();
  console.log('Preview frames written to', dir);
}

async function main() {
  if (process.argv.includes('--preview')) return preview();
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  console.log(`Rendering ${TOTAL} frames (${DURATION}s @ ${FPS}fps) with ${WORKERS} parallel workers in RAM (/dev/shm)…`);
  const chunkSize = Math.ceil(TOTAL / WORKERS);
  const buckets = Array.from({ length: WORKERS }, (_, i) => {
    const start = i * chunkSize;
    const end = Math.min(TOTAL, start + chunkSize);
    const arr = [];
    for (let f = start; f < end; f++) arr.push(f);
    return arr;
  });

  const progress = { done: 0 };
  const t0 = Date.now();
  const tick = setInterval(() => {
    const s = (Date.now() - t0) / 1000, rate = progress.done / s;
    const eta = rate ? Math.round((TOTAL - progress.done) / rate) : 0;
    process.stdout.write(`\r  ${progress.done}/${TOTAL} frames · ${rate.toFixed(1)} fps · ETA ${eta}s   `);
  }, 1000);

  await Promise.all(buckets.map((b, i) => worker(i, b, progress)));
  clearInterval(tick);
  const capSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n  Captured in ${capSec}s. Encoding with energetic stock music…`);

  const enc0 = Date.now();
  await encode();
  const encSec = ((Date.now() - enc0) / 1000).toFixed(1);
  fs.rmSync(FRAMES, { recursive: true, force: true });
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s (capture ${capSec}s + encode ${encSec}s) → ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
