const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
(async () => {
 const browser = await puppeteer.launch({executablePath:process.env.CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const page = await browser.newPage();
  await page.setViewport({width:1440,height:1000});
  const errors=[], calls=[];let automaticPulses=0, manualReady=true, mode='Manual', scenario='idle', manualPump=null, piUnavailable=true;
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
  let qrScan = [];
  let qrScanDelay = 0;
  const cards=[{payload:'left',label:'Left',direction:'left',wait:0}];
  page.on('request',async req=>{
   if(!req.url().startsWith('http://127.0.0.1:18888/')) {
    const origin = new URL(process.env.APP_URL || 'http://127.0.0.1:5173').origin;
    return req.url().startsWith(origin + '/') || /^(blob|data):/.test(req.url()) ? req.continue() : req.abort();
   }
   const path=new URL(req.url()).pathname;
   calls.push({path,method:req.method(),headers:req.headers(),body:req.postData()});
   const headers={'Access-Control-Allow-Origin':new URL(process.env.APP_URL || 'http://127.0.0.1:5173').origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
   if(req.method()==='OPTIONS')return req.respond({status:204,headers});
   assert.equal(req.headers().authorization,'Bearer integration-test-token-123456789');
   let data={};
   if(path==='/api/state' && piUnavailable) {
    return req.respond({status:503, headers, contentType:'application/json',
      body:JSON.stringify({error:'Pi control API is unavailable.'})});
   }
   if(path==='/api/state') {
    const soil=Object.fromEntries(['n','p','k','moisture'].map((key,i)=>[key,{
      value: i===0 ? 12 : 38, unit: i===3 ? '% VWC' : 'mg/kg', threshold:20, low:i===0}]));
    const farmland=manualPump ? {dispense:manualPump, active:true, locked:true,
      phase:manualPump==='water'?'Watering':'Dispensing fertilizer',
      type:'Manual dispensing', tank:manualPump==='water'?'Watering':'Not requested',
      fertilizer:manualPump==='fertilizer'?'Dispensing':'Not requested'} :
     ['idle','qr','servo','dispensers'].includes(scenario) ? null : {
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
      state_time:123,dispensing:{water:scenario==='dispensers',fertilizer:true,ready:!manualPump&&mode==='Manual'},busy:false,map_revision:null,can_start:false,robot:null,farmland,
      payload:{readings:{soil_raw:2400,water_raw:0,range_cm:18.2,light_lux:115,
        npk_available:true,probe:'retracted',fertilizer_off:true,capabilities:7,servo_active:scenario==='servo',
        ...(scenario==='private-mqtt' ? {transport:'mqtt',mqtt_device_id:'pi-test',temperature_raw:72,n_mgkg:5,p_mgkg:8,k_mgkg:13} : {})},
        farmland_configured:true,servo_presets:['servo180'],servo_operation:scenario==='servo'?'servo180':null},
      operation:{mode,active_task,last_result:null,fault:farmland?.error},
      operating_settings:{irrigation_configured:scenario!=='idle',movement:{before_turn_rotations:5,after_turn_rotations:3,
        forward_rotations:5,backward_rotations:5,turn_degrees:90,heading_tolerance_deg:2,
        use_localization:true,phase_timeout_s:25,stall_timeout_s:2,rearm_s:1},
        sprocket_radius_m:.033,calibrated_pwm:[220],timing_by_pwm:{220:{forward:10,backward:10,left:180,right:180}},farmland:null}};
   }
   else if(path==='/api/payload/dispense') {
    const {kind, state_time} = JSON.parse(req.postData());
    assert(['water', 'fertilizer'].includes(kind));
    assert.equal(state_time, 123);
    manualPump = kind;
    data = {task_id:'mock-dispense-' + kind};
   }
   else if(path==='/api/stop') manualPump = null;
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
   else if(path==='/api/qr/scan') {
    const delay = qrScanDelay;
    if (delay) await new Promise(resolve=>setTimeout(resolve, delay));
    data=qrScan;
   }
   else if(path==='/api/manual') {const direction=JSON.parse(req.postData()).direction;
    if(direction==='request_manual')mode='Manual requested';
    if(direction==='cancel_manual')mode='Automatic';
    const automatic=direction==='automatic';if(automatic)automaticPulses++;data={ok:true,pending:direction==='request_manual',phase:automatic&&automaticPulses>10?'Armed · waiting for next direction card':'Driving'};}
   await req.respond({status:200,headers,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173',{waitUntil:'networkidle2'});
  await page.evaluate(()=>{
    EnviroOS.UI.go('soil');
    window.roverTestSubscriptions = [];
    window.roverTestPublished = [];
    EnviroOS.MqttClient = class {
      constructor(options) { window.roverTestClient = this; this.options = options; }
      subscribe(topic) { window.roverTestSubscriptions.push(topic); }
      publish(topic, payload) { window.roverTestPublished.push({topic, payload, time:performance.now()}); return true; }
      open() { this.options.onState('connected'); }
      close() { this.options.onState('closed'); }
    };
    EnviroOS.UI.go('rover');
  });
  await page.waitForSelector('#rover-mission-control');
  const handle=await page.$('#rover-mission-control');const rover=await handle.contentFrame();
  await rover.waitForSelector('#connection');
  await rover.waitForFunction(()=>document.documentElement.classList.contains('embedded'));
  await page.waitForFunction(()=>roverTestSubscriptions.includes('farmrover/device01/data'));
  await page.evaluate(()=>{
    const {onMessage}=roverTestClient.options;
    onMessage('farmrover/device01/status','ROVER ONLINE - SEND HELP FOR COMMANDS');
    window.emitExpandedSample = (busy = true, probeAngle = 45, distance = 40, npk, dispensing = busy) => roverTestClient.options.onMessage('farmrover/device01/data',JSON.stringify({
      water_raw:1344, water_avg:1200, temperature_raw:812, distance_cm:distance,
      pump:false, dispensing, npk_servo_angle:probeAngle, dispenser_servo_angle:90,
      mission:busy ? 3 : 0, speed:220, npk
    }));
    emitExpandedSample();
  });
  await rover.waitForFunction(()=>document.querySelector('#mqttWaterAvg').textContent==='1,200 ADC');
  assert.equal(await rover.$eval('#mqttMission',e=>e.textContent),'Sampling water input');
  assert.equal(await rover.$eval('#mqttDispensing',e=>e.textContent),'Active');
  assert.equal(await rover.$eval('#mqttReportedSpeed',e=>e.textContent),'220 PWM');
  assert.equal(await rover.$eval('#mqttNpk',e=>e.closest('div').hidden),true);
  assert.equal(await rover.$eval('#connection',e=>e.classList.contains('live')),false);
  await page.evaluate(()=>emitExpandedSample(false));
  await rover.waitForFunction(()=>!document.querySelector('[data-drive="forward"]').disabled);
  assert(await rover.$eval('#piDriveSpeed', panel=>panel.hidden));
  assert.equal(await rover.$eval('#straightDriveSpeed', output=>output.textContent),'200 PWM');
  assert.equal(await rover.$eval('#turnDriveSpeed', output=>output.textContent),'255 PWM');
  for (const [direction, command, pwm] of [['forward','R',200], ['left','B',255], ['right','F',255], ['back','L',200]]) {
    await page.evaluate(()=>{roverTestPublished.length=0;});
    const selector = `[data-drive="${direction}"]`;
    await rover.$eval(selector, button=>button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})));
    await page.waitForFunction(expected=>roverTestPublished.some(item=>item.payload===expected),{},command);
    await rover.$eval(selector, button=>button.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter'})));
    await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='STOP');
    const sent = await page.evaluate(()=>roverTestPublished.map(({topic,payload})=>[topic,payload]));
    assert(sent.every(([topic])=>topic==='farmrover/device01/cmd'));
    assert.equal(sent[0][1],'SPEED ' + pwm);
    assert(sent.slice(1,-1).every(([, payload])=>payload===command || payload === 'DISTANCE'));
  }
  await page.evaluate(()=>{roverTestPublished.length=0;});
  await rover.$eval('[data-drive="left"]', button=>button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})));
  await page.waitForFunction(()=>roverTestPublished.some(item=>item.payload==='DISTANCE'));
  await page.evaluate(()=>roverTestClient.options.onMessage('farmrover/device01/status','DISTANCE: 12.0 CM'));
  await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='STOP');
  await rover.waitForFunction(()=>document.querySelector('[data-drive="forward"]').disabled &&
    document.querySelector('[data-drive="left"]').disabled &&
    document.querySelector('[data-drive="right"]').disabled &&
    !document.querySelector('[data-drive="back"]').disabled);
  await page.evaluate(()=>emitExpandedSample(false,45,-1));
  await rover.waitForFunction(()=>document.querySelector('#frontRange').textContent.includes('No echo'));
  assert(await rover.$eval('[data-drive="left"]', button=>button.disabled));
  await page.evaluate(()=>emitExpandedSample(false,45,40));
  await rover.waitForFunction(()=>!document.querySelector('[data-drive="left"]').disabled);
  const lastStop = await page.evaluate(()=>roverTestPublished.findLastIndex(item=>item.payload==='STOP'));
  assert.equal(await page.evaluate(last=>roverTestPublished.slice(last+1).some(item=>item.payload==='B'),lastStop), false);
  await page.evaluate(()=>{roverTestPublished.length=0;emitExpandedSample(false,0,5.1);});
  await rover.waitForFunction(()=>!document.querySelector('[data-drive="back"]').disabled);
  await rover.$eval('[data-drive="back"]', button=>button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})));
  await page.waitForFunction(()=>roverTestPublished.some(item=>item.payload==='L'));
  await page.evaluate(()=>roverTestClient.options.onMessage('farmrover/device01/status','DISTANCE: 5.0 CM'));
  await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='ESTOP');
  await rover.waitForFunction(()=>document.querySelector('#steerStatus').textContent==='Ultrasonic emergency stop' &&
    [...document.querySelectorAll('[data-drive]')].every(button=>button.disabled));
  await page.evaluate(()=>emitExpandedSample(false,0,40));
  assert(await rover.$eval('#resetUltrasonicStop', button=>button.disabled));
  await page.evaluate(()=>{
    roverTestClient.options.onMessage('farmrover/device01/status','EMERGENCY STOP - MOTORS/PUMP/SERVOS STOPPED');
    emitExpandedSample(false,0,-1);
  });
  await rover.waitForFunction(()=>document.querySelector('#frontRange').textContent.includes('No echo'));
  assert(await rover.$eval('#resetUltrasonicStop', button=>button.disabled));
  await page.evaluate(()=>emitExpandedSample(false,0,40));
  await rover.waitForFunction(()=>!document.querySelector('#resetUltrasonicStop').disabled);
  assert(await rover.$eval('[data-drive="back"]', button=>button.disabled));
  await rover.$eval('#resetUltrasonicStop', button=>button.click());
  await rover.waitForFunction(()=>!document.querySelector('[data-drive="forward"]').disabled);
  const afterEmergency = await page.evaluate(()=>roverTestPublished.slice(roverTestPublished.findIndex(item=>item.payload==='ESTOP')+1));
  assert(!afterEmergency.some(item=>item.payload==='L'));
  await rover.$eval('[data-mqtt-action="pump"]', button=>button.click());
  await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='PUMPON');
  assert(await rover.$eval('[data-drive="forward"]', button=>button.disabled));
  await rover.$eval('#taskEmergencyStop', button=>button.click());
  await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='ESTOP');
  await page.evaluate(()=>{roverTestPublished.length=0;});


  await page.evaluate(()=>emitExpandedSample(false, 0));
  await rover.waitForFunction(()=>!document.querySelector('#inspectionRun').disabled);
  await rover.$eval('#inspectionSteps li:nth-child(3) input', field=>field.value = '6');
  await rover.$eval('#inspectionRun', button=>button.click());
  await rover.waitForFunction(()=>document.querySelector('#inspectionStatus').textContent.includes('1/4'));
  assert(await rover.$eval('[data-drive="forward"]', button=>button.disabled));
  assert.equal(await page.evaluate(()=>roverTestPublished.some(item=>item.payload==='NPKDOWN')),false);
  await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='NPKDOWN');
  await page.evaluate(()=>{
    roverTestClient.options.onMessage('farmrover/device01/status','NPK LIFT SERVO POSITION 180');
    emitExpandedSample(false, 180);
  });
  await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='WATER');
  await page.evaluate(()=>{
    emitExpandedSample(false, 180);
    roverTestClient.options.onMessage('farmrover/device01/status','WATER TEST STARTED');
    roverTestClient.options.onMessage('farmrover/device01/status','WATER TEST COMPLETE - AVG 1200');
  });
  await page.waitForFunction(()=>roverTestPublished.filter(item=>item.payload==='WATER').length===2);
  await page.evaluate(()=>{
    roverTestClient.options.onMessage('farmrover/device01/status','WATER TEST STARTED');
    roverTestClient.options.onMessage('farmrover/device01/status','WATER TEST COMPLETE - AVG 1250');
  });
  await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='NPKUP');
  assert(await rover.$eval('[data-drive="forward"]', button=>button.disabled));
  await page.evaluate(()=>{
    roverTestClient.options.onMessage('farmrover/device01/status','NPK LIFT SERVO POSITION 0');
    emitExpandedSample(false, 0);
  });
  await rover.waitForFunction(()=>document.querySelector('#inspectionStatus').textContent==='Inspection complete.');
  assert.deepEqual(await page.evaluate(()=>roverTestPublished.map(item=>item.payload)),['NPKDOWN','WATER','WATER','NPKUP']);

  await rover.evaluate(()=>{
    const selections = document.querySelectorAll('#inspectionSteps li select');
    ['lower','read-npk','raise','dispense-if-low'].forEach((value,index)=>{
      selections[index].value = value;
      selections[index].dispatchEvent(new Event('change'));
    });
    for (const nutrient of ['N','P','K']) document.querySelector('#inspectionMinimum'+nutrient).value = '10';
  });
  for (const potassium of [9, 10, null]) {
    await page.evaluate(()=>{roverTestPublished.length=0;emitExpandedSample(false,0);});
    await rover.waitForFunction(()=>!document.querySelector('#inspectionRun').disabled);
    await rover.$eval('#inspectionRun', button=>button.click());
    await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='NPKDOWN');
    await page.evaluate(()=>{
      roverTestClient.options.onMessage('farmrover/device01/status','NPK LIFT SERVO POSITION 180');
      emitExpandedSample(false,180);
    });
    await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='DATA');
    await page.evaluate(k=>{
      const npk = {ok:true,n_mgkg:20,p_mgkg:30,k_mgkg:k ?? 0};
      const measured_at = Date.now()/1000;
      emitExpandedSample(false,180,40,{...npk,measured_at:measured_at-60});
      if (k !== null) emitExpandedSample(false,180,40,{...npk,measured_at});
      else window.inspectionSampleTimer=setInterval(()=>emitExpandedSample(false,180,40,npk),1000);
    },potassium);
    if (potassium === null) {
      await rover.waitForFunction(()=>document.querySelector('#inspectionStatus').textContent.includes('fresh NPK measurement'));
      assert.equal(await page.evaluate(()=>roverTestPublished.some(item=>item.payload==='DISPENSE')),false);
      await page.evaluate(()=>{clearInterval(inspectionSampleTimer);emitExpandedSample(false,0);});
      continue;
    }
    await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='NPKUP');
    assert.equal(await page.evaluate(()=>roverTestPublished.some(item=>item.payload==='DISPENSE')),false);
    await page.evaluate(()=>{
      roverTestClient.options.onMessage('farmrover/device01/status','NPK LIFT SERVO POSITION 0');
      emitExpandedSample(false,0);
    });
    if (potassium === 9) {
      await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='DISPENSE');
      await rover.waitForFunction(()=>document.querySelector('#inspectionNpkStatus').textContent.includes('Below minimum · K'));
      await page.evaluate(()=>{
        roverTestClient.options.onMessage('farmrover/device01/status','FERTILIZER DISPENSER OPEN');
        emitExpandedSample(false,0,40,undefined,true);
      });
      assert(await rover.$eval('[data-drive="forward"]', button=>button.disabled));
      await page.evaluate(()=>{
        roverTestClient.options.onMessage('farmrover/device01/status','FERTILIZER DISPENSER COMPLETE');
        emitExpandedSample(false,0,40,undefined,false);
      });
    } else {
      await rover.waitForFunction(()=>document.querySelector('#inspectionNpkStatus').textContent.includes('Fertilizer skipped'));
      assert.equal(await page.evaluate(()=>roverTestPublished.some(item=>item.payload==='DISPENSE')),false);
    }
    await rover.waitForFunction(()=>document.querySelector('#inspectionStatus').textContent==='Inspection complete.');
  }

  await page.evaluate(()=>{EnviroOS.i18n.setLang('hi'); EnviroOS.UI.render();});
  await rover.waitForFunction(()=>document.documentElement.lang==='hi' &&
    document.querySelector('#manualMode').textContent==='मैनुअल संचालन');
  assert.match(await rover.$eval('#straightDriveSpeed',el=>el.textContent),/२००/);
  assert.match(await rover.$eval('#turnDriveSpeed',el=>el.textContent),/२५५/);
  assert.equal(await page.evaluate(()=>EnviroOS.i18n.number(42)),'४२');
  await page.evaluate(()=>{EnviroOS.i18n.setLang('ta'); EnviroOS.UI.render();});
  await rover.waitForFunction(()=>document.documentElement.lang==='ta' &&
    document.querySelector('#qrCards').textContent==='QR குறியீடுகள்');
  assert.equal(await page.evaluate(()=>EnviroOS.i18n.number(42)),'௪௨');
  await page.evaluate(()=>{EnviroOS.i18n.setLang('en'); EnviroOS.UI.render();});
  await rover.waitForFunction(()=>document.documentElement.lang==='en');
  assert.equal(await rover.$eval('#manualMode',el=>el.textContent),'Manual steering');

  const before=await rover.$eval('#pointCount',e=>e.textContent);
  await page.evaluate(()=>{EnviroOS.UI.render();EnviroOS.UI.go('home');EnviroOS.UI.go('rover');});
  assert.equal(await rover.$eval('#pointCount',e=>e.textContent),before);
  assert.equal((await (await page.$('#rover-mission-control')).contentFrame())._id,rover._id);
  await rover.click('#connection');
  await rover.click('#connectDialog [data-open-rover-wifi]');
  await rover.waitForSelector('#roverWifiDialog[open]');
  assert.match(await rover.$eval('#roverWifiDialog', dialog=>dialog.textContent), /FarmRover-Setup/);
  assert.equal(await rover.$eval('#roverWifiDialog a', link=>link.href), 'http://192.168.4.1/');
  await rover.click('#roverWifiDialog button');
  assert.match(await rover.$eval('#apiBase',e=>e.value),/(?::8088|\/rover-pi)$/);
  await rover.$eval('#apiBase',e=>e.value='http://127.0.0.1:18888');
  await rover.type('#apiToken','integration-test-token-123456789');
  await rover.click('#connectForm button[type=submit]');
  await rover.waitForFunction(()=>document.querySelector('#connectError').textContent.includes('Pi control API is unavailable.'));
  await page.evaluate(()=>emitExpandedSample());
  await rover.waitForFunction(()=>document.querySelector('#roverMqttStatus').textContent.includes('Live · device01'));
  assert.match(await rover.$eval('#taskTitle', e=>e.textContent), /ESP32 control over MQTT/);
  piUnavailable = false;
  await rover.click('#connectForm button[type=submit]');
  await rover.waitForFunction(()=>document.querySelector('#connection').classList.contains('live'));
  manualReady = false;
  await page.evaluate(()=>emitExpandedSample(false));
  await rover.waitForFunction(()=>document.querySelector('#taskTitle').textContent==='ESP32 control over MQTT');
  assert.equal(await rover.$eval('[data-drive="forward"]', button=>button.disabled),false);
  assert.equal(await rover.$eval('#connection', button=>button.classList.contains('live')),true);
  await rover.$eval('#autoMode', button=>button.click());
  assert.equal(await rover.$eval('#autoStart', button=>button.textContent), 'Start firmware mission');
  await rover.$eval('#autoStart', button=>button.click());
  await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='MISSION');
  await page.evaluate(()=>roverTestClient.options.onMessage('farmrover/device01/status','FARM MISSION STARTED - NPK ARM LOWERED'));
  await rover.waitForSelector('#autoCancelMqtt', {visible:true});
  assert(await rover.$eval('#manualMode', button=>button.disabled));
  await rover.$eval('#autoCancelMqtt', button=>button.click());
  await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='CANCEL');
  await page.evaluate(()=>roverTestClient.options.onMessage('farmrover/device01/status','MISSION CANCELLED - NPK ARM HOME'));
  await rover.waitForFunction(()=>!document.querySelector('#manualMode').disabled);
  await page.evaluate(()=>{emitExpandedSample(false);roverTestPublished.length=0;});
  qrScanDelay = 1500;
  qrScan = [
    {payload:'forward', direction:'forward', area:.05, wait:3},
    {payload:'left', direction:'left', area:.2, wait:2},
  ];
  assert.equal(await rover.$('#directQrTiming'), null);
  await rover.waitForFunction(()=>!document.querySelector('#directQrStart').disabled);
  await page.evaluate(()=>{window.qrSampleTimer = setInterval(()=>emitExpandedSample(false), 800);});
  await rover.$eval('#directQrStart', button=>button.click());
  await page.waitForFunction(()=>roverTestPublished.some(item=>item.payload==='B'));
  assert.equal(await page.evaluate(()=>roverTestPublished[roverTestPublished.findIndex(item=>item.payload==='B')-1]?.payload),'SPEED 255');
  await page.evaluate(()=>emitExpandedSample(false));
  await page.waitForFunction(()=>roverTestPublished.some(item=>item.payload==='STOP'));
  await page.evaluate(()=>clearInterval(qrSampleTimer));
  const [commands, elapsed] = await page.evaluate(()=>{
    const moves = roverTestPublished.filter(item=>!item.payload.startsWith('SPEED') && item.payload !== 'DISTANCE');
    return [moves.map(item=>item.payload), moves.at(-1).time - moves[0].time];
  });
  assert(commands.slice(0,-1).every(command=>command==='B'));
  assert.equal(commands.at(-1), 'STOP');
  assert(elapsed >= 1850 && elapsed <= 2400, '2-second card duration: ' + elapsed);
  qrScanDelay = 0;
  qrScan = [
    {payload:'left', direction:'left', area:.2, wait:2},
    {payload:'inspect-route', direction:'sequence', area:.04, label:'Inspect route', steps:[
      {action:'inspect',seconds:0},{action:'wait',seconds:1},{action:'forward',seconds:1},{action:'right',seconds:3},
    ]},
  ];
  await page.evaluate(()=>emitExpandedSample(false));
  await page.waitForFunction(()=>roverTestPublished.some(item=>item.payload==='MISSION'));
  await page.evaluate(()=>{
    roverTestClient.options.onMessage('farmrover/device01/status','FARM MISSION STARTED - NPK ARM LOWERED');
    emitExpandedSample(true);
  });
  await rover.waitForFunction(()=>document.querySelector('#autoDescription').textContent.includes('1/4'));
  assert.equal(await page.evaluate(()=>roverTestPublished.some(item=>['R','F'].includes(item.payload))),false);
  await page.evaluate(()=>{
    roverTestClient.options.onMessage('farmrover/device01/status','FARM MISSION COMPLETED');
    emitExpandedSample(false);
  });
  await rover.waitForFunction(()=>document.querySelector('#autoDescription').textContent.includes('2/4'));
  assert.equal(await page.evaluate(()=>roverTestPublished.some(item=>['R','F'].includes(item.payload))),false);
  await page.waitForFunction(()=>roverTestPublished.some(item=>item.payload==='R'));
  await page.waitForFunction(()=>roverTestPublished.some(item=>item.payload==='F'));
  assert.deepEqual(await page.evaluate(()=>{
    const sent=roverTestPublished.map(item=>item.payload);
    return ['R','F'].map(direction=>sent[sent.indexOf(direction)-1]);
  }),['SPEED 200','SPEED 255']);
  const commandsAfterFirstStop = await page.evaluate(()=>{
    const moves = roverTestPublished.map(item=>item.payload).filter(payload=>!payload.startsWith('SPEED'));
    return moves.slice(moves.indexOf('STOP') + 1);
  });
  assert.equal(commandsAfterFirstStop[0], 'MISSION');
  assert(commandsAfterFirstStop.indexOf('R') < commandsAfterFirstStop.indexOf('STOP'));
  assert(commandsAfterFirstStop.indexOf('STOP') < commandsAfterFirstStop.indexOf('F'));
  await page.evaluate(()=>emitExpandedSample(false,0,4.9));
  await rover.waitForFunction(()=>document.querySelector('#autoDescription').textContent==='Ultrasonic emergency stop');
  await page.waitForFunction(()=>roverTestPublished.at(-1)?.payload==='ESTOP');
  qrScan = [{payload:'stop', direction:'stop', area:.01}];
  await page.evaluate(()=>{
    roverTestClient.options.onMessage('farmrover/device01/status','EMERGENCY STOP - MOTORS/PUMP/SERVOS STOPPED');
    emitExpandedSample(false,0,40);
  });
  await rover.waitForFunction(()=>!document.querySelector('#resetUltrasonicStop').disabled);
  await rover.$eval('#resetUltrasonicStop', button=>button.click());
  await rover.waitForFunction(()=>!document.querySelector('#directQrStart').disabled);
  await rover.$eval('#directQrStart', button=>button.click());
  await rover.waitForFunction(()=>document.querySelector('#autoDescription').textContent==='Stopped by QR card.');
  qrScan = [];
  await rover.$eval('#manualMode', button=>button.click());
  await page.evaluate(()=>{roverTestPublished.length=0;});
  manualReady = true;
  await rover.waitForFunction(()=>document.querySelector('#roverDirect').hidden);



  const title = text => rover.waitForFunction(expected => document.querySelector('#taskTitle').textContent.includes(expected),{},text);
  await title('Ready for manual control');
  assert.deepEqual(await rover.$$eval('.dispensing-card h3', items=>items.map(item=>item.textContent)),
    ['Rover fertilizer pump','Irrigation via Enviro Advanced']);
  assert.equal(await rover.$eval('#fertilizerStatus',e=>e.textContent),'No treatment recorded');
  assert.equal(await rover.$eval('#waterStatus',e=>e.textContent),'Configure Enviro Advanced on the Pi');
  assert(await rover.$eval('#waterPumpStart', button=>button.disabled));
  scenario='dispensers';
  await rover.waitForFunction(()=>!document.querySelector('#waterPumpStart').disabled);
  for (const kind of ['water', 'fertilizer']) {
   await rover.click('#' + kind + 'PumpStart');
   await title(kind==='water'?'Watering':'Dispensing fertilizer');
   assert(await rover.$eval('#waterPumpStart', button=>button.disabled));
   assert(await rover.$eval('#fertilizerPumpStart', button=>button.disabled));
   assert(await rover.$eval('[data-drive=forward]', button=>button.disabled));
   await rover.click('#dispensingStop');
   await title('Ready for manual control');
  }
  assert.deepEqual(calls.filter(c=>c.path==='/api/payload/dispense'&&c.method==='POST')
    .map(c=>JSON.parse(c.body).kind), ['water','fertilizer']);
  scenario='idle';

  await rover.click('#openRoverSettings');
  assert.match(await rover.$eval('#roverSettingsContent',e=>e.textContent),/5 \/ 3 rotations/);
  await rover.$eval('#roverMqttId', input=>{
    input.value = 'test-rover';
    input.form.requestSubmit();
  });
  await page.waitForFunction(()=>window.roverTestSubscriptions?.includes('farmrover/test-rover/data'));
  await page.evaluate(()=>{
    roverTestClient.options.onMessage('farmrover/test-rover/data',JSON.stringify({
      water_raw:0, temperature_raw:812, light_lux:8, distance_cm:14,
      pump:true, drive_active:false, servo_active:true, npk_servo_angle:45, dispenser_servo_angle:-1,
      npk:{ok:true,n_mgkg:3,p_mgkg:4,k_mgkg:5}
    }),{retained:true});
  });
  assert.equal(await rover.$eval('#mqttPump',e=>e.textContent),'—');
  await page.evaluate(()=>{
    roverTestClient.options.onMessage('farmrover/test-rover/data',JSON.stringify({
      water_raw:0, temperature_raw:812, light_lux:8, distance_cm:14,
      pump:true, drive_active:false, servo_active:true, npk_servo_angle:45, dispenser_servo_angle:-1,
      npk:{ok:true,n_mgkg:3,p_mgkg:4,k_mgkg:5}
    }));
  });
  await rover.waitForFunction(()=>document.querySelector('#mqttPump').textContent==='On');
  assert.equal(await rover.$eval('#mqttTemperature',e=>e.textContent),'812 ADC');
  assert.equal(await rover.$eval('#mqttWater',e=>e.textContent),'0 ADC');
  assert.equal(await rover.$eval('#mqttNpk',e=>e.textContent),'3 / 4 / 5 mg/kg');
  assert.equal(await rover.$eval('#mqttDrive',e=>e.textContent),'Stopped');
  assert.equal(await rover.$eval('#mqttServo',e=>e.textContent),'Active');
  assert.equal(await rover.$eval('#mqttAngles',e=>e.textContent),'45° / —');
  assert.match(await rover.$eval('#roverMqttStatus',e=>e.textContent),/Live/);
  assert.match(await rover.$eval('#roverMqttSample',e=>e.textContent), /Last reading/);
  await rover.$eval('#roverSettingsDialog', dialog=>dialog.close());
  await rover.$eval('#roverMqttPanel', panel=>{ panel.open=true; });
  await rover.click('#roverMqttRefresh');
  await rover.waitForFunction(()=>document.querySelector('#roverMqttRefresh').disabled);
  assert.deepEqual(await page.evaluate(()=>roverTestPublished.map(({topic,payload})=>({topic,payload}))), [
    {topic:'farmrover/test-rover/cmd',payload:'DATA'},
  ]);
  await page.evaluate(()=>roverTestClient.options.onMessage('farmrover/test-rover/status','ROVER OFFLINE'));
  await rover.waitForFunction(()=>document.querySelector('#roverMqttStatus').textContent.includes('ESP32 offline'));
  assert.equal(await rover.$eval('#mqttPump',e=>e.textContent),'—');
  await page.evaluate(()=>roverTestClient.options.onMessage('farmrover/test-rover/status','ROVER ONLINE',{retained:true}));
  assert.match(await rover.$eval('#roverMqttStatus',e=>e.textContent),/ESP32 offline/);
  await rover.click('#openRoverSettings');
  await rover.click('#payloadServo180');
  await title('Testing positional servo');
  assert(await rover.$eval('#payloadServo180',e=>e.disabled));
  assert(await rover.$eval('[data-drive=forward]',e=>e.disabled));
  await rover.waitForFunction(()=>!document.querySelector('#roverSettingsDialog').open);

  mode='Automatic'; scenario='farm';
  await title('Watering');
  assert(await rover.$eval('[data-drive=forward]',e=>e.disabled));
  await rover.click('#manualMode');
  await rover.waitForFunction(()=>document.querySelector('#taskSummary').textContent.includes('estimating remaining time'));
  assert.equal(await rover.$eval('#fertilizerStatus',e=>e.textContent),'Completed');
  assert.match(await rover.$eval('#fertilizerDetail',e=>e.textContent),/North field.*Low nutrients: N/);
  assert.equal(await rover.$eval('#waterStatus',e=>e.textContent),'Watering');
  assert.match(await rover.$eval('#waterDetail',e=>e.textContent),/Enviro Advanced acknowledged the low-moisture warning/);
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
  assert.equal(await rover.$eval('#waterStatus',e=>e.textContent),'Completed');

  await page.setViewport({width:390,height:844});
  await page.evaluate(()=>{localStorage.setItem('enviroos.theme','dark');EnviroOS.UI.applyTheme();window.scrollTo(0,0);});
  await rover.waitForFunction(()=>document.documentElement.dataset.enviroTheme==='dark');
  scenario='fault';mode='Fault';
  await title('Recovery required');
  assert.match(await rover.$eval('#taskSummary',e=>e.textContent),/confirmation timed out/);
  assert.equal(await rover.$eval('#waterStatus',e=>e.textContent),'Shutdown unconfirmed');
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
  scenario='private-mqtt';mode='Manual';
  await reopened.waitForFunction(()=>document.querySelector('#roverMqttStatus').textContent.includes('Live via Pi and private MQTT'));
  assert.equal(await reopened.$eval('#mqttTemperature',e=>e.textContent),'72 ADC');
  assert.equal(await reopened.$eval('#mqttNpk',e=>e.textContent),'5 / 8 / 13 mg/kg');
  assert(await reopened.$eval('#roverMqttRefresh',button=>button.hidden));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: live language switching and localized digits, both firmware MQTT formats, fertilizer pump and irrigation cards, settings, active farmland, pending manual mode, zero estimate lock, successful completion, emergency stop, fault, mobile dark theme and authoritative reconnect');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
