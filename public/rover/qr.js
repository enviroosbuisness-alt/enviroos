import './theme.js';
import { receiveRoverLocale, roverLabel, roverNumber, roverText } from './locale.js';
const get = id => document.getElementById(id);
const names = {left:'Left',right:'Right',forward:'Forward',backward:'Backward',stop:'Stop',farmland:'Farmland inspection',wait:'Wait',inspect:'Inspect'};
const defaultLabels = {left:'Left',right:'Right',forward:'Straight',backward:'Back',stop:'Stop',farmland:'Farmland'};
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
let editingCard = null;
let addDraft = null;

function cardCommands(card) {
  if (Array.isArray(card.steps)) {
    return card.steps.map(({action, seconds}) => seconds ? action + '(' + seconds + ')' : action).join(', ');
  }
  if (card.direction === 'farmland') return 'inspect';
  return card.wait ? card.direction + '(' + card.wait + ')' : card.direction;
}

function setEditMode(card) {
  const label = get('label');
  const commands = get('commands');
  if (card) {
    if (!editingCard) addDraft = {label:label.value, commands:commands.value};
    editingCard = {payload:card.payload, commands:cardCommands(card)};
    label.value = card.label;
    commands.value = editingCard.commands;
    roverLabel(get('qrFormTitle'), 'Edit QR card');
    roverLabel(get('qrSubmit'), 'Save changes');
    commands.focus();
  } else {
    editingCard = null;
    label.value = addDraft?.label || '';
    commands.value = addDraft?.commands || '';
    addDraft = null;
    roverLabel(get('qrFormTitle'), 'Add a QR card');
    roverLabel(get('qrSubmit'), 'Save card');
    label.focus();
  }
  get('cancelQrEdit').hidden = !editingCard;
}

get('cancelQrEdit').onclick = () => {
  if (libraryBusy) return;
  roverLabel(get('status'), '');
  setEditMode(null);
};
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
    if (c.label === defaultLabels[c.payload]) roverLabel(name,names[c.payload]); else name.textContent=c.label;
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
    if (c.editable) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'edit-card';
      roverLabel(edit, 'Edit');
      edit.onclick = () => {
        if (libraryBusy) return;
        roverLabel(get('status'), '');
        setEditMode(c);
      };
      actions.append(edit);
    }
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
        }, 'Card removed from the Pi.').then(removed => {
          if (removed && editingCard?.payload === c.payload) setEditMode(null);
        });
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
  const submit = get('qrSubmit');
  submit.disabled = true;
  get('cancelQrEdit').disabled = true;
  get('cards').inert = true;
  roverLabel(get('status'), '');
  try {
    const rows = await (await request(path, options)).json();
    await renderCards(rows);
    if (success) roverLabel(get('status'), success);
    return true;
  } catch (error) {
    roverLabel(get('status'), error.message);
    return false;
  } finally {
    libraryBusy = false;
    get('cards').inert = false;
    get('cancelQrEdit').disabled = false;
    submit.disabled = false;
  }
}

get('form').onsubmit = async event => {
  event.preventDefault();
  const label = get('label');
  const commands = get('commands');
  const body = {label:label.value};
  if (editingCard) Object.assign(body, {operation:'update', payload:editingCard.payload});
  if (!editingCard || commands.value !== editingCard.commands) body.commands = commands.value;
  const saved = await updateLibrary('/qr/cards', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body),
  }, 'Card saved on the Pi.');
  if (saved) setEditMode(null);
};
window.addEventListener('pagehide', cleanup);
updateLibrary('/qr/cards');
if (parent !== window) {
  window.addEventListener('message', event => {
    if (receiveRoverLocale(event)) document.querySelectorAll('[data-qr-action]').forEach(showAction);
  });
  parent.postMessage({type:'enviroos:qr-locale-ready'}, location.origin);
}
