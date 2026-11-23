const puppeteer=require('puppeteer-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluateOnNewDocument(()=>{
   if(!localStorage.getItem('second-test-initialized')){
    localStorage.setItem('second-test-initialized','1');
    localStorage.setItem('enviroos.lang','en');localStorage.setItem('enviroos.source','demo');
    localStorage.setItem('enviroos.auth',JSON.stringify({name:'Device check',pass:'test',mainModel:'Enviro Basic',assistantModel:'Rover'}));
    localStorage.setItem('enviroos.profile',JSON.stringify({onboarded:true}));
   }
   const sockets=[];const NativeSocket=window.WebSocket;
   class TestSocket {
    static OPEN=1;static CLOSED=3;
    constructor(url,protocols){if(!String(url).includes('broker.hivemq.com'))return new NativeSocket(url,protocols);this.url=url;this.readyState=0;this.sent=[];sockets.push(this);setTimeout(()=>{this.readyState=1;this.onopen?.({});},0);}
    send(input){const bytes=new Uint8Array(input);this.sent.push(Array.from(bytes));if(bytes[0]===0x10)setTimeout(()=>this.deliver(new Uint8Array([0x20,2,0,0])),0);if(bytes[0]===0xc0)this.deliver(new Uint8Array([0xd0,0]));}
    deliver(bytes){if(this.readyState===1)this.onmessage?.({data:bytes.buffer});}
    close(){this.readyState=3;this.onclose?.({});}
   }
   window.WebSocket=TestSocket;
   window.__mqtt={sockets,emit(topic,payload,retained=false){
    const encoder=new TextEncoder(),name=encoder.encode(topic),value=encoder.encode(JSON.stringify(payload));
    const body=new Uint8Array(2+name.length+value.length);body[0]=name.length>>8;body[1]=name.length&255;body.set(name,2);body.set(value,name.length+2);
    const length=[];let n=body.length;do{let b=n%128;n=Math.floor(n/128);if(n)b|=128;length.push(b);}while(n);
    const frame=new Uint8Array(1+length.length+body.length);frame[0]=retained?0x31:0x30;frame.set(length,1);frame.set(body,length.length+1);
    sockets.forEach(socket=>socket.deliver(frame));
   }};
  });
  await page.goto(process.env.APP_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle2'});
  await page.waitForSelector('#tabs .tab');
  assert.equal(await page.$$eval('#tabs [data-go=rover]',els=>els.length),0);
  assert.equal(await page.$$eval('#tabs .tab',els=>els.length),7);
  await page.evaluate(()=>EnviroOS.UI.go('rover'));assert.equal(await page.evaluate(()=>EnviroOS.UI.route),'home');
  assert.equal(await page.evaluate(()=>EnviroOS.UI.cmdEntries().some(e=>e.route==='rover')),false);
  await page.evaluate(()=>EnviroOS.UI.go('second-device'));
  assert.equal(await page.$eval('[data-second-moisture]',e=>e.textContent),'—');
  await page.click('[data-connect-second-device]');
  await page.waitForFunction(()=>document.querySelector('#second-connect-status')?.textContent.includes('Looking'));
  assert.match(await page.$eval('.second-connect-dialog h2',e=>e.textContent),/Turn on/);
  await page.waitForFunction(()=>window.__mqtt.sockets.length===1&&window.__mqtt.sockets[0].sent.some(p=>p[0]===0x82));
  const sent=await page.evaluate(()=>__mqtt.sockets[0].sent.map(p=>new TextDecoder().decode(new Uint8Array(p))).join('|'));
  assert(sent.includes('esp32bot/149853470968/sensors'));
  const reading={device:'149853470968',soil_analog:{raw:[2350]},bmp280:{ok:true,temperature_c:0,pressure_hpa:1002},bh1750:{ok:true,lux:0}};
  await page.evaluate(data=>{
   __mqtt.emit('esp32bot/149853470968/status','online',true);
   __mqtt.emit('esp32bot/4493A6470968/sensors',data);
   __mqtt.emit('esp32bot/149853470968/sensors',data,true);
   __mqtt.emit('esp32bot/149853470968/sensors',{});
  },reading);
  assert.equal(await page.evaluate(()=>localStorage.getItem('enviroos.node2.connection')),null);
  assert.equal(await page.$eval('[data-second-moisture]',e=>e.textContent),'—');
  await page.evaluate(data=>__mqtt.emit('esp32bot/149853470968/sensors',data),reading);
  await page.waitForFunction(()=>document.querySelector('#second-connect-status').textContent.includes('Connected'));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('enviroos.node2.connection')).deviceId),'149853470968');
  assert.equal(await page.$eval('[data-second-moisture]',e=>e.textContent),'50%');
  assert.equal(await page.$eval('[data-second-temperature]',e=>e.textContent),'0°C');
  assert.equal(await page.$eval('[data-second-lux]',e=>e.textContent),'0 lx');
  await page.click('.second-connect-dialog [data-close-dlg]');
  await page.reload({waitUntil:'networkidle2'});
  await page.evaluate(()=>EnviroOS.UI.go('second-device'));
  await page.waitForFunction(()=>window.__mqtt.sockets.length===1&&window.__mqtt.sockets[0].readyState===1);
  assert.equal(await page.evaluate(()=>EnviroOS.UI.secondDevice.status().enabled),true);
  assert.equal(await page.evaluate(()=>EnviroOS.UI.secondDevice.status().online),false);
  assert.equal(await page.$eval('[data-second-temperature]',e=>e.textContent),'—');
  await page.evaluate(data=>__mqtt.emit('esp32bot/149853470968/sensors',data),reading);
  await page.waitForFunction(()=>EnviroOS.UI.secondDevice.status().online);
  await page.evaluate(()=>__mqtt.emit('esp32bot/149853470968/status','offline'));
  assert.equal(await page.$eval('[data-second-temperature]',e=>e.textContent),'—');
  await page.evaluate(()=>__mqtt.sockets[0].close());
  await page.waitForFunction(()=>__mqtt.sockets.length>=2&&__mqtt.sockets.at(-1).readyState===1);
  await page.evaluate(data=>__mqtt.emit('esp32bot/149853470968/sensors',data),reading);
  await page.waitForFunction(()=>EnviroOS.UI.secondDevice.status().online);
  await page.screenshot({path:'/tmp/enviroos-second-device.png',fullPage:true});
  await page.evaluate(()=>EnviroOS.UI.toggleTheme());
  await page.screenshot({path:'/tmp/enviroos-second-device-dark.png',fullPage:true});
  await page.setViewport({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'/tmp/enviroos-second-device-mobile.png',fullPage:true});
  await page.setViewport({width:1440,height:1000});
  await page.click('[data-pause-second-device]');
  await page.reload({waitUntil:'networkidle2'});
  await page.evaluate(()=>EnviroOS.UI.go('second-device'));
  assert.equal(await page.evaluate(()=>__mqtt.sockets.length),0);
  assert.equal(await page.evaluate(()=>EnviroOS.UI.secondDevice.status().remembered),true);
  await page.waitForSelector('[data-connect-second-device]');
  assert.match(await page.$eval('[data-connect-second-device]',e=>e.textContent),/Resume/);
  await page.click('[data-connect-second-device]');
  assert.equal(await page.evaluate(()=>EnviroOS.UI.isDlgOpen()),false);
  await page.waitForFunction(()=>__mqtt.sockets.length===1&&__mqtt.sockets[0].readyState===1);
  await page.evaluate(data=>__mqtt.emit('esp32bot/149853470968/sensors',data),reading);
  await page.waitForFunction(()=>EnviroOS.UI.secondDevice.status().online);
  async function selectModel(main,secondary){
   await page.evaluate(()=>EnviroOS.UI.dlgSignIn(true));
   await page.select('#signin-main-model',main);await page.select('#signin-asst-model',secondary);await page.click('#signin-submit');
   await page.waitForFunction(()=>!EnviroOS.UI.isDlgOpen());
  }
  await selectModel('Enviro Pro','Enviro Basic');
  assert.match(await page.$eval('#tabs [data-go=second-device]',e=>e.textContent),/Enviro Basic/);
  await page.evaluate(()=>EnviroOS.UI.dlgNodes());
  assert.match(await page.$eval('[data-pick-node="4493A6470968"]',e=>e.textContent),/Enviro Pro/);
  assert.match(await page.$eval('[data-pick-node="149853470968"]',e=>e.textContent),/Enviro Basic/);
  await page.evaluate(()=>EnviroOS.UI.closeDlg());
  await selectModel('Enviro Basic','Enviro Pro');
  assert.match(await page.$eval('#tabs [data-go=second-device]',e=>e.textContent),/Enviro Pro/);
  await selectModel('Enviro Pro','Rover');
  assert.equal(await page.$$eval('#tabs [data-go=rover]',els=>els.length),0);
  await selectModel('Rover','none');
  assert.equal(await page.$$eval('#tabs [data-go=rover]',els=>els.length),1);
  assert.equal(await page.$$eval('#tabs .tab',els=>els.length),8);
  await page.evaluate(()=>EnviroOS.UI.go('rover'));await page.waitForSelector('#rover-mission-control');
  const rover=await(await page.$('#rover-mission-control')).contentFrame();await rover.waitForSelector('.heading');
  await page.evaluate(()=>EnviroOS.UI.toggleTheme());
  await rover.waitForFunction(()=>document.documentElement.dataset.enviroTheme==='light');
  assert.equal(await rover.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(245, 246, 244)');
  await page.evaluate(()=>EnviroOS.UI.toggleTheme());
  await rover.waitForFunction(()=>document.documentElement.dataset.enviroTheme==='dark');
  assert.equal(await rover.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(16, 22, 18)');
  await selectModel('Enviro Basic','Rover');
  assert.equal(await page.$('#rover-mission-control'),null);
  assert.equal(await page.evaluate(()=>EnviroOS.UI.route),'home');
  assert.equal(await page.$$eval('#rail [data-go=rover]',els=>els.length),0);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: second-node setup, exact device discovery, retained/demo rejection, real zero readings, saved reconnect, offline handling, broker recovery, pause persistence, model-based Rover visibility, frame removal and matching light/dark themes. MQTT transport was simulated; no hardware commands sent.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
