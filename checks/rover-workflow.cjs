const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
(async () => {
 const browser = await puppeteer.launch({executablePath:process.env.CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const page = await browser.newPage();
  await page.setViewport({width:1440,height:1000});
  const errors=[], calls=[];let automaticPulses=0, manualReady=true, mode='Manual', scenario='idle';
  page.on('pageerror',e=>errors.push(e.message));
  await page.evaluateOnNewDocument(()=>{
   localStorage.setItem('enviroos.lang','en');
   localStorage.setItem('enviroos.auth',JSON.stringify({name:'Integration check',mainModel:'Rover',assistantModel:'none'}));
   localStorage.setItem('enviroos.profile',JSON.stringify({onboarded:true}));
   const original=window.fetch.bind(window);
   window.fetch=async (url, options={})=>{
    if(String(url).includes('18888/api/camera.mjpg')){
     const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;
     const image=Uint8Array.from(atob(canvas.toDataURL('image/jpeg').split(',')[1]),c=>c.charCodeAt(0));
     let timer;
     const stream=new ReadableStream({start(controller){
      const send=()=>{controller.enqueue(new TextEncoder().encode('--frame\r\nContent-Type: image/jpeg\r\nContent-Length: '+image.length+'\r\n\r\n'));controller.enqueue(image);controller.enqueue(new TextEncoder().encode('\r\n'));};
      send();timer=setInterval(send,80);
      options.signal?.addEventListener('abort',()=>{clearInterval(timer);controller.close();},{once:true});
     },cancel(){clearInterval(timer);}});
     return new Response(stream,{headers:{'Content-Type':'multipart/x-mixed-replace; boundary=frame'}});
    }
    return original(url,options);
   };
  });
  await page.setRequestInterception(true);
  const cards=[{payload:'left',label:'Left',direction:'left',wait:0}];
  page.on('request',async req=>{
   if(!req.url().startsWith('http://127.0.0.1:18888/')) return req.continue();
   const path=new URL(req.url()).pathname;
   calls.push({path,method:req.method(),headers:req.headers(),body:req.postData()});
   const headers={'Access-Control-Allow-Origin':new URL(process.env.APP_URL || 'http://127.0.0.1:5173').origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
   if(req.method()==='OPTIONS')return req.respond({status:204,headers});
   assert.equal(req.headers().authorization,'Bearer integration-test-token-123456789');
   let data={};
   if(path==='/api/state') {
    const soil=Object.fromEntries(['n','p','k','moisture'].map((key,i)=>[key,{
      value: i===0 ? 12 : 38, unit: i===3 ? '% VWC' : 'mg/kg', threshold:20, low:i===0}]));
    const farmland=['idle','qr','servo'].includes(scenario) ? null : {
      id:'mock-farmland-001', type:'Farmland inspection', plot:'North field',
      phase:scenario==='fault'?'Fault':scenario==='complete'?'Completed':'Watering',
      locked:scenario!=='complete', active:scenario==='farm', soil:scenario==='fault'?null:soil,
      measured_at:1700000000, probe:'Retracted', phase_remaining_s:scenario==='farm'?12:null,
      fertilizer:'Completed', low_nutrients:['N'], warning:'Acknowledged',
      tank:scenario==='fault'?'Shutdown unconfirmed':scenario==='farm'?'Watering':'Completed',
      error:scenario==='fault'?'Tank confirmation timed out':null, outputs_stopped:scenario==='complete',
    };
    const active_task=scenario==='qr'?{type:'QR movement',label:'Right',phase:'Turning right',
      step:2,steps:3,remaining_s:0,phase_progress:.4,progress_source:'Localization'}:
      scenario==='servo'?{type:'Payload maintenance',phase:'Testing positional servo'}:farmland?.locked?farmland:null;
    data={protocol:'field-rover-v1',manual_ready:manualReady,motor_enabled:false,
      state_time:123,busy:false,map_revision:null,can_start:false,robot:null,farmland,
      payload:{readings:{soil_raw:2400,water_raw:0,range_cm:18.2,light_lux:115,
        npk_available:true,probe:'retracted',fertilizer_off:true,capabilities:7,servo_active:scenario==='servo'},
        farmland_configured:true,servo_presets:['servo180'],servo_operation:scenario==='servo'?'servo180':null},
      operation:{mode,active_task,last_result:null,fault:farmland?.error},
      operating_settings:{movement:{before_turn_rotations:5,after_turn_rotations:3,
        forward_rotations:5,backward_rotations:5,turn_degrees:90,heading_tolerance_deg:2,
        use_localization:true,phase_timeout_s:25,stall_timeout_s:2,rearm_s:1},
        sprocket_radius_m:.033,calibrated_pwm:[],farmland:null}};
   }
   else if(path==='/api/payload/servo') {
    assert.deepEqual(JSON.parse(req.postData()),{servo:'servo180'});
    scenario='servo';
   }
   else if(path==='/api/qr/cards'){
    if(req.method()==='POST')cards.push({...JSON.parse(req.postData()),payload:'enviro-test'});
    data=cards;
   } else if(path.startsWith('/api/qr/card/')) return req.respond({status:200,headers,contentType:path.endsWith('/pdf')?'application/pdf':'image/png',body:Buffer.from(path.endsWith('/pdf')?'%PDF-1.4\n': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=',path.endsWith('/pdf')?'utf8':'base64')});
   else if(path==='/api/history/trips') data=[{id:1,started:'2026-11-16T10:00:00',status:'Travel recorded'}];
   else if(path==='/api/history/trips/1') data={planned:[[0,0],[1,0]],samples:[[0,0,0],[1,1,0]],stops:{},zones:[],obstacles:[],sightings:[]};
   else if(path==='/api/qr/scan') data=[];
   else if(path==='/api/manual') {const direction=JSON.parse(req.postData()).direction;
    if(direction==='request_manual')mode='Manual requested';
    if(direction==='cancel_manual')mode='Automatic';
    const automatic=direction==='automatic';if(automatic)automaticPulses++;data={ok:true,pending:direction==='request_manual',phase:automatic&&automaticPulses>10?'Armed · waiting for next direction card':'Driving'};}
   await req.respond({status:200,headers,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173',{waitUntil:'networkidle2'});
  await page.evaluate(()=>EnviroOS.UI.go('rover'));
  await page.waitForSelector('#rover-mission-control');
  const handle=await page.$('#rover-mission-control');const rover=await handle.contentFrame();
  await rover.waitForSelector('#connection');
  await rover.waitForFunction(()=>document.documentElement.classList.contains('embedded'));
  const before=await rover.$eval('#pointCount',e=>e.textContent);
  await page.evaluate(()=>{EnviroOS.UI.render();EnviroOS.UI.go('home');EnviroOS.UI.go('rover');});
  assert.equal(await rover.$eval('#pointCount',e=>e.textContent),before);
  assert.equal((await (await page.$('#rover-mission-control')).contentFrame())._id,rover._id);
  await rover.click('#connection');
  assert.equal(await rover.$eval('#apiBase',e=>e.value),'http://127.0.0.1:8088');
  await rover.$eval('#apiBase',e=>e.value='http://127.0.0.1:18888');
  await rover.type('#apiToken','integration-test-token-123456789');
  await rover.click('#connectForm button[type=submit]');
  await rover.waitForFunction(()=>document.querySelector('#connection').classList.contains('live'));


  const title = text => rover.waitForFunction(expected => document.querySelector('#taskTitle').textContent.includes(expected),{},text);
  await title('Ready for manual control');
  assert.match(await rover.$eval('#resultSummary',e=>e.textContent),/No measurements/);
  await rover.click('#openRoverSettings');
  assert.match(await rover.$eval('#roverSettingsContent',e=>e.textContent),/5 \/ 3 rotations/);
  await rover.click('#roverSettingsDialog form button');
  assert.equal(await rover.$eval('#roverSettingsDialog',e=>e.open),false);

  await rover.click('#roverResults summary');
  await rover.waitForFunction(()=>document.querySelector('#roverResults').open);
  assert.equal(await rover.$eval('#payloadWater',e=>e.textContent),'0 ADC');
  assert.equal(await rover.$eval('#payloadRange',e=>e.textContent),'18.2 cm');
  await rover.click('#payloadServo180');
  await title('Testing positional servo');
  assert(await rover.$eval('#payloadServo180',e=>e.disabled));
  assert(await rover.$eval('[data-drive=forward]',e=>e.disabled));
  await rover.click('#roverResults summary');

  mode='Automatic'; scenario='farm';
  await title('Watering');
  assert(await rover.$eval('[data-drive=forward]',e=>e.disabled));
  await rover.click('#manualMode');
  await rover.waitForFunction(()=>document.querySelector('#taskSummary').textContent.includes('estimating remaining time'));
  await rover.click('#roverResults summary');
  await rover.waitForFunction(()=>document.querySelector('#roverResults').open);
  assert.match(await rover.$eval('#taskDetails',e=>e.textContent),/12 mg\/kg.*Low/s);
  await page.screenshot({path:'/tmp/enviro-rover-workflow-desktop.png',fullPage:true});
  await rover.click('#cancelManualRequest');
  await rover.waitForFunction(()=>document.querySelector('#cancelManualRequest').hidden);

  scenario='qr'; mode='Manual requested';
  await title('Turning right');
  assert.match(await rover.$eval('#taskSummary',e=>e.textContent),/approximately 0 seconds/);
  assert(await rover.$eval('[data-drive=forward]',e=>e.disabled));
  assert.equal(await rover.$eval('#taskProgressMeter',e=>e.value),.4);
  scenario='complete'; mode='Manual';
  await title('Ready for manual control');
  assert.match(await rover.$eval('#resultSummary',e=>e.textContent),/Completed/);

  await page.setViewport({width:390,height:844});
  await page.evaluate(()=>{localStorage.setItem('enviroos.theme','dark');EnviroOS.UI.applyTheme();window.scrollTo(0,0);});
  await rover.waitForFunction(()=>document.documentElement.dataset.enviroTheme==='dark');
  scenario='fault';mode='Fault';
  await title('Recovery required');
  assert.match(await rover.$eval('#taskSummary',e=>e.textContent),/confirmation timed out/);
  assert.equal(await rover.$eval('#taskEmergencyStop',e=>e.disabled),false);
  assert(await rover.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1));
  await page.screenshot({path:'/tmp/enviro-rover-workflow-phone.png',fullPage:true});
  await rover.click('#taskEmergencyStop');
  for(let i=0;i<20&&!calls.some(c=>c.path==='/api/stop'&&c.method==='POST');i++) await new Promise(r=>setTimeout(r,50));
  assert(calls.some(c=>c.path==='/api/stop'&&c.method==='POST'));

  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>EnviroOS.UI.go('rover'));
  await page.waitForSelector('#rover-mission-control');
  const reopened=await(await page.$('#rover-mission-control')).contentFrame();
  await reopened.waitForFunction(()=>document.querySelector('#taskTitle')?.textContent.includes('Recovery required'));
  assert(await reopened.$eval('[data-drive=forward]',e=>e.disabled));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: empty state, settings, active farmland, pending manual mode, zero estimate lock, successful completion, emergency stop, fault, mobile dark theme and authoritative reconnect');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
