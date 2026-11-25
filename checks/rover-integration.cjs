const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
(async () => {
 const browser = await puppeteer.launch({executablePath:process.env.CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const page = await browser.newPage();
  await page.setViewport({width:1440,height:1000});
  const errors=[], calls=[];let automaticPulses=0, manualReady=true;
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
  const appUrl = process.env.APP_URL || 'http://127.0.0.1:5186';
  page.on('request',async req=>{
   if(!req.url().startsWith('http://127.0.0.1:18888/')) {
    return req.url().startsWith(new URL(appUrl).origin + '/') || /^(blob|data):/.test(req.url()) ? req.continue() : req.abort();
   }
   const path=new URL(req.url()).pathname;
   calls.push({path,method:req.method(),headers:req.headers(),body:req.postData()});
   const headers={'Access-Control-Allow-Origin':new URL(appUrl).origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS'};
   if(req.method()==='OPTIONS')return req.respond({status:204,headers});
   assert.equal(req.headers().authorization,'Bearer integration-test-token-123456789');
   let data={};
   if(path==='/api/state') data={protocol:'field-rover-v1',manual_ready:manualReady,motor_enabled:true,state_time:123,busy:false,map_revision:null,can_start:false,robot:null};
   else if(path==='/api/qr/cards'){
    if(req.method()==='POST') {
     const command=JSON.parse(req.postData());
     if(command.operation==='remove') cards.splice(cards.findIndex(card=>card.payload===command.payload),1);
     else {
      const steps = command.commands === 'stop' ? [{action:'stop',seconds:0}] :
       [{action:'wait',seconds:4},{action:'forward',seconds:2}];
      cards.push({...command,payload:'enviro-test',direction:command.commands === 'stop' ? 'stop' : 'sequence',wait:0,steps});
     }
    }
    data=cards;
   } else if(path.startsWith('/api/qr/card/')) return req.respond({status:200,headers,contentType:path.endsWith('/pdf')?'application/pdf':'image/png',body:Buffer.from(path.endsWith('/pdf')?'%PDF-1.4\n': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=',path.endsWith('/pdf')?'utf8':'base64')});
   else if(path==='/api/history/trips') data=[{id:1,started:'2026-11-16T10:00:00',status:'Travel recorded'}];
   else if(path==='/api/history/trips/1') data={planned:[[0,0],[1,0]],samples:[[0,0,0],[1,1,0]],stops:{},zones:[],obstacles:[],sightings:[]};
   else if(path==='/api/qr/scan') data=[];
   else if(path==='/api/manual') {const automatic=JSON.parse(req.postData()).direction==='automatic';if(automatic)automaticPulses++;data={ok:true,phase:automatic&&automaticPulses>10?'Armed · waiting for next direction card':'Driving'};}
   await req.respond({status:200,headers,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(appUrl,{waitUntil:'networkidle2'});
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
  await rover.click('#qrCards');
  const qr=await (await rover.$('#qrFrame')).contentFrame();
  await qr.waitForSelector('#cards article img[src]');
  await page.evaluate(()=>{EnviroOS.i18n.setLang('hi'); EnviroOS.UI.render();});
  await qr.waitForFunction(()=>document.documentElement.lang==='hi' &&
    document.querySelector('h1').textContent==='QR कार्ड');
  await page.evaluate(()=>{EnviroOS.i18n.setLang('en'); EnviroOS.UI.render();});
  await qr.waitForFunction(()=>document.documentElement.lang==='en' &&
    document.querySelector('h1').textContent==='QR cards');

  await qr.waitForFunction(()=>!document.querySelector('#form button').disabled);
  await qr.type('#label','Gate');await qr.type('#commands','wait(4), forward(2)');
  await qr.click('#form button');
  await qr.waitForFunction(()=>document.querySelector('#status').textContent==='Card saved on the Pi.');
  assert(calls.some(c=>c.path==='/api/qr/cards'&&c.method==='POST'&&
    JSON.stringify(JSON.parse(c.body))===JSON.stringify({label:'Gate',commands:'wait(4), forward(2)'})));
  assert.match(await qr.$eval('#cards article:last-child small',e=>e.textContent),/Wait \(4 s\) → Forward \(2 s\)/);
  assert.equal(await qr.$eval('#cards article:first-child .remove-card',button=>button.getAttribute('aria-label')),'Remove Left');
  await qr.click('#cards article:last-child .card-actions button:first-child');
  await qr.waitForFunction(()=>!document.querySelector('#cards article:last-child .card-actions button:first-child').disabled);
  page.once('dialog', dialog=>dialog.accept());
  await qr.click('#cards article:last-child .remove-card');
  await qr.waitForFunction(()=>document.querySelector('#status').textContent==='Card removed from the Pi.');
  assert.equal(await qr.$$eval('#cards article', items=>items.length),1);
  assert(calls.some(c=>c.path==='/api/qr/cards'&&c.method==='POST'&&JSON.parse(c.body).operation==='remove'&&JSON.parse(c.body).payload==='enviro-test'));
  await qr.type('#label','Loading bay');
  await qr.type('#commands','stop');
  await qr.click('#form button');
  await qr.waitForFunction(()=>document.querySelector('#status').textContent==='Card saved on the Pi.');
  assert.deepEqual(JSON.parse(calls.filter(c=>c.path==='/api/qr/cards'&&c.method==='POST').at(-1).body),
    {label:'Loading bay',commands:'stop'});
  assert.equal(await qr.$eval('#cards article:last-child small',e=>e.textContent),'Stop');
  page.once('dialog', dialog=>dialog.accept());
  await qr.click('#cards article:first-child .remove-card');
  await qr.waitForFunction(()=>document.querySelector('#status').textContent==='Card removed from the Pi.');
  assert.equal(await qr.$eval('#cards article h3',heading=>heading.textContent),'Loading bay');
  assert(calls.some(c=>c.path==='/api/qr/cards'&&c.method==='POST'&&JSON.parse(c.body).operation==='remove'&&JSON.parse(c.body).payload==='left'));
  await rover.click('#closeQR');
  await rover.click('#historyTab');
  await rover.waitForSelector('#historyRows details');
  await rover.click('#historyRows details summary');
  await rover.click('#historyRows details details summary');
  await rover.waitForSelector('#historyRows svg');
  await rover.click('#compactHistoryDialog > button');
  // Connecting in manual mode starts the webcam automatically.
  await rover.waitForFunction(()=>!document.querySelector('#camera').hidden);
  await rover.waitForFunction(()=>!document.querySelector('[data-drive=forward]').disabled);
  await rover.$eval('#driveSpeed',e=>{e.value='200';e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.match(await rover.$eval('#driveSpeedFormula',e=>e.textContent),/Motor A: 165.*Motor B: 200/);
  const forward=await rover.$('[data-drive=forward]');await forward.scrollIntoView();const box=await forward.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await new Promise(r=>setTimeout(r,220));
  assert(calls.some(c=>c.path==='/api/manual'&&c.method==='POST'&&JSON.parse(c.body).direction==='forward'&&JSON.parse(c.body).speed_pwm===200));
  await page.evaluate(()=>EnviroOS.UI.go('home'));
  await page.mouse.up();
  await new Promise(r=>setTimeout(r,150));
  assert.equal(JSON.parse(calls.filter(c=>c.path==='/api/manual'&&c.method==='POST').at(-1).body).direction,'stop');
  const atStop=calls.filter(c=>c.path==='/api/manual'&&c.method==='POST').length;
  await new Promise(r=>setTimeout(r,250));
  assert.equal(calls.filter(c=>c.path==='/api/manual'&&c.method==='POST').length,atStop);
  await page.evaluate(()=>EnviroOS.UI.go('rover'));
  await rover.waitForFunction(()=>!document.querySelector('#camera').hidden);
  await rover.click('#autoMode');
  await rover.waitForFunction(()=>!document.querySelector('#autoStart').disabled);
  await rover.click('#autoStart');await new Promise(r=>setTimeout(r,4200));
  assert(await rover.$eval('#autoStart',e=>e.disabled));
  assert.equal(await rover.$eval('#taskEmergencyStop',e=>e.disabled),false);
  assert(await rover.$eval('#cameraToggle',e=>e.checked));
  assert(automaticPulses>10,'Automatic session stopped pulsing after an action');
  assert.match(await rover.$eval('#taskSummary',e=>e.textContent),/Armed/);
  manualReady=false;
  await rover.waitForFunction(()=>document.querySelector('#steerStatus').textContent.includes('Press Stop to leave autonomous drive'));
  assert(await rover.$eval('#autoStart',e=>e.disabled));
  assert.equal(await rover.$eval('#taskEmergencyStop',e=>e.disabled),false);
  const pausedPulses=automaticPulses;manualReady=true;
  await rover.waitForFunction(()=>document.querySelector('#taskSummary').textContent.includes('Armed'));
  for (let i=0; i<25 && automaticPulses<=pausedPulses; i++) await new Promise(resolve=>setTimeout(resolve,80));
  assert(automaticPulses>pausedPulses,'The client did not refresh the mocked automatic lease after feedback returned');
  await rover.click('#taskEmergencyStop');
  assert(calls.some(c=>c.path==='/api/manual'&&c.method==='POST'&&JSON.parse(c.body).direction==='automatic'));
  assert(calls.some(c=>c.path.endsWith('/pdf')));
  assert.equal(errors.length,0,errors.join('\n'));
  await page.evaluate(()=>{localStorage.setItem('enviroos.theme','light');EnviroOS.UI.applyTheme();});
  await rover.waitForFunction(()=>document.documentElement.dataset.enviroTheme==='light');
  const light=await rover.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  assert.equal(light,'rgb(245, 246, 244)');
  await page.evaluate(()=>EnviroOS.UI.toggleTheme());
  await rover.waitForFunction(()=>document.documentElement.dataset.enviroTheme==='dark');
  assert.equal(await rover.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(16, 22, 18)');
  await rover.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'/tmp/enviroos-rover-dark.png',fullPage:true});
  await page.evaluate(()=>EnviroOS.UI.toggleTheme());
  await rover.waitForFunction(()=>document.documentElement.dataset.enviroTheme==='light');
  await rover.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'/tmp/enviroos-rover-integration.png',fullPage:true});
  await page.setViewport({width:390,height:844});
  await rover.evaluate(()=>window.scrollTo(0,0));
  assert(await rover.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile mission control overflows horizontally');
  await page.screenshot({path:'/tmp/enviroos-rover-mobile.png',fullPage:true});
  console.log('PASS: Rover tab persistence, authenticated connection, QR library/create/print, history replay, camera, manual hold, stop on tab exit, and automatic QR driving. All hardware requests were mocked.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
