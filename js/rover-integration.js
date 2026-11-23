// A same-origin document isolates the mission planner's keyboard, canvas and CSS.
const U = window.EnviroOS.ui || window.EnviroOS.UI;
const frame = () => document.getElementById('rover-mission-control');
const active = () => U.route === 'rover' && !document.hidden;
let lastActive;
function syncTheme() {
  const styles=getComputedStyle(document.documentElement);
  const tokens=Object.fromEntries(['bg','card','card-2','ink','sub','muted','line','accent','accent-ink','ok-bg','bad','bad-bg','lift','font','display'].map(key=>[key,styles.getPropertyValue('--'+key).trim()]));
  frame()?.contentWindow?.postMessage({type:'enviroos:rover-theme',theme:document.documentElement.dataset.theme,tokens},location.origin);
}
new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
function sync(force = false) {
  const el = frame();
  if (!el) return;
  const value = active();
  if (force || value !== lastActive) {
    el.contentWindow?.postMessage({type: 'enviroos:rover-active', active: value}, location.origin);
    lastActive = value;
    syncTheme();
  }
}
U.resumeRoverFrame = () => sync();
U.suspendRoverFrame = () => {
  frame()?.contentWindow?.postMessage({type: 'enviroos:rover-active', active: false}, location.origin);
  lastActive = false;
};
window.addEventListener('message', event => {
  if (event.origin === location.origin && event.source === frame()?.contentWindow && ['enviroos:rover-ready','enviroos:rover-theme-ready'].includes(event.data?.type)) sync(true);
});
document.addEventListener('visibilitychange', () => sync(true));
window.addEventListener('pagehide', () => U.suspendRoverFrame());

function syncViewport(){
 const el=frame();if(!el)return;
 el.contentWindow?.postMessage({type:'enviroos:rover-viewport',top:Math.max(16,80-el.getBoundingClientRect().top),height:innerHeight},location.origin);
}
window.addEventListener('scroll',syncViewport,{passive:true});
window.addEventListener('resize',syncViewport);
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==frame()?.contentWindow)return;
 if(event.data?.type==='enviroos:rover-height'){
  const height=event.data.height;
  if(Number.isFinite(height)&&height>=100&&height<=100000){frame().style.height=Math.ceil(height)+'px';syncViewport();}
 }
});
