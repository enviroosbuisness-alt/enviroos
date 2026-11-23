// Share EnviroOS's exact colors, typography and resolved light/dark preference.
const root = document.documentElement;
root.classList.add('enviro-ui');
const keys = ['bg','card','card-2','ink','sub','muted','line','accent','accent-ink','ok-bg','bad','bad-bg','lift','font','display'];
let current;
function apply(theme, tokens = {}) {
  current = {theme: theme === 'dark' ? 'dark' : 'light', tokens};
  root.dataset.enviroTheme = current.theme;
  for (const key of keys) {
    if (typeof tokens[key] === 'string' && tokens[key].length < 500) root.style.setProperty('--enviro-' + key, tokens[key]);
  }
  document.getElementById('qrFrame')?.contentWindow?.postMessage({type:'enviroos:rover-theme', ...current}, location.origin);
  window.dispatchEvent(new Event('enviroos:themechange'));
}
let saved;
try {saved=localStorage.getItem('enviroos.theme');} catch {}
apply(saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');
window.addEventListener('message', event => {
  if (event.origin !== location.origin) return;
  if (event.source === window.parent && event.data?.type === 'enviroos:rover-theme') apply(event.data.theme, event.data.tokens);
  if (event.source === document.getElementById('qrFrame')?.contentWindow && event.data?.type === 'enviroos:rover-theme-ready') {
    event.source.postMessage({type:'enviroos:rover-theme', ...current}, location.origin);
  }
});
if (window.parent !== window) window.parent.postMessage({type:'enviroos:rover-theme-ready'}, location.origin);
