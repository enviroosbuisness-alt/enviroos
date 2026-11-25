import './theme.js';
import { receiveRoverLocale, roverLabel, roverNumber, roverText } from './locale.js';
const get = id => document.getElementById(id);
const names = {left:'Left',right:'Right',forward:'Forward',backward:'Backward',stop:'Stop',farmland:'Farmland inspection',wait:'Wait',inspect:'Inspect'};
const urls = [];
function showAction(info) {
  if (info.dataset.qrSteps) {
    info.textContent = JSON.parse(info.dataset.qrSteps).map(({action, seconds}) =>
      roverText(names[action]) + (seconds ? ' (' + roverNumber(seconds) + ' s)' : '')).join(' → ');
    return;
  }
  const action = info.dataset.qrAction;
  const wait = Number(info.dataset.qrWait);
  const label = roverText(names[action] || action);
  if (action === 'wait') {
    info.textContent = label === names.wait ? 'Hold for ' + roverNumber(wait) + ' s' : label + ' · ' + roverNumber(wait) + ' s';
  } else {
    info.textContent = (wait ? roverNumber(wait) + ' s · ' : '') + label;
  }
}
let libraryBusy = false;
async function request(path, options = {}) {
  const base = sessionStorage.getItem('roverApi');
  const response = await fetch(base ? base.replace(/\/$/, '') + '/api' + path : path, {
    ...options, cache:'no-store', signal:AbortSignal.timeout(5000),
    headers:{...options.headers, ...(base ? {Authorization:'Bearer ' + (sessionStorage.getItem('roverToken') || '')} : {})}
  });
  if (!response.ok) {
    let message;
    try {message = (await response.json()).error;} catch {}
    throw Error(message || 'Could not reach the Pi QR library. Connect the rover first.');
  }
  return response;
}
function cleanup() { for (const url of urls) URL.revokeObjectURL(url); urls.length = 0; }
async function renderCards(rows) {
  cleanup(); get('cards').replaceChildren();
  for (const c of rows) {
    const card=document.createElement('article'), img=document.createElement('img'), name=document.createElement('h3'), info=document.createElement('small'), print=document.createElement('button');
    const path='/qr/card/' + encodeURIComponent(c.payload) + '/';
    img.alt=c.label+' QR';
    if (names[c.payload]) roverLabel(name,names[c.payload]); else name.textContent=c.label;
    info.dataset.qrAction = c.direction;
    info.dataset.qrWait = c.wait;
    if (c.steps) info.dataset.qrSteps = JSON.stringify(c.steps);
    showAction(info);
    roverLabel(print,'Download A4 print sheet'); print.type='button';
    print.onclick=async()=>{
      print.disabled=true;
      try {
        const blob=await (await request(path+'pdf')).blob(), url=URL.createObjectURL(blob);
        urls.push(url);
        const link=document.createElement('a'); link.href=url; link.download=c.payload+'.pdf'; link.click();
      } catch(e) {get('status').textContent=e.message;} finally {print.disabled=false;}
    };
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.append(print);
    if (c.payload !== 'stop') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-card';
      roverLabel(remove,'Remove');
      remove.setAttribute('aria-label', 'Remove ' + c.label);
      remove.onclick = () => {
        if (libraryBusy || !window.confirm('Remove "' + c.label + '" from the Pi QR library?')) return;
        updateLibrary('/qr/cards', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({operation:'remove', payload:c.payload}),
        }, 'Card removed from the Pi.');
      };
      actions.append(remove);
    } else {
      delete info.dataset.qrAction;
      roverLabel(info,'Built-in safety card');
    }
    card.append(img,name,info,actions); get('cards').append(card);
    try {
      const blob=await (await request(path+'png')).blob(), url=URL.createObjectURL(blob);
      urls.push(url); img.src=url;
    } catch(e) {get('status').textContent=e.message;}
  }
}
async function updateLibrary(path, options, success) {
  if (libraryBusy) return false;
  libraryBusy = true;
  const submit = get('form').querySelector('button');
  submit.disabled = true;
  get('cards').inert = true;
  roverLabel(get('status'), '');
  try {
    const rows = await (await request(path, options)).json();
    await renderCards(rows);
    if (success) roverLabel(get('status'), success);
    return true;
  } catch (error) {
    get('status').textContent = error.message;
    return false;
  } finally {
    libraryBusy = false;
    get('cards').inert = false;
    submit.disabled = false;
  }
}

get('form').onsubmit = async event => {
  event.preventDefault();
  const label = get('label');
  const commands = get('commands');
  const saved = await updateLibrary('/qr/cards', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      label: label.value,
      commands: commands.value,
    }),
  }, 'Card saved on the Pi.');
  if (saved) {
    label.value = '';
    commands.value = '';
    label.focus();
  }
};
window.addEventListener('pagehide', cleanup);
updateLibrary('/qr/cards');
if (parent !== window) {
  window.addEventListener('message', event => {
    if (receiveRoverLocale(event)) document.querySelectorAll('[data-qr-action]').forEach(showAction);
  });
  parent.postMessage({type:'enviroos:qr-locale-ready'}, location.origin);
}
