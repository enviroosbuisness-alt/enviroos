const el = tag => document.createElement(tag);
const byId = id => document.getElementById(id);
let locationFix;
try {locationFix=JSON.parse(localStorage.getItem('roverSunLocation'));} catch {}
function isNight(now=new Date()){
  if(!locationFix) return matchMedia('(prefers-color-scheme: dark)').matches;
  const rad=Math.PI/180, day=(now-Date.UTC(now.getUTCFullYear(),0,1))/86400000;
  const g=2*Math.PI*(day-.5)/365;
  const decl=.006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g);
  const eq=229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g));
  const hour=(now.getUTCHours()*60+now.getUTCMinutes()+eq+4*locationFix.lon)/4-180;
  const lat=locationFix.lat*rad;
  return Math.sin(lat)*Math.sin(decl)+Math.cos(lat)*Math.cos(decl)*Math.cos(hour*rad)<Math.sin(-.833*rad);
}
function repaintTheme(){document.documentElement.classList.toggle('night-map',isNight());}
repaintTheme(); setInterval(repaintTheme,30000);
byId('sunset').onclick=()=>navigator.geolocation?.getCurrentPosition(p=>{
  locationFix={lat:p.coords.latitude,lon:p.coords.longitude};
  localStorage.setItem('roverSunLocation',JSON.stringify(locationFix));repaintTheme();
  byId('sunset').textContent='Local sunset enabled';
},()=>{byId('sunset').textContent='Location unavailable · using device theme';});
if(locationFix)byId('sunset').textContent='Local sunset enabled';

