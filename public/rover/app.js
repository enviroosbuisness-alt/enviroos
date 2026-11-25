import './theme.js';
import { receiveRoverLocale, roverDate, roverLabel, roverLocale, roverNumber, roverText } from './locale.js';
import {renderMap, showHistory} from './history.js';
let rememberEdits=false, lastJourney='', liveArchive=null;
const $=id=>document.getElementById(id);
const localCamera=document.body.dataset.localCamera==='true';
const pageOptions = new URLSearchParams(location.search);
const embedded = window.parent !== window && pageOptions.has('embedded');
const localPiProxy = embedded && pageOptions.has('localPi');
let hostActive = !embedded;
if (embedded) document.documentElement.classList.add('embedded');
const canvas=$('map'),ctx=canvas.getContext('2d');
let grid,points=[],stops={},zones=[],history=[],tool='draw',robot={x:0,y:0,yaw:0};
let zoom=1,offset={x:0,y:0},scale=40,drag=null,hover=null,checked=false,previewAt=null;
let dispensingPending = false;
let base=sessionStorage.getItem('roverApi')||'',token=sessionStorage.getItem('roverToken')||'',connected=false,state={},polling=false,epoch=0,mapRevision=null,cameraURL=null,cameraBusy=false;
// A stored loopback address points at the visitor's device on the network.
if (localPiProxy && /^http:\/\/(?:127\.0\.0\.1|localhost):8088\/?$/.test(base)) base = location.origin + '/rover-pi';
let toastTimer,lease=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),lastSeen=0,raf=null;
const raster=document.createElement('canvas');
const MAX_POINTS=5000;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500)}
function snapshot(){history.push(JSON.stringify({points,stops,zones}));if(history.length>30)history.shift();checked=false}
function draftKey(){return connected?'enviroLiveDraft:'+base:'enviroPlanningDraft';}
function restoreDraft(){
  try{const p=JSON.parse(localStorage.getItem(draftKey()));validateImport(p);points=p.points.map(([x,y])=>({x,y}));stops=p.stops;zones=p.zones;checked=false;update();draw();return true;}catch{return false;}
}
function edited(){if(rememberEdits){try{const p=payload();delete p.lease_id;localStorage.setItem(draftKey(),JSON.stringify(p));}catch{}}checked=false;previewAt=null;update();draw()}
function demoMap(){const w=140,h=100,data=Array(w*h).fill(0);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;if(x<3||x>w-4||y<3||y>h-4)v=100;if(x<10&&y>60||y>93)v=-1;if(x>=60&&x<=67&&y>=18&&y<=53||x>=92&&x<=120&&y>=57&&y<=62||x>=23&&x<=43&&y>=69&&y<=76)v=100;data[y*w+x]=v}return {width:w,height:h,resolution:.1,origin:{x:-2,y:-2,yaw:0},data,frame:'map',revision:'demo'}}
function setGrid(g){const previous=grid;if(!g||g.width*g.height>1000000||g.data.length!==g.width*g.height)throw Error('Invalid map data');grid=g;raster.width=g.width;raster.height=g.height;const rc=raster.getContext('2d'),im=rc.createImageData(g.width,g.height);for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const v=g.data[y*g.width+x],i=((g.height-1-y)*g.width+x)*4;let c=document.documentElement.dataset.enviroTheme==='dark'?(v<0?((x+y)%4<2?[30,40,25]:[38,49,33]):v>=65?[130,65,65]:v>20?[104,92,56]:[23,37,20]):(v<0?((x+y)%4<2?[222,225,214]:[234,237,227]):v>=65?[160,107,92]:v>20?[204,171,142]:[238,243,231]);im.data.set([...c,255],i)}rc.putImageData(im,0,0);if(!previous||previous.revision==='demo'||g.revision==='demo'||previous.resolution!==g.resolution||previous.width!==g.width||previous.height!==g.height||previous.origin.x!==g.origin.x||previous.origin.y!==g.origin.y||previous.origin.yaw!==g.origin.yaw)fit();else draw()}
function toLocal(p){const a=grid.origin.yaw||0,dx=p.x-grid.origin.x,dy=p.y-grid.origin.y;return {x:Math.cos(a)*dx+Math.sin(a)*dy,y:-Math.sin(a)*dx+Math.cos(a)*dy}}
function toWorld(p){const a=grid.origin.yaw||0;return {x:grid.origin.x+Math.cos(a)*p.x-Math.sin(a)*p.y,y:grid.origin.y+Math.sin(a)*p.x+Math.cos(a)*p.y}}
function screen(p){const q=toLocal(p);return {x:offset.x+q.x*scale*zoom,y:offset.y+(grid.height*grid.resolution-q.y)*scale*zoom}}
function world(p){return toWorld({x:(p.x-offset.x)/(scale*zoom),y:grid.height*grid.resolution-(p.y-offset.y)/(scale*zoom)})}
function fit(){if(!grid||canvas.clientWidth<=70||canvas.clientHeight<=70)return;const r=canvas.getBoundingClientRect();scale=Math.min((r.width-70)/(grid.width*grid.resolution),(r.height-55)/(grid.height*grid.resolution));zoom=1;offset={x:(r.width-grid.width*grid.resolution*scale)/2,y:(r.height-grid.height*grid.resolution*scale)/2};draw()}
function resize(){const r=canvas.getBoundingClientRect(),d=window.devicePixelRatio||1;canvas.width=r.width*d;canvas.height=r.height*d;ctx.setTransform(d,0,0,d,0,0);fit()}
function draw(){if(!grid||scale<=0||!canvas.clientWidth)return;const {width:w,height:h}=canvas.getBoundingClientRect();ctx.clearRect(0,0,w,h);ctx.fillStyle=document.documentElement.dataset.enviroTheme==='dark'?'#070d06':'#f7faf3';ctx.fillRect(0,0,w,h);ctx.strokeStyle=document.documentElement.dataset.enviroTheme==='dark'?'#20331b':'#dce4d0';ctx.lineWidth=.5;for(let x=offset.x%(scale*zoom);x<w;x+=scale*zoom){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=offset.y%(scale*zoom);y<h;y+=scale*zoom){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
 ctx.imageSmoothingEnabled=false;ctx.drawImage(raster,offset.x,offset.y,grid.width*grid.resolution*scale*zoom,grid.height*grid.resolution*scale*zoom);
 for(const z of zones){const vertices=[[z[0],z[1]],[z[2],z[1]],[z[2],z[3]],[z[0],z[3]]].map(([x,y])=>screen({x,y}));ctx.fillStyle='#bb635044';ctx.strokeStyle='#b76f59';ctx.lineWidth=1.3;ctx.setLineDash([5,4]);ctx.beginPath();vertices.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.stroke();ctx.setLineDash([])}
 if(points.length){ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach((p,i)=>{const q=screen(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.strokeStyle='#fff8';ctx.lineWidth=8;ctx.stroke();ctx.strokeStyle='#d67c54';ctx.lineWidth=4;ctx.stroke();points.forEach((p,i)=>{if(i>0&&i<points.length-1&&!Object.hasOwn(stops,i))return;const q=screen(p);ctx.beginPath();ctx.arc(q.x,q.y,4,0,Math.PI*2);ctx.fillStyle='#fffaf1';ctx.fill();ctx.strokeStyle='#d67c54';ctx.lineWidth=2;ctx.stroke()});let n=0;for(const i of Object.keys(stops).map(Number).sort((a,b)=>a-b)){if(!points[i])continue;const q=screen(points[i]);ctx.beginPath();ctx.arc(q.x,q.y,14,0,Math.PI*2);ctx.fillStyle='#fffaf1';ctx.fill();ctx.strokeStyle='#ce8056';ctx.lineWidth=1.6;ctx.stroke();ctx.fillStyle='#b66d48';ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(++n),q.x,q.y+.5)}}
 if(connected && state.trip){
   const t=state.trip;
   function line(coords,color,dash){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.setLineDash(dash);ctx.beginPath();coords.forEach(([x,y],i)=>{const q=screen({x,y});if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y)});ctx.stroke();ctx.restore();}
   line(t.planned,'#ad582d',[7,5]);line(t.last?[...t.trail,t.last]:t.trail,'#007656',[]);
 }
 let pose=robot;if(previewAt!==null)pose=previewPose();if(pose){const r=screen(pose);ctx.save();ctx.translate(r.x,r.y);ctx.rotate(-(pose.yaw||0)+(grid.origin.yaw||0));ctx.beginPath();ctx.arc(0,0,18,0,Math.PI*2);ctx.fillStyle='#305b3820';ctx.fill();ctx.fillStyle='#325d3f';ctx.fillRect(-8,-8,16,16);ctx.fillStyle='#253e2c';ctx.fillRect(-10,-10,20,4);ctx.fillRect(-10,6,20,4);ctx.fillStyle='#f3f4dd';ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(3,-4);ctx.lineTo(3,4);ctx.closePath();ctx.fill();ctx.restore();ctx.fillStyle='#4e7250';ctx.font='10px ui-monospace,monospace';ctx.textAlign='left';ctx.fillText(previewAt!==null?'PREVIEW':'ROVER',r.x+21,r.y+3)}
 if(drag?.kind==='block'){const a=screen(drag.start),b=screen(drag.current);ctx.fillStyle='#b6654733';ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeStyle='#b66547';ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y)}$('scaleText').textContent=(60/(scale*zoom)).toFixed(1)+' m';}
function addRouteStop(q){
 if(points.length<2){toast('Draw a route first, then place a stop on the line.');return}
 let best=null;
 for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(!l)continue;const t=Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.y-a.y)*dy)/l)),p={x:a.x+t*dx,y:a.y+t*dy},distance=Math.hypot(q.x-p.x,q.y-p.y);if(!best||distance<best.distance)best={i,t,p,distance}}
 if(!best||best.distance>Math.max(.35,18/(scale*zoom))){toast('Click closer to the route line to place your stop.');return}
 if(best.i===0&&best.t<.000001){toast('Place a stop after the route’s starting point.');return}
 if(points.length>=MAX_POINTS){toast('This route has reached its point limit.');return}
 snapshot();let index;
 if(best.t<.000001){index=best.i}else if(best.t>.999999){index=best.i+1}else{index=best.i+1;points.splice(index,0,best.p);stops=Object.fromEntries(Object.entries(stops).map(([i,wait])=>[+i>=index?+i+1:+i,wait]))}
 stops[index]=waitValue($('defaultWait').value);edited();toast('Stop added. Adjust its wait in your itinerary.');
}
function icon(name){return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`}
function focusStop(index){const q=screen(points[index]);offset.x+=canvas.clientWidth/2-q.x;offset.y+=canvas.clientHeight/2-q.y;draw();$('routeWorkspace').scrollIntoView({behavior:'smooth',block:'start'});toast('Stop located on the map. Use Fit map to see the whole route.')}
function syncCameraUI(){const on=$('cameraToggle').checked,live=on&&!$('camera').hidden;$('cameraTag').textContent=live?'Live':on?'Connecting':'Off';$('cameraTag').classList.toggle('live',live);$('cameraOpen').innerHTML=(on?'Hide camera':'Show camera')+' '+icon('arrow');}
function syncUI(){
 $('undo').disabled=!history.length||!!state.busy;$('clear').disabled=(!points.length&&!zones.length)||!!state.busy;
 $('sidebarTitle').textContent=connected?'Your rover is online.':'Your rover, connected.';$('sidebarMessage').textContent=connected?'Live maps, position and camera are supplied by your Raspberry Pi.':'Connect your Raspberry Pi to bring maps and camera online.';
 $('sidebarConnect').innerHTML=(connected?'Connection settings':'Connect your Pi')+' '+icon('arrow');$('sidebarStatus').textContent=connected?'Pi connected':'Not connected';
 $('mapMode').textContent=connected?'Live navigation map':grid?.revision==='demo'?'Planning sandbox':'Last received map';
 const stage=state.busy||checked?3:tool==='stop'?1:points.length>1?2:0;
 document.querySelectorAll('[data-step]').forEach((b,i)=>{b.classList.toggle('current',i===stage);b.classList.toggle('done',i<stage)});
 $('missionState').classList.toggle('running',!!state.busy);
 $('preview').innerHTML=icon(previewAt!==null?'stop':'play')+(previewAt!==null?' Stop preview':' Preview');
 syncCameraUI();
 showMapMode();
}

function pointAt(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}}
canvas.addEventListener('pointerdown',e=>{if(state.busy){toast('Stop the active mission before editing.');return}canvas.setPointerCapture(e.pointerId);const p=pointAt(e),q=world(p);if(tool==='pan'||e.shiftKey){drag={kind:'pan',start:p,offset:{...offset}};return}if(tool==='draw'){snapshot();points=[q];stops={};drag={kind:'draw'};edited()}else if(tool==='waypoint'){if(points.length>=MAX_POINTS)return;snapshot();points.push(q);edited()}else if(tool==='stop'){addRouteStop(q)}else if(tool==='block'){snapshot();drag={kind:'block',start:q,current:q}}});
canvas.addEventListener('pointermove',e=>{const p=pointAt(e),q=world(p);$('coordinate').textContent=`X ${roverNumber(q.x,2)} · Y ${roverNumber(q.y,2)} M`;if(!drag)return;if(drag.kind==='pan'){offset.x=drag.offset.x+p.x-drag.start.x;offset.y=drag.offset.y+p.y-drag.start.y}else if(drag.kind==='draw'){const last=points.at(-1);if(points.length<MAX_POINTS&&Math.hypot(q.x-last.x,q.y-last.y)>.07)points.push(q);checked=false;update(false)}else if(drag.kind==='block')drag.current=q;draw()});
function pointerEnd(){if(drag?.kind==='block'){const a=drag.start,b=drag.current;if(Math.hypot(a.x-b.x,a.y-b.y)>.1)zones.push([Math.min(a.x,b.x),Math.min(a.y,b.y),Math.max(a.x,b.x),Math.max(a.y,b.y)]);edited()}drag=null;update()}
canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);
canvas.addEventListener('wheel',e=>{e.preventDefault();zoomBy(e.deltaY<0?1.12:1/1.12,pointAt(e))},{passive:false});
function zoomBy(f,p){p=p||{x:canvas.clientWidth/2,y:canvas.clientHeight/2};const old=zoom;zoom=Math.max(.4,Math.min(8,zoom*f));offset.x=p.x-(p.x-offset.x)*zoom/old;offset.y=p.y-(p.y-offset.y)*zoom/old;draw()}
function waitValue(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(86400,n)):5}
function payload(){return {points:points.map(p=>[p.x,p.y]),stops,zones,lease_id:lease}}
function update(renderStops=true){let d=0;for(let i=1;i<points.length;i++)d+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);$('distance').innerHTML=roverNumber(d,1)+'<span> m</span>';$('stopCount').textContent=roverNumber(Object.keys(stops).length);$('dwell').innerHTML=roverNumber(Object.values(stops).reduce((a,b)=>a+b,0))+'<span> s</span>';$('pointCount').textContent=`${points.length} points`;$('routeText').textContent=checked?'Route checked against current map':points.length>1?'Route needs a traversability check':'Draw a route to check the path';$('routeDot').className='state-dot'+(checked?' ok':'');$('arm').hidden=!connected||state.motor_enabled||state.busy;$('start').disabled=!(connected&&state.can_start&&checked&&points.length>1&&!state.busy);$('stop').disabled=!connected;$('validate').disabled=points.length<2||!!state.busy;$('preview').disabled=points.length<2||!!state.busy;$('missionState').textContent=state.busy?(state.phase||'Driving'):state.message==='Mission complete'?'Complete':state.phase==='Stopped'?'Stopped':'Draft';syncUI();if(!renderStops)return;
 const list=$('stops');list.replaceChildren();const indices=Object.keys(stops).map(Number).sort((a,b)=>a-b);if(!indices.length){list.innerHTML='<div class="empty-stops"><span>＋</span><p>Make a stop along the way.<small>Select Add stop, then click anywhere on the route. Set a different wait for each stop.</small></p></div>';return}indices.forEach((i,n)=>{const p=points[i];if(!p)return;const card=document.createElement('div');card.className='stop-card';card.innerHTML=`<div class="stop-card-title"><span>${n+1}</span><b>Stop ${roverNumber(n+1)}</b></div><small>X ${roverNumber(p.x,2)} · Y ${roverNumber(p.y,2)} m</small><label>Wait <input aria-label="Wait at stop ${n+1}" type="number" min="0" max="86400" value="${stops[i]}"> sec</label><button class="remove-stop" aria-label="Remove stop ${n+1}">×</button>`;card.querySelector('input').disabled=!!state.busy;card.querySelector('input').oninput=e=>{snapshot();stops[i]=waitValue(e.target.value);checked=false;previewAt=null;update(false);draw()};card.querySelector('button').disabled=!!state.busy;card.querySelector('button').onclick=()=>{snapshot();delete stops[i];edited()};card.tabIndex=0;card.setAttribute('role','group');card.setAttribute('aria-label',`Stop ${n+1}, ${stops[i]} seconds. Press Enter to locate on map.`);card.onclick=e=>{if(!e.target.closest('input,button,label'))focusStop(i)};card.onkeydown=e=>{if(e.key==='Enter'&&e.target===card){e.preventDefault();focusStop(i)}};list.append(card)})}
function localCheck(){if(points.length<2)throw Error('Add at least two route points.');for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],count=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/(grid.resolution*.4)));if(count>100000)throw Error('Route segment too long.');for(let s=0;s<=count;s++){const x=a.x+(b.x-a.x)*s/count,y=a.y+(b.y-a.y)*s/count;if(zones.some(z=>x>=z[0]&&x<=z[2]&&y>=z[1]&&y<=z[3]))throw Error('Route crosses a no-go area.');const q=toLocal({x,y}),cx=Math.floor(q.x/grid.resolution),cy=Math.floor(q.y/grid.resolution);if(cx<0||cy<0||cx>=grid.width||cy>=grid.height)throw Error('Route leaves the map.');const v=grid.data[cy*grid.width+cx];if(v<0||v>20)throw Error('Route crosses unknown or blocked/cost space.')}}return true}
async function api(path,{method='GET',body,signal}={}) {
  if (!base) throw Error('Connect your Pi first.');
  let r;
  try {
    r = await fetch(base.replace(/\/$/,'')+path, {
      method, headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined, signal:signal||AbortSignal.timeout(4000), cache:'no-store'
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    const reason = error.name === 'TimeoutError' ? 'The Pi did not respond in time.' : 'The browser could not reach the Pi.';
    throw Error(`${reason} Address: ${base}. Start the Pi control server and check its address. If the server is running, allow ${location.origin} in its web origins. On another phone or computer, use the Pi’s network address instead of 127.0.0.1.`);
  }
  if (!r.ok) {
    let msg; try {msg=(await r.json()).error;} catch {}
    if (msg) throw Error(msg);
    if (r.status >= 500) {
      throw Error(`Pi control request failed (HTTP ${r.status}, ${path}) at ${base}. Check the Pi control service. ESP32 MQTT readings use a separate connection.`);
    }
    throw Error(`Pi returned HTTP ${r.status} for ${path}.`);
  }
  return r;
}
async function checkRoute(){try{localCheck();if(connected&&state.map_revision==null)throw Error('This is a planning map. Use Preview to inspect the route. Live route checks need a navigation map and measured position.');if(connected){const r=await (await api('/api/validate',{method:'POST',body:payload()})).json();if(!r.valid)throw Error(r.message)}checked=true;update();toast(connected?'Route check passed. Nav2 will plan each segment.':'Example-map check passed. Connect Pi for a real mission.')}catch(e){checked=false;update();$('routeText').textContent=e.message;$('routeDot').className='state-dot bad';toast(e.message)}}
let connectionPending=false;
let piConnectionError = '';
async function connect(e,silent=false){e?.preventDefault();if(connectionPending)return;const candidate=$('apiBase').value.trim();if(!candidate)return;releaseDirect();connectionPending=true;updateTaskPanel();try{const u=new URL(candidate);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('Use a plain HTTP(S) API address.');if(location.protocol==='https:'&&u.protocol==='http:')throw Error('This hosted page requires HTTPS on the Pi. Alternatively open http://PI_IP:8088 directly.');base=u.href.replace(/\/$/,'');token=$('apiToken').value;const s=await(await api('/api/state')).json();if(!s.protocol||s.protocol!=='field-rover-v1')throw Error('This is not the rover web API.');epoch++;connected=true;piConnectionError='';state=s;lastSeen=Date.now();sessionStorage.setItem('roverApi',base);sessionStorage.setItem('roverToken',token);points=[];stops={};zones=[];history=[];checked=false;mapRevision=null;robot=null;$('connectDialog').close();$('mapEmpty').hidden=false;setConnection();if (!autoSelected) startSteeringCamera();await poll();restoreDraft();if (!silent) toast('Pi connected.')}catch(err){connected=false;piConnectionError=err.message;setConnection();$('connectError').textContent=piConnectionError}finally{connectionPending=false;updateTaskPanel()}}
function setConnection(){ $('connection').classList.toggle('live',connected);roverLabel($('connection').querySelector('span'), connected?'Pi connected':'Connect rover');$('notice').className='notice'+(connected?' live':'');$('notice').querySelector('span:nth-child(2)').innerHTML=connected?'<b>Live connection.</b> Camera, QR and manual controls use your Pi. Drawn-route navigation uses a live map and measured position when available.':(localCamera?'<b>Local webcam · planning sandbox.</b> Plan stops on the example map. Connect Nav2 for live navigation.':'<b>You’re in the planning sandbox.</b> Explore the example map, or connect your Pi to work with your real rover.');$('connectInline').textContent=connected?'Connection settings →':'Connect Pi →';$('mapBadge').textContent=connected?'LIVE COSTMAP':grid.revision==='demo'?'EXAMPLE MAP':'STALE MAP';$('mapTitle').textContent=connected?'Rover / real navigation map':grid.revision==='demo'?'Workshop exploration':'Last received navigation map';$('missionHint').textContent=connected?'Check the route and position feedback before starting.':'Connect the Pi before sending a real mission.';update()}
async function poll(){if(!hostActive||!connected||polling)return;polling=true;const gen=epoch;try{const s=await(await api('/api/state')).json();if(gen!==epoch)return;const wasBusy=state.busy;state=s;lastSeen=Date.now();robot=s.robot;let need=s.map_revision!==null&&s.map_revision!==mapRevision;$('mapEmpty').hidden=s.map_revision!==null;if(need){const g=await(await api('/api/map')).json();if(gen!==epoch)return;const old=grid;setGrid(g);mapRevision=s.map_revision;if(old?.revision!=='demo'){/* Preserve viewport on live map refresh. */}checked=false}$('mapAge').textContent=`COSTMAP ${Number(s.map_age||0).toFixed(1)}s · ${s.frame||'map'}`;$('feedbackText').textContent=s.can_start?'Position + motor bridge ready':s.readiness||'Waiting for navigation readiness';$('feedbackDot').className='state-dot'+(s.can_start?' ok':' bad');$('missionHint').textContent=s.can_start?(s.message||'Ready for route checks.'):(s.readiness||s.message||'Waiting for navigation inputs.');update(wasBusy!==s.busy);draw();if(s.busy)await api('/api/heartbeat',{method:'POST',body:{lease_id:lease}})}catch(e){if(gen!==epoch)return;$('missionHint').textContent=e.message;if(Date.now()-lastSeen>4500){connected=false;epoch++;state={};$('cameraToggle').checked=false;cameraOff();setConnection();$('notice').className='notice error';$('notice').querySelector('span:nth-child(2)').textContent='Pi connection lost. Reconnect to verify the rover has stopped.';toast('Connection lost. The mission lease will request a stop.')}}finally{polling=false}}
let cameraController, lastFrameTime = -Infinity;
async function readCamera(controller, onFrame) {
    const response = localCamera
      ? await fetch('/stream.mjpg', {signal:controller.signal, cache:'no-store'})
      : await api('/api/camera.mjpg', {signal:controller.signal});
    if (!response.ok) throw Error('Webcam unavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = new Uint8Array(0), size = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) throw Error('Webcam stream ended');
      const bytes = new Uint8Array(buffer.length + value.length);
      bytes.set(buffer);
      bytes.set(value, buffer.length);
      buffer = bytes;
      while (buffer.length) {
        if (!size) {
          let i = 0;
          while (i+3 < buffer.length &&
            !(buffer[i]===13 && buffer[i+1]===10 && buffer[i+2]===13 && buffer[i+3]===10)) i++;
          if (i+3 >= buffer.length) {
            if (buffer.length > 1024) throw Error('Invalid webcam stream header');
            break;
          }
          const header = decoder.decode(buffer.subarray(0,i));
          size = Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1]);
          if (!(size > 0 && size <= 2000000)) throw Error('Invalid webcam frame size');
          buffer = buffer.subarray(i+4);
        }
        if (buffer.length < size) break;
        const url = URL.createObjectURL(new Blob([buffer.subarray(0,size)], {type:'image/jpeg'}));
        buffer = buffer.subarray(size);
        size = 0;
        onFrame(url);
      }
    }
}
async function cameraTick() {
  if (!hostActive || (!connected && !localCamera) || !$('cameraToggle').checked || cameraBusy) return;
  cameraBusy = true;
  const controller = new AbortController();
  cameraController = controller;
  try {
    await readCamera(controller, url => {
        $('camera').src = url;
        if (cameraURL) URL.revokeObjectURL(cameraURL);
        cameraURL = url;
        lastFrameTime = performance.now();
        if ($('camera').hidden) {
          $('camera').hidden=false;
          $('cameraPlaceholder').hidden=true;
          setCameraFeedStatus('live');
          syncCameraUI();
        }
    });
  } catch (error) {
    if (!controller.signal.aborted) {
      $('camera').hidden=true;
      $('cameraPlaceholder').hidden=false;
      setCameraFeedStatus('unavailable');
      $('cameraPlaceholder').querySelector('span').textContent=error.message;
    }
  } finally {
    controller.abort();
    cameraBusy=false;
    syncCameraUI();
  }
}
function setCameraFeedStatus(status) {
  $('cameraFeedStatus').dataset.state = status;
  setText('cameraState', {live:'Live', off:'Camera off', unavailable:'Camera unavailable'}[status]);
  $('cameraGPSStatus').hidden = status !== 'live';
  if (status !== 'live') $('cameraQRStatus').hidden = true;
}
function cameraOff(){cameraController?.abort();$('camera').hidden=true;$('camera').removeAttribute('src');$('cameraPlaceholder').hidden=false;roverLabel($('cameraPlaceholder').querySelector('span'), 'Show the webcam connected to your Pi');setCameraFeedStatus('off');if(cameraURL){URL.revokeObjectURL(cameraURL);cameraURL=null}syncCameraUI()}
function example(){if(connected||state.busy){toast('Example routes are available only while disconnected.');return}snapshot();points=[{x:0,y:0},{x:1.5,y:0},{x:2.7,y:.8},{x:2.7,y:3.6},{x:5,y:4.4},{x:6.4,y:4.4}];stops={3:5,5:10};zones=[];edited()}
function previewPose(){const elapsed=(performance.now()-previewAt)/1000;let t=elapsed;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=Math.hypot(b.x-a.x,b.y-a.y),dt=d/1.5;if(t<dt)return {x:a.x+(b.x-a.x)*t/dt,y:a.y+(b.y-a.y)*t/dt,yaw:Math.atan2(b.y-a.y,b.x-a.x)};t-=dt;if(stops[i]){if(t<Math.min(stops[i],2))return {...b,yaw:Math.atan2(b.y-a.y,b.x-a.x)};t-=Math.min(stops[i],2)}}previewAt=null;update(false);return robot}
function animate(){draw();if(previewAt!==null)raf=requestAnimationFrame(animate)}
function openConnect(){$('apiBase').value=base||(localPiProxy ? location.origin + '/rover-pi' : '')||((localCamera||embedded)?'http://127.0.0.1:8088':'')||((location.hostname==='localhost'||location.hostname==='127.0.0.1'||location.hostname.endsWith('.local')||/^\d+\.\d+\.\d+\.\d+$/.test(location.hostname))?location.origin:'');$('apiToken').value=token;$('connectError').textContent='';$('connectDialog').showModal()}
function validateImport(p){if(!p||!Array.isArray(p.points)||p.points.length>MAX_POINTS||p.points.some(q=>!Array.isArray(q)||q.length!==2||q.some(v=>!Number.isFinite(v))))throw Error('Invalid route points');if(!p.stops||typeof p.stops!=='object'||Array.isArray(p.stops)||Object.entries(p.stops).some(([i,w])=>!/^\d+$/.test(i)||+i<1||+i>=p.points.length||!Number.isFinite(w)||w<0||w>86400))throw Error('Invalid timed stops');if(!Array.isArray(p.zones)||p.zones.length>100||p.zones.some(z=>!Array.isArray(z)||z.length!==4||z.some(v=>!Number.isFinite(v))||z[0]>z[2]||z[1]>z[3]))throw Error('Invalid no-go areas')}
$('connection').onclick=$('settings').onclick=$('connectInline').onclick=openConnect;$('connectForm').onsubmit=connect;$('closeDialog').onclick=()=>$('connectDialog').close();$('disconnect').onclick=()=>{releaseDrive();connected=false;piConnectionError='';epoch++;state={};token='';base='';sessionStorage.removeItem('roverToken');sessionStorage.removeItem('roverApi');mapRevision=null;$('cameraToggle').checked=false;cameraOff();$('mapEmpty').hidden=true;points=[];stops={};zones=[];robot={x:0,y:0,yaw:0};setGrid(demoMap());setConnection();$('connectDialog').close()};
$('zoomIn').onclick=()=>zoomBy(1.25);$('zoomOut').onclick=()=>zoomBy(.8);$('fit').onclick=fit;
const toolHints={draw:'Click and drag from the rover to sketch your route.',waypoint:'Click the rover first, then click to place each destination.',stop:'Click anywhere on your route to add a timed stop.',block:'Drag a rectangle to mark a no-go area. Real missions need Nav2 keepout filters.',pan:'Drag to explore the map. Scroll to zoom; use Fit map to reset.'};
function selectTool(next){if(state.busy){toast('Stop the active mission before editing.');return}tool=next;document.querySelectorAll('[data-tool]').forEach(b=>{const active=b.dataset.tool===next;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});canvas.style.cursor=next==='pan'?'grab':'crosshair';$('toolHint').textContent=toolHints[next];syncUI()}
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>selectTool(b.dataset.tool));
$('undo').onclick=()=>{if(state.busy||!history.length)return;({points,stops,zones}=JSON.parse(history.pop()));edited()};$('clear').onclick=()=>{if(state.busy)return;snapshot();points=[];stops={};zones=[];edited()};$('validate').onclick=checkRoute;
$('preview').onclick=()=>{try{localCheck();if(previewAt!==null){previewAt=null;cancelAnimationFrame(raf);update(false);draw();return}previewAt=performance.now();update(false);toast('Visual preview only · accelerated motion and waits.');animate()}catch(e){toast(e.message)}};
$('arm').onclick=async()=>{try{const r=await(await api('/api/enable',{method:'POST',body:{}})).json();toast(r.message);await poll()}catch(e){toast(e.message)}};
$('start').onclick=async()=>{try{if(!connected||!checked||state.busy)return;$('start').disabled=true;const r=await(await api('/api/mission',{method:'POST',body:{...payload(),continue_on_pi:true}})).json();toast(r.message||'Mission submitted.');state.busy=true;update();await poll()}catch(e){toast(e.message);update()}};
$('stop').onclick=async()=>{releaseDrive();try{await api('/api/stop',{method:'POST',body:{}});toast('Stop requested. Motor bridge held; Nav2 cancellation requested.');checked=false;await poll()}catch(e){toast('Stop could not reach Pi. Use the physical motor-power stop.')}};
$('cameraToggle').onchange=()=>{if($('cameraToggle').checked){if(!connected&&!localCamera){$('cameraToggle').checked=false;openConnect();return}cameraTick()}else cameraOff()};$('railCamera').onclick=()=>{$('cameraToggle').click();$('cameraToggle').scrollIntoView({behavior:'smooth',block:'center'})};
$('save').onclick=()=>{if(!points.length){toast('Draw a route before saving.');return}const p={...payload(),version:1,frame:'map'};delete p.lease_id;localStorage.setItem('enviroRoverMission',JSON.stringify(p));const url=URL.createObjectURL(new Blob([JSON.stringify(p,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='enviro-rover-mission.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Mission saved to this browser and exported as JSON.')};
function importMission(p){if(state.busy)throw Error('Stop the mission before importing.');validateImport(p);snapshot();points=p.points.map(([x,y])=>({x,y}));stops=p.stops;zones=p.zones;edited();toast('Mission loaded. Check that it belongs to this map.')}
$('railSaved').onclick=()=>{try{const p=localStorage.getItem('enviroRoverMission')||localStorage.getItem('fieldMission');if(!p)throw Error('No saved mission in this browser.');importMission(JSON.parse(p))}catch(e){toast(e.message)}};$('load').onclick=()=>$('fileInput').click();$('fileInput').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>1000000)throw Error('Mission file too large.');importMission(JSON.parse(await f.text()))}catch(err){toast(err.message)}finally{e.target.value=''}};$('resetExample').onclick=example;
$('sidebarConnect').onclick=openConnect;
$('plannerNav').onclick=()=>$('routeWorkspace').scrollIntoView({behavior:'smooth',block:'start'});
$('addStopShortcut').onclick=()=>{selectTool('stop');$('routeWorkspace').scrollIntoView({behavior:'smooth',block:'start'});toast('Click your route where you want to stop.')};
$('quickHelp').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();
$('cameraOpen').onclick=()=>$('cameraToggle').click();
const cameraBackdrop=document.createElement('div');cameraBackdrop.className='camera-backdrop';cameraBackdrop.hidden=true;document.body.append(cameraBackdrop);
const emergencyHome = $('taskEmergencyStop').parentElement;
function expandCamera(value){
  if (value) document.querySelector('.camera-actions').prepend($('taskEmergencyStop'));
  else emergencyHome.append($('taskEmergencyStop'));
  $('visionPanel').classList.toggle('expanded',value);cameraBackdrop.hidden=!value;$('expandCamera').setAttribute('aria-label',value?'Close expanded camera view':'Expand camera view');$('expandCamera').title=value?'Close expanded view':'Expand camera view';}
$('expandCamera').onclick=()=>expandCamera(!$('visionPanel').classList.contains('expanded'));cameraBackdrop.onclick=()=>expandCamera(false);
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{const step=b.dataset.step;if(step==='draw'||step==='stop'){selectTool(step);$('routeWorkspace').scrollIntoView({behavior:'smooth',block:'start'})}else if(step==='check')checkRoute();else{document.querySelector('.mission').scrollIntoView({behavior:'smooth',block:'center'});if(!connected)openConnect();else if($('start').disabled)toast('Check the route and rover readiness before starting.')}});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){expandCamera(false);if((connected||directMode())&&!document.querySelector('dialog[open]'))$('taskEmergencyStop').click();return}if(e.target.closest('input,textarea,select,[contenteditable="true"]')||$('connectDialog').open||$('helpDialog').open)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$('undo').click();return}if(e.ctrlKey||e.metaKey||e.altKey)return;const next={d:'draw',w:'waypoint',s:'stop',b:'block',h:'pan'}[e.key.toLowerCase()];if(next){e.preventDefault();selectTool(next)}});
let userMapChoice = null;
let sceneRunning = true, sceneController, liveUrl, sceneGeneration = 0;
function clearScene() {
  sceneGeneration++;
  sceneController?.abort();
  for (const id of ['mapLive']) { $(id).hidden=true; $(id).removeAttribute('src'); }
  if(liveUrl) URL.revokeObjectURL(liveUrl);
  liveUrl=null;
  $('sceneRate').textContent='';
}
async function mapVideo(){
  if(sceneController || !sceneRunning || $('scenePanel').hidden || document.hidden || !hostActive)return;
  const controller=new AbortController();
  sceneController=controller;
  let frames=0,start=performance.now();
  try{
    await readCamera(controller,url=>{
      $('mapLive').src=url; $('mapLive').hidden=false;
      if(liveUrl)URL.revokeObjectURL(liveUrl);
      liveUrl=url; frames++;
      const now=performance.now();
      if(now-start>=1000){$('sceneRate').textContent=Math.round(frames*1000/(now-start))+' fps';frames=0;start=now;}
    });
  }catch{if(!controller.signal.aborted){$('mapLive').hidden=true;$('sceneRate').textContent='Reconnecting…';}}
  finally{controller.abort();sceneController=null;}
}
function tripSummary(){
  const t=connected && state.trip;
  const fmt=p=>p ? p.map(v=>Number(v).toFixed(2)).join(', ')+' m' : '—';
  $('tripSummary').textContent=t ? 'Route start '+fmt(t.planned[0])+' · Destination '+fmt(t.planned.at(-1))+' · Last measured position '+fmt(t.last || t.trail.at(-1))+' · Green line: recorded travel' : 'Recorded travel appears when the Pi starts a localized mission.';
}
const QR_REQUEST_TIMEOUT_MS = 3500;
const QR_MOVING_SCAN_TIMEOUT_MS = 2300;
let qrPending = false;
let qrBadge = '';
let qrBadgeSeenAt = 0;
async function updateCameraQR() {
  const fix=connected && Date.now()-lastSeen<2000 && state.gps;
  const reading=fix ? roverNumber(fix.lat,7)+'°, '+roverNumber(fix.lon,7)+'° · '+(fix.accuracy==null?'accuracy unknown':'σ '+roverNumber(fix.accuracy,2)+' m') : 'GNSS · no fresh rover fix';
  const preciseLocation = reading + (state.saved_base_points ? ' · Saved base route' : '');
  $('sceneGPS').textContent = preciseLocation;
  $('cameraGPS').textContent = fix ? (fix.accuracy == null ? 'Fix acquired' : '±' + roverNumber(fix.accuracy,1) + ' m') : 'No fix';
  $('cameraGPSStatus').title = preciseLocation;
  $('cameraGPSStatus').setAttribute('aria-label', 'GPS: ' + (fix ? preciseLocation : 'No fresh rover fix'));
  if (qrPending) return;
  const visible = () => [
    [ $('cameraQR'), !document.hidden && !$('camera').hidden ],
    [ $('sceneQR'), !document.hidden && sceneRunning && !$('scenePanel').hidden && !$('mapLive').hidden ]
  ];
  function display(message) {
    for (const [label, active] of visible()) {
      const isCamera = label.id === 'cameraQR';
      const text = active ? (isCamera ? message : 'QR · ' + message) : '';
      if (label.textContent !== text) label.textContent = text;
      if (isCamera) $('cameraQRStatus').hidden = !active;
    }
  }
  if (!hostActive || (!directQr && !visible().some(([, active]) => active))) {
    qrBadge = '';
    display('');
    return;
  }
  qrPending = true;
  const run = directQr;
  const signal = AbortSignal.timeout(QR_REQUEST_TIMEOUT_MS);
  try {
    const r = localCamera ? await fetch('/qr/scan', {cache:'no-store', signal}) : await api('/api/qr/scan', {signal});
    if (!r.ok) throw Error();
    const cards = await r.json();
    if (!Array.isArray(cards)) throw Error('Invalid scanner response');
    // A response belongs to the run that requested it. The request timeout
    // bounds latency even while the rover is stationary and waiting to scan.
    if (run && directQr === run && !signal.aborted && checkDirectQr(run, performance.now())) {
      processDirectQr(run, cards);
    }
    const directions = {left:'Left',right:'Right',forward:'Forward',backward:'Reverse',stop:'Stop',farmland:'Farmland',wait:'Wait'};
    const names = cards.map(card => card.label || directions[card.direction]).filter(Boolean);
    const now = performance.now();
    if (names.length) {
      qrBadge = names.length > 1 ? names.length + ' cards detected' : names[0];
      qrBadgeSeenAt = now;
    } else if (now - qrBadgeSeenAt > 700) {
      qrBadge = '';
    }
    display(qrBadge || 'Scanning');
  } catch {
    qrBadge = '';
    display('Scanner unavailable');
    if (run && directQr === run) stopDirectQr('QR scanner unavailable.');
  }
  finally { qrPending = false; }
}
setInterval(updateCameraQR, 350);
let scenePending = false;

let driveDirection = null, driveSequence = 0, drivePending = false;
let drivePWM=128;
try {const value=Number(localStorage.getItem('enviroRover.speedPWM') ?? 128);if(Number.isInteger(value)&&value>=0&&value<=255)drivePWM=value;}catch{}
function syncDriveSpeed(){ $('driveSpeed').value=drivePWM;$('driveSpeedValue').textContent=roverNumber(drivePWM)+' / '+roverNumber(255)+' PWM';$('driveSpeedFormula').textContent='Motor A: '+Math.max(0,drivePWM-35)+' · Motor B: '+drivePWM+' PWM';}
$('driveSpeed').oninput=()=>{drivePWM=Number($('driveSpeed').value);try{localStorage.setItem('enviroRover.speedPWM',String(drivePWM));}catch{}syncDriveSpeed();};
syncDriveSpeed();

function showMapMode() {
  tripSummary();
  const viewingHistory=userMapChoice==='history';
  $('historyTab').setAttribute('aria-pressed',String(viewingHistory));
  $('historyPanel').hidden=!viewingHistory;
  $('routeWorkspace').classList.toggle('history-open',viewingHistory);
  if(viewingHistory){
    if(!$('scenePanel').hidden)clearScene();
    $('scenePanel').hidden=true;$('mapTitle').textContent='Trip history';$('mapBadge').textContent='PI ARCHIVE';
    $('routeTab').setAttribute('aria-pressed','false');$('sceneTab').setAttribute('aria-pressed','false');return;
  }
  const available = connected && state.map_revision != null;
  const scene = (localCamera || connected) && (userMapChoice === 'scene' ||
    (userMapChoice === null && !available));
  const changed = $('scenePanel').hidden === scene;
  $('scenePanel').hidden = !scene;
  $('routeWorkspace').classList.toggle('scene-open', scene);
  $('sceneTab').setAttribute('aria-pressed', String(scene));
  $('routeTab').setAttribute('aria-pressed', String(!scene));
  $('sceneTab').disabled = !connected && !localCamera;
  $('routeTab').disabled = false;
  if (scene) {
    const data=liveArchive && (state.busy || !points.length || liveArchive.status==='Manual travel')?liveArchive:{
      planned:points.map(p=>[p.x,p.y]),stops,samples:[],obstacles:[]};
    const sig=JSON.stringify(data);
    if(sig!==lastJourney){lastJourney=sig;renderMap($('journey'),data,true);}

    $('mapTitle').textContent = 'Camera obstacle grid';
    $('mapBadge').textContent = 'CAMERA VIEW';
    if (changed) {mapVideo();refreshScene();}
  } else {
    $('mapTitle').textContent = available ? 'Navigation costmap' : 'Route planning sandbox';
    $('mapBadge').textContent = available ? 'NAV2 COSTMAP' : 'EXAMPLE MAP';
    if (changed) {clearScene();requestAnimationFrame(resize);}
  }
}

async function refreshScene() {
  if (!sceneRunning || scenePending || $('scenePanel').hidden || document.hidden || !hostActive) return;
  scenePending = true;
  const gen = epoch, generation=sceneGeneration;
  try {
    const r = localCamera ? await fetch('/observation.jpg', {cache:'no-store', signal:AbortSignal.timeout(4500)})
                          : await api('/api/observation.jpg');
    if (!r.ok) throw Error('Observation unavailable');
    await r.arrayBuffer();
    if (gen !== epoch || generation!==sceneGeneration) return;
    const labels = r.headers.get('X-Detected-Objects');
    $('sceneStatus').textContent = labels ? 'Detected · ' + labels : 'No objects recognized · ground clearance unknown';
  } catch {
    if(generation!==sceneGeneration)return;
    $('sceneStatus').textContent = 'No fresh camera observation. Check the webcam service.';
  } finally {scenePending=false;}
}
$('historyTab').onclick=()=>{
  userMapChoice='history';showMapMode();showHistory(data=>{
    if(state.busy){toast('Stop the current mission before loading another route.');return;}
    userMapChoice='route';importMission({points:data.planned,stops:data.stops,zones:data.zones||[]});showMapMode();
  }, archiveRequest);
};
function archiveRequest(path) {
  if (connected) return api('/api' + path);
  if (localCamera) return fetch(path, {cache:'no-store', signal:AbortSignal.timeout(4000)});
  return Promise.reject(Error('Connect the Pi to read its trip archive.'));
}
async function syncArchive(){
  if((!localCamera && !connected) || document.hidden || !hostActive)return;
  try{
    const rows=await (await archiveRequest('/history/trips')).json();
    if(rows.length){const r=await archiveRequest('/history/trips/'+rows[0].id);liveArchive=await r.json();}
    if(!$('scenePanel').hidden)showMapMode();
  }catch{}
}
setInterval(syncArchive,4000);
$('sceneTab').onclick = () => {userMapChoice='scene'; showMapMode();};
$('routeTab').onclick = () => {userMapChoice='route'; showMapMode();};

function steerReason() {
  if (!hostActive) return 'Open the Rover tab to steer.';
  if (!connected) return 'Connect the Pi to steer.';
  if (state.busy) return 'Manual drive is locked during the planned route.';
  if ($('qrDialog').open) return 'Close QR cards to continue scanning.';
  if (operationState().mode === 'Fault') return 'Farmland recovery required.';
  if (operationState().active_task && !autoArmed) return 'Farmland task controls are locked.';
  if (!state.manual_ready) return state.motor_enabled ? 'Press Stop to leave autonomous drive before manual steering.' : 'Waiting for motor-controller feedback. On this Pi, check the USB cable and serial firmware.';
  if (!autoSelected && !$('cameraToggle').checked) return 'Show the rover webcam to enable manual steering.';
  if (!autoSelected && performance.now()-lastFrameTime > 650) return 'Waiting for live camera frames.';
  return '';
}
let autoSelected=false, autoStatus='', autoRun=0, autoArmed=false, autoRetryAt=0;
function startSteeringCamera() {
  if (!connected || !hostActive) return;
  $('cameraToggle').checked = true;
  syncCameraUI();
  cameraTick();
}
function selectSteering(automatic){
  if (operationState().active_task || operationState().fault) return;
  stopDirectQr();releaseDirect();releaseDrive();autoSelected=automatic;autoStatus='';
  $('autoMode').setAttribute('aria-pressed',String(automatic));
  $('manualMode').setAttribute('aria-pressed',String(!automatic));
  $('autoControls').hidden=!automatic;
  document.querySelector('.drive-pad').style.display=automatic?'none':'';
  if (!automatic) startSteeringCamera();
  updateSteering();
}
$('autoMode').onclick=()=>selectSteering(true);
$('manualMode').onclick = async () => {
  if (!connected || (!autoArmed && !operationState().active_task && !operationState().fault && operationState().mode !== 'Automatic')) {
    selectSteering(false);
    return;
  }
  try {
    const result = await (await sendSteering('request_manual')).json();
    if (!result.pending) {
      autoArmed = false;
      driveDirection = null;
      await poll();
      selectSteering(false);
    }
    await poll();
  } catch (error) { toast(error.message); }
};
$('cancelManualRequest').onclick = async () => {
  try { await sendSteering('cancel_manual'); await poll(); }
  catch (error) { toast(error.message); }
};
$('recoverFarmland').onclick = async () => {
  try { await sendSteering('recover'); await poll(); }
  catch (error) { toast(error.message); }
};
async function emergencyStop() {
  if (directMode()) {
    stopDirectQr();
    releaseDirect();
    sendDirect('estop');
    return;
  }
  autoArmed = false;
  driveDirection = null;
  autoStatus = 'Stop requested';
  try { await api('/api/stop', {method:'POST', body:{}}); await poll(); }
  catch (error) { toast(error.message); }
}
$('taskEmergencyStop').onclick = emergencyStop;

function setText(id, value) { roverLabel($(id), value); }

function viewNode(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function operationState() {
  // Older Pi controllers still expose the pre-console state fields.
  const farm = state.farmland;
  return state.operation || {
    mode: state.rover_mode,
    active_task: farm?.locked ? farm : state.qr_task,
    fault: farm?.phase === 'Fault' ? farm.error : null,
  };
}

function updateTaskPanel() {
  const operation = operationState();
  const task = operation.active_task;
  const mode = connectionPending ? 'Connecting' : !connected ? 'Disconnected' :
    operation.mode || (autoArmed ? 'Automatic' : 'Manual');
  const waiting = mode === 'Manual requested';
  const fault = mode === 'Fault';
  const active = Boolean(connected && task);
  const remaining = task?.remaining_s;
  const phaseTime = task?.phase_remaining_s;
  const wait = Number.isFinite(remaining)
    ? 'Task Going On, Wait approximately ' + roverNumber(Math.ceil(remaining)) + ' seconds'
    : 'Task Going On, Wait — estimating remaining time';
  const title = mode === 'Connecting' ? 'Contacting the Pi' : !connected ? 'Pi controls disconnected' :
    fault ? 'Recovery required' : task?.phase || (mode === 'Automatic' ? 'Scanning for QR cards' : state.manual_ready ? 'Ready for manual control' : 'Waiting for motor feedback');
  const message = mode === 'Connecting' ? 'Checking the controller and its current state.' :
    !connected ? (piConnectionError || 'Connect the Pi to view live controls and task status.') :
    fault ? operation.fault || 'Verify the rover and its outputs before recovering.' :
    waiting ? wait : active ? (Number.isFinite(remaining) ? 'Approximately ' + roverNumber(Math.ceil(remaining)) + ' seconds remaining' :
      Number.isFinite(phaseTime) ? 'This phase: approximately ' + roverNumber(Math.ceil(phaseTime)) + ' seconds left' :
        'Manual drive is locked until the task finishes.') :
    mode === 'Automatic' ? autoStatus || operation.scanner_phase || 'Waiting for an eligible card.' :
      operation.last_result?.phase === 'Completed' ? operation.last_result.type + ' completed.' :
        'Select Automatic to start QR scanning, or drive manually.';
  document.documentElement.classList.toggle('rover-disconnected', !connected);
  $('roverTaskPanel').dataset.tone = fault ? 'fault' : waiting ? 'waiting' : active ? 'active' : 'idle';
  setText('roverMode', mode);
  setText('taskTitle', title);
  setText('taskSummary', message);
  const meta = active && [task.type || 'QR movement', task.plot || task.label,
    task.id ? 'Task ' + task.id.slice(0, 8) : '', task.step ? 'Phase ' + task.step + ' of ' + task.steps : '',
    waiting && Number.isFinite(phaseTime) ? 'This phase: ~' + roverNumber(Math.ceil(phaseTime)) + ' s' : ''].filter(Boolean).join(' · ');
  $('taskMeta').hidden = !meta;
  setText('taskMeta', meta || '');
  $('cancelManualRequest').hidden = !waiting;
  $('recoverFarmland').hidden = !fault;
  $('taskEmergencyStop').disabled = !connected;
  $('taskEmergencyStop').hidden = !connected;
  $('taskProgress').hidden = !active || !Number.isFinite(task.phase_progress);
  if (!$('taskProgress').hidden) {
    $('taskProgressMeter').value = task.phase_progress;
    setText('taskProgressLabel', task.progress_source === 'Calibrated timing' ? 'Estimated phase progress' : 'Measured phase progress');
  }
  renderDispensing();
  renderServoMaintenance(operation);
  updatePiMqttReadings();
  renderDirectControls();
}

let servoRequestPending = false;
let lastReportedRoverId;
function renderServoMaintenance(operation) {
  const payload = connected ? state.payload : null;
  const live = payload?.readings;
  const reportedId = live?.mqtt_device_id;
  if (embedded) {
    lastReportedRoverId = reportedId;
    $('usePiMqttId').hidden = piMqttId !== undefined || !reportedId || reportedId === mqttDisplay?.id;
  }
  const caps = live?.capabilities;
  const presets = payload?.servo_presets || [];
  const enabled = Boolean(caps & 4);
  $('payloadMaintenance').hidden = !presets.length;
  setText('payloadServoStatus', !live ? 'Waiting for ESP32 feedback.' :
    !enabled ? 'Servo tests require firmware with servos enabled.' :
      live.servo_active ? 'Servo output active' : 'Servo tests use the Pi’s calibrated presets.');
  for (const [id, servo] of [['payloadServo180','servo180'], ['payloadServo360','servo360'], ['payloadServoDispenser','servo_dispenser']]) {
    $(id).hidden = !presets.includes(servo);
    $(id).disabled = servoRequestPending || !enabled || live?.servo_active !== false ||
      live?.probe !== 'retracted' || !live?.fertilizer_off || !state.manual_ready ||
      !!operation.active_task || !!operation.fault || operation.mode !== 'Manual' || !!driveDirection || autoArmed || !!payload?.servo_operation;
  }
}
async function testServo(servo) {
  if (servoRequestPending) return;
  servoRequestPending = true;
  try {
    await api('/api/payload/servo', {method:'POST', body:{servo}});
    await poll();
  } catch (error) {
    toast(error.message);
  } finally {
    servoRequestPending = false;
  }
}
$('payloadServo180').onclick = () => testServo('servo180');
$('payloadServo360').onclick = () => testServo('servo360');
$('payloadServoDispenser').onclick = () => testServo('servo_dispenser');

async function startDispensing(kind) {
  if (directQr || (directMode() && mqttDisplay?.ultrasonicStop) ||
      mqttDisplay?.inspection?.state === 'running' || dispensingPending || $(kind + 'PumpStart').disabled) return;
  if (kind === 'fertilizer' && directMode()) {
    sendDirect('fertilizer');
    return;
  }
  dispensingPending = true;
  renderDispensing();
  try {
    const replayGuard = state.state_time;
    await api('/api/payload/dispense', {method:'POST', body:{kind, state_time:replayGuard}});
    await poll();
  } catch (error) {
    toast(error.message);
  } finally {
    dispensingPending = false;
    renderDispensing();
  }
}
$('fertilizerPumpStart').onclick = () => startDispensing('fertilizer');
$('waterPumpStart').onclick = () => startDispensing('water');
$('dispensingStop').onclick = emergencyStop;

function renderDispensing() {
  const operation = operationState();
  const options = state.dispensing;
  for (const kind of ['water', 'fertilizer']) {
    $(kind + 'PumpStart').disabled = !connected || dispensingPending || !options?.[kind] ||
      !options.ready || Boolean(operation.active_task || operation.fault || driveDirection || autoArmed);
  }
  $('dispensingStop').hidden = !connected || !state.farmland?.dispense || !state.farmland.active;
  if (!connected) {
    for (const dispenser of ['fertilizer', 'water']) {
      setText(dispenser + 'Status', 'Connect the Pi');
      setText(dispenser + 'Detail', '');
    }
    return;
  }

  const farm = state.farmland;
  const configured = state.payload?.farmland_configured ?? Boolean(state.operating_settings?.farmland);
  const idle = configured ? 'No treatment recorded' : 'Setup required on the Pi';
  const caps = state.payload?.readings?.capabilities;
  const fertilizerMode = !Number.isInteger(caps) ? '' : caps & 8 ? 'ESP32 reports spray mode' :
    !(caps & 2) ? 'Fertilizer output disabled in ESP32 firmware' : '';
  setText('fertilizerStatus', farm?.fertilizer && farm.fertilizer !== 'Not requested' ? farm.fertilizer : fertilizerMode || idle);
  setText('fertilizerDetail', [farm?.plot,
    farm?.low_nutrients?.length ? 'Low nutrients: ' + farm.low_nutrients.join(', ') : ''].filter(Boolean).join(' · '));
  const irrigationConfigured = state.operating_settings?.irrigation_configured;
  const irrigationIdle = !configured ? 'Configure Farmland on the Pi' :
    irrigationConfigured === false ? 'Configure Enviro Advanced on the Pi' : 'Waiting for an irrigation task';
  const irrigationStatus = farm?.tank && farm.tank !== 'Not requested' ? farm.tank : irrigationIdle;
  setText('waterStatus', irrigationStatus);
  setText('waterDetail', [farm?.plot, farm?.warning === 'Acknowledged' ? 'Enviro Advanced acknowledged the low-moisture warning' : '',
    Number.isFinite(farm?.tank_timeout_s) ? 'Confirmation timeout in ' + Math.ceil(farm.tank_timeout_s) + ' s' : ''
  ].filter(Boolean).join(' · '));
}

for (const button of document.querySelectorAll('[data-open-rover-wifi]')) {
  button.onclick = () => $('roverWifiDialog').showModal();
}
$('roverMqttRefresh').onclick = () => {
  window.parent.postMessage({type:'enviroos:rover-refresh'}, location.origin);
};

let mqttDisplay;
let piMqttId;
let mqttHold = null;
let mqttHoldTimer;
let directQr = null;
let directQrStatus = '';

const inspectionFields = {
  wait:['Wait',120,1], lower:['Lower NPK arm',120,1], water:['Sample water input',30,3],
  raise:['Raise NPK arm',120,1], fertilizer:['Run fertilizer relay',4,1],
  'read-npk':['Read NPK',0,0], dispense:['Dispense fertilizer',0,0],
  'dispense-if-low':['Dispense fertilizer if NPK is low',0,0],
};
const inspectionNutrients = ['N','P','K'];
const inspectionKey = 'enviroRover.inspection';
const nextInspectionId = () => Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
const inspectionDefaults = [{action:'wait',seconds:1},{action:'lower',seconds:1},
  {action:'water',seconds:0},{action:'raise',seconds:1}];
let inspectionSaved;
let inspectionRequest;
try {
  const saved = JSON.parse(localStorage.getItem(inspectionKey));
  if (saved?.steps?.length && saved.steps.every(step => Object.hasOwn(inspectionFields, step.action))) inspectionSaved = saved;
} catch {}

function sendInspection(action, id, routine) {
  window.parent.postMessage({type:'enviroos:rover-inspection',action,id,
    steps:routine?.steps,thresholds:routine?.thresholds}, location.origin);
}

function updateInspectionThresholds() {
  const conditional = [...$('inspectionSteps').querySelectorAll('select')]
    .some(select => select.value === 'dispense-if-low');
  $('inspectionThresholds').hidden = !conditional;
  $('inspectionThresholds').disabled = !conditional;
}

function addInspectionStep(step = inspectionDefaults[0]) {
  const list = $('inspectionSteps');
  const row = document.createElement('li');
  const number = document.createElement('span');
  const action = document.createElement('select');
  action.setAttribute('aria-label', roverText('Action'));
  const seconds = document.createElement('input');
  seconds.type = 'number';
  seconds.setAttribute('aria-label', roverText('Wait in seconds'));
  seconds.required = true;
  const remove = document.createElement('button');
  remove.className = 'button';
  remove.type = 'button';
  roverLabel(remove, 'Remove');
  for (const [value, [label]] of Object.entries(inspectionFields)) {
    const option = document.createElement('option');
    option.value = value;
    roverLabel(option, label);
    action.append(option);
  }
  function updateTiming(value) {
    const [, max, initial] = inspectionFields[action.value];
    seconds.min = initial;
    seconds.step = action.value === 'water' ? 3 : 1;
    seconds.max = max;
    seconds.disabled = max === 0;
    seconds.value = max === 0 ? '' : value >= initial ? value : initial;
  }
  action.value = step.action;
  updateTiming(step.seconds);
  action.onchange = () => { updateTiming(); updateInspectionThresholds(); };
  function renumber() {
    [...list.children].forEach((item, i) => item.firstElementChild.textContent = roverNumber(i + 1));
    $('inspectionAdd').disabled = list.children.length >= 12;
    updateInspectionThresholds();
  }
  remove.onclick = () => { row.remove(); renumber(); };
  row.append(number, action, seconds, remove);
  list.append(row);
  renumber();
}

function saveInspection() {
  const steps = [...$('inspectionSteps').children].map(row => ({
    action: row.children[1].value,
    seconds: Number(row.children[2].value),
  }));
  let probeDown = false;
  let measured = false;
  for (const {action} of steps) {
    if (action === 'lower' || action === 'raise') {
      probeDown = action === 'lower';
      if (probeDown) measured = false;
    }
    if (action === 'read-npk') {
      if (!probeDown) {
        setText('inspectionStatus', 'Lower the NPK arm before reading NPK.');
        return false;
      }
      measured = true;
    }
    if (['fertilizer','dispense','dispense-if-low'].includes(action) && probeDown) {
      setText('inspectionStatus', 'Raise the NPK arm before dispensing fertilizer.');
      return false;
    }
    if (action === 'dispense-if-low') {
      if (!measured) {
        setText('inspectionStatus', 'Add a Read NPK step before conditional dispensing.');
        return false;
      }
      measured = false;
    }
  }
  if (!steps.length || probeDown) {
    setText('inspectionStatus', probeDown ? 'Add a Raise NPK arm step before finishing.' : 'Add at least one inspection step.');
    return false;
  }
  const thresholds = Object.fromEntries(inspectionNutrients.map(symbol =>
    [symbol.toLowerCase(), $('inspectionMinimum' + symbol).valueAsNumber]));
  const routine = {steps, thresholds, useQr:$('inspectionUseQr').checked};
  try { localStorage.setItem(inspectionKey, JSON.stringify(routine)); }
  catch { setText('inspectionStatus', 'This browser could not save the inspection routine.'); return false; }
  inspectionSaved = routine;
  setText('inspectionStatus', 'Inspection routine saved.');
  return true;
}

function renderInspectionControls(ready, busy) {
  const operation = mqttDisplay?.inspection;
  const running = operation?.state === 'running';
  $('inspectionRun').disabled = !ready || busy || Boolean(directQr || mqttHold || inspectionRequest);
  $('inspectionStop').hidden = !running;
  const npk = $('inspectionNpkStatus');
  npk.hidden = !operation?.npk;
  if (operation?.npk) {
    const values = inspectionNutrients.map(code => code + ' ' + roverNumber(operation.npk[code.toLowerCase()], 1));
    const low = operation.lowNutrients;
    const decision = low?.length ? roverText('Below minimum') + ' · ' + low.join(', ').toUpperCase() :
      low ? roverText('NPK meets the minimums. Fertilizer skipped.') : '';
    npk.textContent = values.join(' · ') + ' mg/kg' + (decision ? ' — ' + decision : '');
  }
  $('inspectionRun').title = ready ? '' : roverText('Connect the ESP32 over MQTT to run an inspection.');
  if (running && operation.step) {
    const label = roverText(inspectionFields[operation.action]?.[0] || 'Inspection');
    $('inspectionStatus').textContent = roverNumber(operation.step) + '/' + roverNumber(operation.count) + ' · ' + label;
    delete $('inspectionStatus').dataset.roverText;
  } else if (operation && (operation.id !== renderedInspection?.id || operation.state !== renderedInspection?.state) && operation.state !== 'running') {
    setText('inspectionStatus', operation.state === 'completed' ? 'Inspection complete.' : operation.message);
  }
  renderedInspection = operation;
}

let renderedInspection;
for (const step of inspectionSaved?.steps || inspectionDefaults) addInspectionStep(step);
for (const symbol of inspectionNutrients) {
  $('inspectionMinimum' + symbol).value = inspectionSaved?.thresholds?.[symbol.toLowerCase()] ?? '';
}
$('inspectionUseQr').checked = Boolean(inspectionSaved?.useQr);
$('inspectionAdd').onclick = () => addInspectionStep();
$('inspectionForm').onsubmit = event => { event.preventDefault(); saveInspection(); };
$('inspectionRun').onclick = () => {
  if ($('inspectionRun').disabled || !$('inspectionForm').reportValidity() || !saveInspection()) return;
  const id = nextInspectionId();
  inspectionRequest = id;
  $('inspectionRun').disabled = true;
  setText('inspectionStatus', 'Starting inspection…');
  sendInspection('start', id, inspectionSaved);
  setTimeout(() => {
    if (inspectionRequest !== id) return;
    inspectionRequest = null;
    setText('inspectionStatus', 'The inspection did not start.');
  }, 5000);
};
$('inspectionStop').onclick = () => sendInspection('stop');

function stopDirectQr(status = '', sendStop = true) {
  if (!directQr) return;
  const inspecting = directQr.task?.action === 'inspect' &&
    (!directQr.task.completed || mqttDisplay?.directBusy);
  directQr = null;
  directQrStatus = status;
  if (sendStop) sendDirect(inspecting ? 'estop' : 'release');
}

const qrMovements = ['left', 'right', 'forward', 'backward'];
function validQrStep({action, seconds}) {
  return Number.isInteger(seconds) && (
    qrMovements.includes(action) && seconds >= 1 && seconds <= 25 ||
    action === 'wait' && seconds >= 1 && seconds <= 3600 ||
    action === 'stop' && seconds === 0 ||
    action === 'inspect' && seconds >= 0 && seconds <= 120
  );
}

function frontSteeringInterlock(direction) {
  if (!direction || direction === 'reverse') return '';
  if (mqttDisplay?.frontBlocked) return 'Front obstacle detected. Steering stopped.';
  if (direction === 'left' && !mqttDisplay?.frontRangeFresh) return 'Waiting for front ultrasonic readings.';
  return '';
}

function startDirectQrStep(run, now) {
  const {action, seconds} = run.steps[run.step];
  const direction = action === 'backward' ? 'reverse' : qrMovements.includes(action) ? action : null;
  const blocked = frontSteeringInterlock(direction);
  if (blocked) {
    stopDirectQr(blocked);
    return;
  }
  if (direction && now - run.lastScan > QR_MOVING_SCAN_TIMEOUT_MS) {
    stopDirectQr('QR steering stopped because the camera scan became stale.');
    return;
  }
  run.task = {action, direction, deadline: now + (action === 'stop' ? 250 : seconds * 1000)};
  if (action === 'inspect') {
    run.task.ackBy = now + 5000;
    run.task.finishBy = now + 120000;
    run.task.statusRevision = mqttDisplay.firmwareStatusRevision;
    if (inspectionSaved?.useQr) {
      run.task.inspectionId = nextInspectionId();
      const budget = inspectionSaved.steps.reduce((total, step) =>
        total + (step.action === 'water' ? step.seconds * 3 : step.seconds + 8), 8);
      run.task.finishBy = now + budget * 1000;
      sendInspection('start', run.task.inspectionId, inspectionSaved);
    } else sendDirect('mission');
  } else if (direction) sendDirect(direction);
  else sendDirect('release');
  directQrStatus = run.label + ' · ' + roverNumber(run.step + 1) + '/' +
    roverNumber(run.steps.length) + ' · ' + roverText(({inspect:'Inspect', wait:'Wait', stop:'Stop',
      left:'Left', right:'Right', forward:'Forward', backward:'Backward'})[action]);
}

function processDirectQr(run, cards) {
  const now = performance.now();
  run.lastScan = now;
  const shown = new Set(cards.map(card => card?.payload).filter(Boolean));
  for (const [id, absentSince] of run.consumed) {
    if (shown.has(id)) run.consumed.set(id, null);
    else if (absentSince === null) run.consumed.set(id, now);
    else if (now - absentSince >= 1000) run.consumed.delete(id);
  }
  if (cards.some(card => card?.direction === 'stop')) {
    stopDirectQr('Stopped by QR card.');
    return;
  }
  if (run.steps || now < run.nextScan) return;
  const card = cards.filter(c => c && typeof c.payload === 'string' &&
     [...qrMovements,'wait','sequence'].includes(c.direction) &&
     Number.isFinite(c.area) && c.area > 0 && !run.consumed.has(c.payload))
    .sort((a,b) => b.area-a.area || a.payload.localeCompare(b.payload))[0];
  if (!card) return;
  run.consumed.set(card.payload, null);
  const steps = card.direction === 'sequence' ? card.steps : [{action:card.direction, seconds:card.wait}];
  if (!Array.isArray(steps) || !steps.length || steps.length > 20 ||
      !steps.every(step => step && validQrStep(step))) {
    directQrStatus = 'This QR card has an invalid command or duration.';
    return;
  }
  Object.assign(run, {steps, step:0, label:card.label || card.direction});
  startDirectQrStep(run, now);
}

function checkDirectQr(run, now) {
  if (!directMode() || !hostActive || document.hidden || !mqttDisplay?.directReady ||
      mqttDisplay.id !== run.device || (mqttDisplay.directBusy && run.task?.action !== 'inspect')) {
    stopDirectQr('QR steering stopped. Check the ESP32 connection.');
    return false;
  }
  if (run.task?.direction && now - run.lastScan > QR_MOVING_SCAN_TIMEOUT_MS) {
    stopDirectQr('QR steering stopped because the camera scan became stale.');
    return false;
  }
  return true;
}

function tickDirectQr() {
  const run = directQr;
  if (!run) return;
  const now = performance.now();
  if (!checkDirectQr(run, now)) return;
  const task = run.task;
  if (!task) {
    if (run.steps && now >= run.nextScan) startDirectQrStep(run, now);
    return;
  }
  if (task.action === 'inspect') {
    if ((!task.started && now >= task.ackBy) || ((!task.completed || mqttDisplay.directBusy) && now >= task.finishBy)) {
      stopDirectQr('The ESP32 did not confirm inspection.');
      return;
    }
    if (!task.completed || mqttDisplay.directBusy) return;
  }
  if (now >= task.deadline) {
    if (task.direction) sendDirect('release');
    run.task = null;
    run.nextScan = now + 250;
    if (++run.step < run.steps.length) return;
    run.steps = null;
    directQrStatus = 'Scanning for the next eligible QR card.';
    setTimeout(() => { if (directQr === run) updateCameraQR(); }, 250);
  } else if (task.direction) {
    // Keep the parent lease alive only while the camera and telemetry are fresh.
    sendDirect('hold');
  }
}

$('directQrStart').onclick = () => {
  if ($('directQrStart').disabled) return;
  releaseDirect();
  directQrStatus = 'Scanning for an eligible QR card.';
  directQr = {device:mqttDisplay.id, lastScan:0, nextScan:0,
    consumed:new Map(), task:null};
  updateCameraQR();
};
$('directQrStop').onclick = () => stopDirectQr('QR steering stopped.');

const sendDirect = (action) => window.parent.postMessage({
  type:'enviroos:rover-direct', action,
}, location.origin);
$('resetUltrasonicStop').onclick = () => {
  if (!$('resetUltrasonicStop').disabled) sendDirect('reset-ultrasonic-stop');
};
function releaseDirect() {
  if (!mqttHold) return;
  mqttHold = null;
  clearInterval(mqttHoldTimer);
  sendDirect('release');
}
function directMode() {
  const operation = operationState();
  const piOwnsControl = connected && (state.manual_ready || state.busy ||
    operation.active_task || operation.fault || operation.mode === 'Automatic' || autoArmed);
  return embedded && !connectionPending && piMqttId === undefined &&
    !piOwnsControl && Boolean(mqttDisplay?.reading?.expanded);
}
function renderDirectControls() {
  const panel = $('roverDirect');
  const direct = directMode();
  panel.hidden = !direct;
  document.documentElement.classList.toggle('direct-mqtt-control', direct);
  const ready = direct && mqttDisplay?.directReady;
  const busy = Boolean(mqttDisplay?.directBusy);
  const ultrasonicStop = direct && mqttDisplay?.ultrasonicStop;
  const reset = $('resetUltrasonicStop');
  reset.hidden = !ultrasonicStop;
  reset.disabled = !mqttDisplay?.ultrasonicResetReady;
  reset.title = reset.disabled ? roverText('Clear the front sensor and wait for the ESP32 to confirm the stop.') : '';
  const range = $('frontRange');
  range.hidden = !direct;
  $('piDriveSpeed').hidden = direct;
  $('mqttDriveSpeed').hidden = !direct;
  renderInspectionControls(ready, busy);
  if (!ready || busy) releaseDirect();
  if (!direct && directQr) stopDirectQr();
  if (direct) {
    const speeds = mqttDisplay.driveSpeeds;
    $('straightDriveSpeed').textContent = roverNumber(speeds?.straight) + ' PWM';
    $('turnDriveSpeed').textContent = roverNumber(speeds?.turn) + ' PWM';
    setText('taskTitle', 'ESP32 control over MQTT');
    setText('taskSummary', connected ? 'Pi camera connected' : 'Pi camera disconnected');
    $('taskEmergencyStop').hidden = false;
    $('taskEmergencyStop').disabled = mqttDisplay.connection !== 'connected';
    const distance = mqttDisplay.reading?.distance;
    const obstacle = frontSteeringInterlock('forward');
    range.textContent = roverText('Front ultrasonic') + ' · ' +
      (!mqttDisplay.frontRangeFresh ? roverText('Unavailable') :
        Number.isFinite(distance) && distance > 0 ? roverNumber(distance, 1) + ' cm' : roverText('No echo'));
    setText('steerStatus', ultrasonicStop ? 'Ultrasonic emergency stop' : obstacle || (busy ? 'Firmware operation in progress' :
      ready ? 'Hold a direction to drive. Release to stop.' : 'Waiting for ESP32 readings'));
    for (const button of document.querySelectorAll('[data-drive]')) {
      const blocked = frontSteeringInterlock(button.dataset.drive === 'back' ? 'reverse' : button.dataset.drive);
      button.disabled = !ready || busy || autoSelected || Boolean(blocked);
      button.title = blocked ? roverText(blocked) : '';
    }
    const firmwareMission = (mqttDisplay.reading?.mission ?? 0) !== 0 ||
      mqttDisplay.firmwareStatus?.startsWith('FARM MISSION STARTED');
    $('autoMode').disabled = !ready;
    $('autoMode').title = 'ESP32 firmware mission over MQTT';
    $('autoStart').disabled = !ready || busy || Boolean(mqttHold || directQr);
    $('directQrStart').hidden = Boolean(directQr);
    $('directQrStart').disabled = !ready || busy || !connected;
    $('directQrStop').hidden = !directQr;
    $('directQrStart').title = !connected ? 'Connect the Pi camera and QR scanner first.' : '';
    $('manualMode').disabled = busy;
    $('manualMode').setAttribute('aria-pressed', String(!autoSelected));
    $('autoMode').setAttribute('aria-pressed', String(autoSelected));
    $('autoControls').hidden = !autoSelected;
    setText('autoDescription', directQrStatus || (firmwareMission ? 'ESP32 mission running over MQTT.' :
      !connected ? 'Connect the Pi for QR scanning. The firmware mission works without it.' :
      'Each QR card sets the direction and how many seconds to move.'));
    setText('autoStart', 'Start firmware mission');
    $('autoCancelMqtt').hidden = !firmwareMission;
    $('autoCancelMqtt').disabled = !ready;
    if (directQr || ultrasonicStop || mqttDisplay.inspection?.state === 'running') $('waterPumpStart').disabled = true;
    $('fertilizerPumpStart').disabled = !ready || busy || Boolean(directQr);
    setText('fertilizerTitle', 'Rover fertilizer dispenser');
    setText('fertilizerStatus', mqttDisplay.reading?.dispensing ? 'Dispensing' : ready ? 'Ready' : 'Waiting for ESP32 readings');
    setText('fertilizerPumpStart', 'Dispense fertilizer');
  } else {
    for (const button of document.querySelectorAll('[data-drive]')) button.removeAttribute('title');
    $('autoMode').removeAttribute('title');
    setText('autoDescription', 'Scans for the nearest eligible QR card.');
    setText('autoStart', 'Start');
    $('autoCancelMqtt').hidden = true;
    $('directQrStart').hidden = true;
    $('directQrStop').hidden = true;
    setText('fertilizerTitle', 'Rover fertilizer pump');
    setText('fertilizerPumpStart', 'Start fertilizer pump');
  }
  const reply = mqttDisplay?.firmwareStatus || '';
  if ($('roverDirectReply').textContent !== reply) $('roverDirectReply').textContent = reply;
  for (const button of panel.querySelectorAll('[data-mqtt-action]')) {
    button.disabled = !ready || Boolean(directQr) || (busy && !['cancel','pump-off'].includes(button.dataset.mqttAction));
  }
}
function beginDirect(button) {
  if (autoSelected || button.disabled || mqttHold) return;
  mqttHold = button;
  sendDirect(button.dataset.drive === 'back' ? 'reverse' : button.dataset.drive);
  mqttHoldTimer = setInterval(() => sendDirect('hold'), 150);
}
for (const button of document.querySelectorAll('[data-mqtt-action]')) {
  button.onclick = () => {
    if (button.dataset.mqttAction === 'estop') releaseDirect();
    sendDirect(button.dataset.mqttAction);
  };
}
window.addEventListener('blur', () => {stopDirectQr();releaseDirect();});
window.addEventListener('pagehide', () => {stopDirectQr();releaseDirect();});
document.addEventListener('visibilitychange', () => { if (document.hidden) {stopDirectQr();releaseDirect();} });

function updatePiMqttReadings() {
  const reading = connected ? state.payload?.readings : null;
  if (reading?.transport === 'mqtt') {
    const id = reading.mqtt_device_id || '';
    if (id !== piMqttId) {
      piMqttId = id;
      if (embedded) window.parent.postMessage({type:'enviroos:rover-pi-mqtt'}, location.origin);
    }
  }
  if (piMqttId === undefined) return;
  $('roverMqttPanel').hidden = false;
  $('roverMqttRefresh').hidden = true;
  $('roverMqttForm').hidden = true;
  $('roverMqttSettingsHelp').hidden = true;
  $('usePiMqttId').hidden = true;
  renderMqttTelemetry({
    id:piMqttId, connection: connected && reading ? 'connected' : 'closed',
    reading: reading?.transport === 'mqtt' ? {
      water:reading.water_raw, soil:reading.soil_raw, distance:reading.range_cm,
      temperature:reading.temperature_raw, probeAngle:reading.npk_servo_angle,
      dispenserAngle:reading.dispenser_servo_angle,
      light:reading.light_lux, pump:typeof reading.fertilizer_off === 'boolean' ? !reading.fertilizer_off : null,
      n:reading.n_mgkg, p:reading.p_mgkg, k:reading.k_mgkg, servoActive:reading.servo_active,
    } : null,
  }, true);
}

if (embedded) {
  $('roverMqttPanel').hidden = false;
  $('roverMqttSettings').hidden = false;
  $('roverMqttForm').onsubmit = event => {
    event.preventDefault();
    const id = $('roverMqttId').value.trim();
    if (!/^[\x21-\x7e]{0,64}$/.test(id) || /[\/+#]/.test(id)) {
      setText('roverMqttError', 'Use the exact ID from farmrover/<ID>/data.');
      return;
    }
    setText('roverMqttError', 'Device ID saved.');
    $('roverMqttId').blur();
    window.parent.postMessage({type:'enviroos:rover-mqtt-id', id}, location.origin);
  };
  $('usePiMqttId').onclick = () => {
    if (!lastReportedRoverId) return;
    $('roverMqttId').value = lastReportedRoverId;
    $('roverMqttForm').requestSubmit();
  };
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent ||
        event.data?.type !== 'enviroos:rover-telemetry') return;
    const newStatus = mqttDisplay?.firmwareStatusRevision !== event.data.firmwareStatusRevision;
    mqttDisplay = event.data;
    if (mqttDisplay.ultrasonicStop) stopDirectQr('Ultrasonic emergency stop', false);
    const direction = directQr?.task?.direction;
    const blocked = frontSteeringInterlock(direction);
    if (blocked) stopDirectQr(blocked);
    if (mqttHold && frontSteeringInterlock(mqttHold.dataset.drive === 'back' ? 'reverse' : mqttHold.dataset.drive)) {
      releaseDirect();
    }
    const inspectionUpdate = mqttDisplay.inspection;
    if (inspectionRequest && inspectionUpdate?.id === inspectionRequest) inspectionRequest = null;
    const inspectionTask = directQr?.task;
    if (inspectionTask?.inspectionId && inspectionTask.inspectionId === inspectionUpdate?.id) {
      inspectionTask.started = true;
      if (inspectionUpdate.state === 'completed') inspectionTask.completed = true;
      if (inspectionUpdate.state === 'failed') {
        directQr = null;
        directQrStatus = inspectionUpdate.message;
      }
    }
    if (directQr && newStatus) {
      const status = mqttDisplay.firmwareStatus || '';
      const task = directQr.task;
      if (/^(OBSTACLE DETECTED|DRIVE TIMEOUT|ROVER OFFLINE|EMERGENCY STOP)/.test(status)) {
        stopDirectQr(status.startsWith('OBSTACLE DETECTED') ?
          'Front obstacle detected. Steering stopped.' : 'QR steering interrupted by the ESP32.');
      } else if (task?.action === 'inspect' && !task.inspectionId && task.statusRevision !== mqttDisplay.firmwareStatusRevision) {
        if (status.startsWith('FARM MISSION STARTED')) task.started = true;
        if (status === 'FARM MISSION COMPLETED' && task.started) task.completed = true;
        if (/^(MISSION BUSY|MISSION CANCELLED|UNKNOWN COMMAND)/.test(status)) {
          stopDirectQr('The ESP32 rejected or cancelled inspection.');
        }
      }
    }
    if (piMqttId === undefined) renderMqttTelemetry(mqttDisplay);
    renderDirectControls();
  });
}
function renderMqttTelemetry({id, connection, reading, presence, sampleAt, refreshPending}, viaPi = false) {
    if (document.activeElement !== $('roverMqttId')) $('roverMqttId').value = id;
    $('usePiMqttId').hidden = viaPi || !lastReportedRoverId || lastReportedRoverId === id;
    const expanded = !viaPi && (reading?.expanded ?? id === 'device01');
    for (const tile of document.querySelectorAll('[data-expanded-mqtt], [data-pi-mqtt]')) {
      tile.hidden = tile.hasAttribute('data-expanded-mqtt') !== expanded;
    }
    const status = viaPi ? (reading ? 'Live via Pi and private MQTT' : 'Waiting for Pi MQTT readings') :
      !id ? 'Set a Rover MQTT ID in Settings.' : connection !== 'connected' ? 'Connecting to MQTT' :
      reading ? 'Live' : presence === 'offline' ? 'ESP32 offline' : 'Waiting for readings';
    $('roverMqttStatus').textContent = [roverText(status), id].filter(Boolean).join(' · ');
    $('roverMqttSample').textContent = sampleAt && reading
      ? roverText('Last reading') + ' · ' + roverDate(sampleAt, {hour:'numeric', minute:'2-digit', second:'2-digit'}) : '';
    setText('roverMqttRefresh', refreshPending ? 'Waiting for readings' : 'Refresh readings');
    $('roverMqttRefresh').disabled = viaPi || !id || connection !== 'connected' || !!refreshPending;
    $('mqttDrive').parentElement.hidden = viaPi;
    const show = (value, unit) => Number.isFinite(value) ? roverNumber(value, Number.isInteger(value) ? 0 : 1) + ' ' + unit : '—';
    setText('mqttPump', typeof reading?.pump === 'boolean' ? (reading.pump ? 'On' : 'Off') : '—');
    setText('mqttSoil', show(reading?.soil, 'ADC'));
    setText('mqttTemperature', show(reading?.temperature, 'ADC'));
    setText('mqttWater', show(reading?.water, 'ADC'));
    setText('mqttDistance', show(reading?.distance, 'cm'));
    setText('mqttLight', show(reading?.light, 'lx'));
    const npk = [reading?.n, reading?.p, reading?.k];
    setText('mqttNpk', npk.every(Number.isFinite) ? npk.map(value => roverNumber(value)).join(' / ') + ' mg/kg' : '—');
    setText('mqttDrive', typeof reading?.moving === 'boolean' ? (reading.moving ? 'Moving' : 'Stopped') : '—');
    const phases = ['Idle', 'Lowering probe', 'Settling probe', 'Sampling water input', 'Waiting for pump', 'Retracting probe', 'Finishing'];
    setText('mqttMission', phases[reading?.mission] || '—');
    setText('mqttWaterAvg', show(reading?.waterAvg, 'ADC'));
    setText('mqttReportedSpeed', show(reading?.speed, 'PWM'));
    setText('mqttDispensing', typeof reading?.dispensing === 'boolean'
      ? (reading.dispensing ? 'Active' : 'Idle') : '—');
    setText('mqttServo', reading?.servoActive === true ? 'Active' : reading?.servoActive === false ? 'Idle' : '—');
    const angles = [reading?.probeAngle, reading?.dispenserAngle];
    setText('mqttAngles', angles.some(Number.isFinite)
      ? angles.map(value => Number.isFinite(value) ? roverNumber(value) + '°' : '—').join(' / ') : '—');
}

function renderRoverSettings() {
  const root = $('roverSettingsContent'), settings = state.operating_settings;
  root.replaceChildren();
  if (!connected || !settings) {
    root.append(viewNode('p', connected ? 'This Pi does not report configuration. Check its control service version.' : 'Connect the Pi to view its configuration.'));
    return;
  }
  function group(title, entries) {
    const section = viewNode('section', '', 'rover-settings-group');
    const list = viewNode('dl');
    for (const [label, value] of entries) {
      const row = viewNode('div');
      row.append(viewNode('dt', label), viewNode('dd', value));
      list.append(row);
    }
    section.append(viewNode('h3', title), list);
    root.append(section);
  }
  const m = settings.movement, f = settings.farmland;
  group('Movement and calibration', [
    ['Before / after a turn', m.before_turn_rotations + ' / ' + m.after_turn_rotations + ' rotations'],
    ['Forward / backward', m.forward_rotations + ' / ' + m.backward_rotations + ' rotations'],
    ['QR pivot', m.turn_degrees + '° · ±' + m.heading_tolerance_deg + '°'],
    ['Treatment pivot', '90° right'], ['Effective sprocket radius', settings.sprocket_radius_m + ' m'],
    ['Feedback', m.use_localization ? 'Localization, with calibrated timing fallback' : 'Calibrated timing'],
    ['Calibrated PWM settings', settings.calibrated_pwm.join(', ') || 'None configured'],
    ['Phase / stall timeout', m.phase_timeout_s + ' / ' + m.stall_timeout_s + ' s'],
    ['QR re-arm', m.rearm_s + ' s of observed absence'],
    ['Motor power', $('driveSpeedFormula').textContent],
  ]);
  const rates = Object.entries(settings.timing_by_pwm || {}).flatMap(([pwm, values]) =>
    Object.entries(values).map(([direction, rate]) => [pwm + ' PWM · ' + direction,
      rate + (direction === 'left' || direction === 'right' ? ' °/s' : ' rotations/s')]));
  if (rates.length) group('Measured timing rates', rates);
  if (!f) {
    root.append(viewNode('p', 'Farmland hardware and treatment settings are not configured on this Pi.'));
    return;
  }
  group('Soil measurement', [
    ...Object.entries(f.thresholds).map(([name, spec]) => [name === 'moisture' ? 'Moisture minimum' : name.toUpperCase() + ' minimum', spec.threshold + ' ' + spec.unit]),
    ['Probe settling / maximum sample age', f.settle_s + ' / ' + f.sample_max_age_s + ' s'],
  ]);
  group('Treatment and Enviro Advanced', [
    ['Fertilizer / water runtime', f.fertilizer_s + ' / ' + f.irrigation_s + ' s'],
    ['Hardware / irrigation timeout', f.io_timeout_s + ' / ' + f.irrigation_timeout_s + ' s'],
    ['Irrigation status interval', f.tank_poll_s + ' s'],
  ]);
}

$('autoStart').onclick = () => {
  if (directMode()) {
    if (autoSelected && !$('autoStart').disabled) sendDirect('mission');
    return;
  }
  if (!steerReason() && !autoArmed && !driveDirection) {
    autoArmed = true;
    driveDirection = 'automatic';
    autoRun++;
    autoStatus = 'Starting QR scanner';
    startSteeringCamera();
    drivePulse();
  }
};
$('autoCancelMqtt').onclick = () => { if (directMode()) sendDirect('cancel'); };
function updateSteering() {
  const operation = operationState();
  const locked = Boolean(operation.active_task || operation.fault);
  document.documentElement.classList.toggle('rover-locked', locked);
  if (!autoArmed && !driveDirection && autoSelected && operation.mode === 'Manual' && !locked && autoStatus === 'Manual mode') {
    selectSteering(false);
    return;
  }
  updateTaskPanel();
  if (directMode()) return;
  $('autoStart').disabled=!!steerReason() || autoArmed || locked;
  const showAutomatic = autoSelected || (locked && ['Automatic','Manual requested'].includes(operation.mode));
  $('autoMode').setAttribute('aria-pressed', String(showAutomatic));
  $('manualMode').setAttribute('aria-pressed', String(!showAutomatic && operation.mode !== 'Fault'));
  $('autoMode').disabled=locked;
  $('manualMode').disabled=operation.mode === 'Fault' || operation.mode === 'Manual requested';
  $('driveSpeed').disabled=locked;
  $('qrCards').disabled=locked || autoArmed;
  $('connection').disabled=locked;
  if (locked) {
    for (const id of ['connectDialog','roverSettingsDialog','compactHistoryDialog']) {
      if ($(id)?.open) $(id).close();
    }
  }
  if (embedded) $('historyTab').disabled=locked;
  if ($('openRoverSettings')) $('openRoverSettings').disabled=locked;
  const reason = steerReason();
  if (reason && driveDirection) { if (autoArmed) pauseAutomatic(); else releaseDrive(); }
  if (autoArmed && !reason && !driveDirection && !document.hidden) driveDirection='automatic';
  for (const b of document.querySelectorAll('[data-drive]')) {
    b.disabled = Boolean(reason || locked);
    b.classList.toggle('held', b.dataset.drive === driveDirection);
  }
  setText('steerStatus', !connected ? '' : locked ? 'Driving and speed controls are locked while this operation is active.' :
    reason || (autoSelected ? (!autoArmed ? autoStatus || 'Press Start to scan.' : '') :
      driveDirection ? 'Steering · ' + driveDirection : 'Hold a direction to drive. Release to stop.'));
}
function sendSteering(direction) {
  return api('/api/manual', {method:'POST',body:{direction, speed_pwm:drivePWM, run_id:direction==='automatic'?autoRun:undefined, lease_id:lease, seq:++driveSequence, state_time:state.state_time},signal:AbortSignal.timeout(direction==='automatic'?3000:350)});
}
function pauseAutomatic() {
  if (!driveDirection) return;
  driveDirection=null;
  if (connected) sendSteering('stop').catch(()=>{});
}
function releaseDrive() {
  autoArmed=false;
  if (!driveDirection) return;
  driveDirection = null;
  autoStatus='';
  if (connected) sendSteering('stop').catch(()=>{});
}
async function drivePulse() {
  if (drivePending || !driveDirection || performance.now()<autoRetryAt) return;
  if (!hostActive || steerReason() || document.hidden) {if(autoArmed)pauseAutomatic();else releaseDrive();return;}
  drivePending = true;
  const direction = driveDirection, run = autoRun;
  try {
    const reply = await sendSteering(direction);
    if (direction === 'automatic' && autoArmed && run === autoRun) {
      const result = await reply.json();
      if (!autoArmed || run !== autoRun) return;
      autoStatus = result.phase || 'Scanning for the next QR card';
      if (result.finished) {
        autoArmed = false;
        driveDirection = null;
        await poll();
      }
    }
  }
  catch(e) {if(autoArmed){pauseAutomatic();autoRetryAt=performance.now()+800;autoStatus=e.message;}else releaseDrive();toast(e.message);}
  finally {drivePending=false;}
}
for (const b of document.querySelectorAll('[data-drive]')) {
  const press=()=>{if (directMode()) { beginDirect(b); return; } if (!driveDirection && !operationState().active_task && !operationState().fault && !steerReason()) {driveDirection=b.dataset.drive; drivePulse();}};
  b.onpointerdown=e=>{if(e.button!==0)return; b.setPointerCapture(e.pointerId); press();};
  const release = () => { releaseDirect(); releaseDrive(); };
  b.onpointerup=b.onpointercancel=b.onlostpointercapture=release;
  b.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();if(!e.repeat)press();}};
  b.onkeyup=e=>{if(['Enter',' '].includes(e.key))release();};
  b.onblur=release;
}
window.addEventListener('blur',()=>{if(!autoArmed)releaseDrive();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(autoArmed)pauseAutomatic();else releaseDrive();}});
setInterval(()=>{tickDirectQr();updateSteering();drivePulse();},100);
function toggleScene(on){
  sceneRunning=on; clearScene(); $('startScene').disabled=on;$('stopScene').disabled=!on;
  $('sceneStatus').textContent=on?'Waiting for an observation':'Map camera stopped';
  if(on){mapVideo();refreshScene();}
}
$('startScene').onclick=()=>toggleScene(true); $('stopScene').onclick=()=>toggleScene(false);
$('startScene').disabled=true;
document.addEventListener('visibilitychange',()=>document.hidden?clearScene():mapVideo());
setInterval(()=>{mapVideo();refreshScene();},1250);
new ResizeObserver(resize).observe(canvas);setGrid(demoMap());example();rememberEdits=true;restoreDraft();setConnection();setInterval(poll,600);setInterval(cameraTick,350);if(localCamera){$('cameraToggle').checked=true;cameraTick();}

// CSS-hidden iframe documents do not receive visibilitychange. The host sends
// explicit lifecycle events so leaving Rover releases steering and camera reads.
window.addEventListener('message', event => {
  if (!embedded || event.source !== window.parent || event.origin !== location.origin || event.data?.type !== 'enviroos:rover-active') return;
  hostActive = event.data.active === true;
  if (!hostActive) { if(autoArmed)pauseAutomatic();else releaseDrive(); cameraOff(); clearScene(); }
  else { resize(); poll(); cameraTick(); mapVideo(); syncArchive(); }
});
window.addEventListener('message', event => {
  if (embedded && event.source === window.parent && event.origin === location.origin &&
      event.data?.type === 'enviroos:show-dispensing') {
    $('dispensingTitle').focus({preventScroll:true});
    $('dispensingTitle').scrollIntoView({block:'nearest'});
  }
  if (receiveRoverLocale(event)) {
    syncDriveSpeed();
    update();
    if (mqttDisplay && piMqttId === undefined) renderMqttTelemetry(mqttDisplay);
    if ($('qrDialog').open) $('qrFrame').contentWindow?.postMessage({
      type:'enviroos:rover-locale', ...roverLocale()
    }, location.origin);
  }
  if (event.origin !== location.origin || event.source !== $('qrFrame').contentWindow) return;
  if (event.data?.type === 'enviroos:qr-locale-ready') {
    $('qrFrame').contentWindow.postMessage({type:'enviroos:rover-locale', ...roverLocale()}, location.origin);
  }
});
window.addEventListener('pagehide', () => {hostActive = false; releaseDrive(); cameraOff(); clearScene();});
if (embedded) window.parent.postMessage({type:'enviroos:rover-ready'}, location.origin);
if (base && token) {
  $('apiBase').value = base;
  $('apiToken').value = token;
  connect(null, true);
}

$('qrCards').onclick = () => {
  if(autoArmed)pauseAutomatic();else releaseDrive();
  if (!connected && !localCamera) {openConnect(); toast('Connect your Pi to load and save its QR cards.'); return;}
  $('qrFrame').src='qr.html'; $('qrDialog').showModal();
};
$('closeQR').onclick=()=>{$('qrDialog').close();$('qrFrame').removeAttribute('src');};

window.addEventListener('enviroos:themechange',()=>{if(grid){setGrid(grid);draw();}});


if(embedded){
 let heightFrame;
 const reportHeight=()=>{cancelAnimationFrame(heightFrame);heightFrame=requestAnimationFrame(()=>{
  window.parent.postMessage({type:'enviroos:rover-height',height:Math.ceil(Math.max(document.body.getBoundingClientRect().height,
    ...Array.from(document.querySelectorAll('dialog[open]'), dialog=>dialog.getBoundingClientRect().bottom + 8)))+2},location.origin);
 });};
 new ResizeObserver(reportHeight).observe(document.body);
 for (const dialog of document.querySelectorAll('dialog')) {
  new MutationObserver(reportHeight).observe(dialog,{attributes:true,attributeFilter:['open']});
 }
 window.addEventListener('resize',reportHeight);
 window.addEventListener('message',event=>{
  if(event.source!==window.parent||event.origin!==location.origin||event.data?.type!=='enviroos:rover-viewport')return;
  document.documentElement.style.setProperty('--visible-top',Math.max(0,event.data.top)+'px');
  document.documentElement.style.setProperty('--visible-height',Math.max(200,event.data.height)+'px');
 });
 reportHeight();
}

// A single compact driving console replaces the long planning dashboard.
if(embedded){
 document.documentElement.classList.add('simple-rover');
 $('roverTaskPanel').after($('roverMqttPanel'));
 const toolbar=document.querySelector('header .top-meta');
 toolbar?.append($('qrCards'));
 const historyDialog=document.createElement('dialog');historyDialog.id='compactHistoryDialog';
 const closeHistory=document.createElement('button');closeHistory.type='button';closeHistory.className='button';closeHistory.textContent='Close history';closeHistory.onclick=()=>historyDialog.close();
 historyDialog.append(closeHistory,$('historyPanel'));document.body.append(historyDialog);
 historyDialog.addEventListener('toggle',()=>window.dispatchEvent(new Event('resize')));
 toolbar?.append($('historyTab'));
 $('historyTab').addEventListener('click',()=>{historyDialog.showModal();});
}

const roverSettings = viewNode('button', '', 'button rover-settings-button');
roverSettings.innerHTML = '<svg class="icon" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16M9 5v4m6 1v4m-5 1v4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span data-rover-text="Settings">Settings</span>';
roverSettings.querySelector('svg').setAttribute('viewBox', '0 0 24 24');
roverSettings.setAttribute('aria-label', 'Rover settings');
roverSettings.title = 'Rover settings';
roverSettings.type = 'button';
roverSettings.id = 'openRoverSettings';
roverSettings.onclick = () => {
  renderRoverSettings();
  renderServoMaintenance(operationState());
  $('roverSettingsDialog').showModal();
};
document.querySelector('header .top-meta').append(roverSettings);
