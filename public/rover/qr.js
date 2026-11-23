import './theme.js';
const get = id => document.getElementById(id);
const names = {left:'Left',right:'Right',forward:'Straight',backward:'Back',stop:'Stop',farmland:'Farmland'};
const urls = [];
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
async function library(options) {
  const rows = await (await request('/qr/cards', options)).json();
  cleanup(); get('cards').replaceChildren();
  for (const c of rows) {
    const card=document.createElement('article'), img=document.createElement('img'), name=document.createElement('h3'), info=document.createElement('small'), print=document.createElement('button');
    const path='/qr/card/' + encodeURIComponent(c.payload) + '/';
    img.alt=c.label+' QR'; name.textContent=names[c.payload] || c.label;
    info.textContent=(c.wait?'Wait '+c.wait+' s · ':'')+names[c.direction];
    print.textContent='Download A4 print sheet'; print.type='button';
    print.onclick=async()=>{
      print.disabled=true;
      try {
        const blob=await (await request(path+'pdf')).blob(), url=URL.createObjectURL(blob);
        urls.push(url);
        const link=document.createElement('a'); link.href=url; link.download=c.payload+'.pdf'; link.click();
      } catch(e) {get('status').textContent=e.message;} finally {print.disabled=false;}
    };
    card.append(img,name,info,print); get('cards').append(card);
    try {
      const blob=await (await request(path+'png')).blob(), url=URL.createObjectURL(blob);
      urls.push(url); img.src=url;
    } catch(e) {get('status').textContent=e.message;}
  }
}
get('direction').onchange = () => {
  get('wait').disabled = get('direction').value === 'farmland';
};
get('form').onsubmit=async e=>{
  e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
  try {
    await library({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:get('label').value,direction:get('direction').value,wait:get('wait').disabled ? 0 : Number(get('wait').value)})});
    get('status').textContent='Card saved on the Pi.';get('label').value='';
  } catch(err) {get('status').textContent=err.message;} finally {button.disabled=false;}
};
window.addEventListener('pagehide', cleanup);
library().catch(e=>get('status').textContent=e.message);