const ns='http://www.w3.org/2000/svg';
function shape(parent,name,attributes){
  const n=document.createElementNS(ns,name);
  for(const [key,value] of Object.entries(attributes))n.setAttribute(key,value);
  parent.append(n);return n;
}
export function renderMap(host, data, preview=false){
  host.replaceChildren();
  const route=data.planned||[], samples=data.samples||[], trail=samples.map(s=>s.slice(1)), path=trail.length?trail:route;
  if(!path.length){host.textContent='Waiting for a route or measured rover position.';return;}
  const blocks=data.obstacles||[], corners=blocks.map(([x,y,w,h,a])=>[[0,0],[w,0],[w,h],[0,h]].map(([i,j])=>[x+i*Math.cos(a)-j*Math.sin(a),y+i*Math.sin(a)+j*Math.cos(a)]));
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  function bound([x,y]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  route.forEach(bound);trail.forEach(bound);corners.forEach(poly=>poly.forEach(bound));
  const scale=Math.min(548/Math.max(x1-x0,.5),270/Math.max(y1-y0,.5));
  const px=([x,y])=>[300+(x-(x0+x1)/2)*scale,165-(y-(y0+y1)/2)*scale];
  const svg=shape(host,'svg',{viewBox:'0 0 600 330',class:'journey-map',role:'img','aria-label':'Planned route, recorded track and mapped obstacles'});
  for(const poly of corners)shape(svg,'polygon',{points:poly.map(px).join(' '),fill:'#dd403f','fill-opacity':.32});
  shape(svg,'polyline',{points:route.map(px).join(' '),fill:'none',stroke:'#ac7946',class:'route-plan','stroke-width':3,'stroke-dasharray':'6 5'});
  for(const idx of Object.keys(data.stops||{})){if(route[idx]){const [cx,cy]=px(route[idx]);shape(svg,'circle',{cx,cy,r:4,fill:'#cb8342'});}}
  const line=shape(svg,'polyline',{fill:'none',stroke:'#16816a',class:'route-track','stroke-width':4});
  const rover=shape(svg,'g',{});
  for(const y of [-10,5]){shape(rover,'rect',{x:-12,y,width:24,height:5,rx:2,fill:'#192422'});for(const x of [-9,-3,3,9])shape(rover,'rect',{x,y,width:2,height:5,fill:'#67736e'});}
  shape(rover,'rect',{x:-10,y:-6,width:21,height:12,rx:3,fill:'#41684d',stroke:'#172a20'});
  for(const y of [-5,2])shape(rover,'rect',{x:8,y,width:4,height:3,rx:1,fill:'#ffdf85'});
  const coords=path.map(px), times=[0];
  for(let i=1;i<coords.length;i++)times.push(times[i-1]+(trail.length?Math.max(.001,samples[i][0]-samples[i-1][0]):Math.max(.01,Math.hypot(coords[i][0]-coords[i-1][0],coords[i][1]-coords[i-1][1]))));
  let animation=0;
  function frame(t){
    const target=t*times.at(-1);let i=1;
    while(i<times.length-1 && times[i]<target)i++;
    const a=coords[i-1],b=coords[i]||a,f=coords[i]?(target-times[i-1])/(times[i]-times[i-1]):0;
    const pos=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
    rover.setAttribute('transform','translate('+pos.join(' ')+') rotate('+Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI+')');
    line.setAttribute('points',trail.length||preview?[...coords.slice(0,i),pos].join(' '):'');
  }
  frame(trail.length?1:0);
  const button=el('button');button.textContent=trail.length?'Replay recorded track':'Preview planned route';host.append(button);
  button.disabled=coords.length<2;
  button.onclick=()=>{cancelAnimationFrame(animation);const start=performance.now();const tick=now=>{
    if(!svg.isConnected)return;const t=Math.min(1,(now-start)/8000);frame(t);if(t<1)animation=requestAnimationFrame(tick);
  };animation=requestAnimationFrame(tick);};
  const coordinates=el('details'), title=el('summary');
  title.textContent='Map coordinates (metres)'; coordinates.append(title);
  function list(label, points){
    if(!points.length)return;
    const heading=el('strong');heading.textContent=label;coordinates.append(heading);
    const values=el('pre');values.style.maxHeight='12rem';values.style.overflow='auto';
    values.textContent=points.map(([x,y],i)=>(i+1)+'   X '+x.toFixed(3)+'   Y '+y.toFixed(3)).join('\n');
    coordinates.append(values);
  }
  list('Planned waypoints',route);list('Measured rover track',trail);
  list('Mapped obstacle corners',blocks.map(b=>b.slice(0,2)));
  host.append(coordinates);
  const caption=el('p');caption.textContent=trail.length?'Dashed line · plan     Green line · recorded travel     Red · observed obstacle area':'Route preview · dashed plan     Red · mapped obstacle area';host.append(caption);
}
export async function showHistory(reuse, request = path => fetch(path, {cache:'no-store'})){
  const host=byId('historyRows');host.textContent='Loading trips…';
  try{
    const res=await request('/history/trips');if(!res.ok)throw Error();
    const rows=await res.json();host.replaceChildren();
    if(!rows.length){host.textContent='No recorded trips yet. Localized trips appear here as the rover travels.';return;}
    const days=[...new Set(rows.map(r=>r.started.slice(0,10)))].sort();
    for(const day of days.toReversed ? days.toReversed() : [...days].reverse()){
      const group=el('details'), title=el('summary');title.textContent='Day '+(days.indexOf(day)+1)+' · '+day;group.append(title);host.append(group);
      for(const row of rows.filter(r=>r.started.startsWith(day))){
        const item=el('details'), name=el('summary'), body=el('div');
        name.textContent=row.started.slice(11,16)+' · '+row.status;item.append(name,body);group.append(item);
        item.ontoggle=async()=>{if(!item.open)return;try{
          const response=await request('/history/trips/'+row.id);if(!response.ok)throw Error();
          const data=await response.json();renderMap(body,data);
          for(const s of data.sightings){const note=el('p');note.textContent=new Date(s.at*1000).toLocaleTimeString()+' · Camera saw '+s.labels.join(', ');body.append(note);}
          if(!data.planned.length && data.samples.length>=2 && data.samples.length<=5000){data.planned=data.samples.map(s=>s.slice(1));}
          if(data.planned.length>=2){const load=el('button');load.textContent='Use this route';load.onclick=()=>reuse(data);body.append(load);}
        }catch{body.textContent='Could not load this trip. Close and reopen to retry.';}};
      }
    }
  }catch{host.textContent='Connect the Pi to read its trip archive, then reopen History.';}
}
