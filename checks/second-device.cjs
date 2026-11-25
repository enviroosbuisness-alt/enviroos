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
    send(input){const bytes=new Uint8Array(input);this.sent.push(Array.from(bytes));if(bytes[0]===0x10){
     const code=window.__mqtt.rejectNext ? 5 : 0;window.__mqtt.rejectNext=false;
     if(window.__mqtt.stallNext) window.__mqtt.stallNext=false;
     else setTimeout(()=>this.deliver(new Uint8Array([0x20,2,0,code])),0);
    }if(bytes[0]===0xc0)this.deliver(new Uint8Array([0xd0,0]));}
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
  const appUrl = process.env.APP_URL || 'http://127.0.0.1:5173';
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (url.startsWith(new URL(appUrl).origin + '/') || /^(blob|data):/.test(url)) request.continue();
    else request.abort();
  });
  await page.goto(appUrl,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#tabs .tab');
  await page.waitForFunction(()=>__mqtt.sockets.length===1&&__mqtt.sockets[0].sent.some(bytes=>bytes[0]===0x82));
  assert.equal(await page.evaluate(()=>EnviroOS.UI.secondDevice.status().enabled),true);
  await page.evaluate(()=>{
    const original=window.setTimeout;
    try {
      window.setTimeout=(fn,ms,...args)=>original(fn,ms===12000?25:ms===6000?50:ms,...args);
      __mqtt.stallNext=true;
      EnviroOS.UI.useSource('auto');
    } finally {
      window.setTimeout=original;
    }
  });
  await page.waitForFunction(()=>EnviroOS.UI.provider===EnviroOS.UI.mock);
  await page.waitForFunction(()=>__mqtt.sockets.length===3&&__mqtt.sockets[1].readyState===3&&
    __mqtt.sockets[2].sent.some(bytes=>bytes[0]===0x82));
  await page.evaluate(()=>__mqtt.emit('esp32bot/4493A6470968/sensors',{device:'4493A6470968',bh1750:{ok:true,lux:42}},true));
  assert.equal(await page.evaluate(()=>EnviroOS.UI.provider===EnviroOS.UI.mock),true);
  await page.evaluate(()=>__mqtt.emit('esp32bot/4493A6470968/sensors',{device:'4493A6470968',bh1750:{ok:true,lux:42}}));
  await page.waitForFunction(()=>EnviroOS.UI.mqtt?.deviceId==='4493A6470968'&&EnviroOS.UI.snapshot?.lux===42);
  await page.evaluate(()=>{EnviroOS.UI.useSource('demo');localStorage.removeItem('enviroos.nodes.enviro-d2.connection');});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#tabs .tab');
  assert.equal(await page.$$eval('#tabs [data-go=rover]',els=>els.length),0);
  assert.equal(await page.$$eval('#tabs .tab',els=>els.length),7);
  await page.evaluate(()=>EnviroOS.UI.go('rover'));assert.equal(await page.evaluate(()=>EnviroOS.UI.route),'home');
  assert.equal(await page.evaluate(()=>EnviroOS.UI.cmdEntries().some(e=>e.route==='rover')),false);
  await page.evaluate(()=>EnviroOS.UI.go('second-device'));
  assert.equal(await page.$eval('[data-second-moisture]',e=>e.textContent),'—');
  assert.equal(await page.$('[data-connect-second-device]'),null);
  assert.equal(await page.evaluate(()=>EnviroOS.UI.isDlgOpen()),false);
  await page.waitForFunction(()=>window.__mqtt.sockets.length===1&&window.__mqtt.sockets[0].sent.some(p=>p[0]===0x82));
  const sent=await page.evaluate(()=>__mqtt.sockets[0].sent.map(p=>new TextDecoder().decode(new Uint8Array(p))).join('|'));
  assert(sent.includes('esp32bot/4493A6470968/sensors'));
  const reading={device:'4493A6470968',soil_analog:{raw:[2350]},npk:{ok:true,n_mgkg:0,p_mgkg:36,k_mgkg:64,ph:6.25},bmp280:{ok:true,temperature_c:0,pressure_hpa:1002},bh1750:{ok:true,lux:0}};
  await page.evaluate(data=>{
   __mqtt.emit('esp32bot/4493A6470968/status','online',true);
   __mqtt.emit('esp32bot/149853470968/sensors',data);
   __mqtt.emit('esp32bot/4493A6470968/sensors',data,true);
   __mqtt.emit('esp32bot/4493A6470968/sensors',{});
  },reading);
  assert.equal(await page.evaluate(()=>localStorage.getItem('enviroos.nodes.enviro-d2.connection')),null);
  assert.equal(await page.$eval('[data-second-moisture]',e=>e.textContent),'—');
  await page.evaluate(data=>__mqtt.emit('esp32bot/4493A6470968/sensors',data),reading);
  await page.waitForFunction(()=>EnviroOS.UI.secondDevice.status().online);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('enviroos.nodes.enviro-d2.connection')).deviceId),'4493A6470968');
  assert.equal(await page.$eval('[data-second-moisture]',e=>e.textContent),'50%');
  assert.equal(await page.$eval('[data-second-temperature]',e=>e.textContent),'0 °C');
  assert.equal(await page.$eval('[data-second-lux]',e=>e.textContent),'0 lx');
  assert.equal(await page.$eval('[data-second-pressure]', e=>e.textContent),'1,002 hPa');
  assert.deepEqual(await page.$$eval('.device-nutrients dd', els=>els.map(el=>el.textContent)),
    ['0 mg/kg','36 mg/kg','64 mg/kg','6.25']);
  await page.evaluate(data=>__mqtt.emit('esp32bot/4493A6470968/sensors',{...data,npk:{ok:false,n_mgkg:999}}), reading);
  assert.equal(await page.$eval('[data-second-n]', e=>e.textContent),'—');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>EnviroOS.UI.go('second-device'));
  await page.waitForFunction(()=>window.__mqtt.sockets.length===1&&window.__mqtt.sockets[0].readyState===1);
  assert.equal(await page.evaluate(()=>EnviroOS.UI.secondDevice.status().enabled),true);
  assert.equal(await page.evaluate(()=>EnviroOS.UI.secondDevice.status().online),false);
  assert.equal(await page.$eval('[data-second-temperature]',e=>e.textContent),'—');
  await page.evaluate(data=>__mqtt.emit('esp32bot/4493A6470968/sensors',data),reading);
  await page.waitForFunction(()=>EnviroOS.UI.secondDevice.status().online);
  await page.evaluate(()=>__mqtt.emit('esp32bot/4493A6470968/status','offline'));
  assert.equal(await page.$eval('[data-second-temperature]',e=>e.textContent),'—');
  await page.evaluate(()=>__mqtt.sockets[0].close());
  await page.waitForFunction(()=>__mqtt.sockets.length>=2&&__mqtt.sockets.at(-1).readyState===1);
  await page.evaluate(data=>__mqtt.emit('esp32bot/4493A6470968/sensors',data),reading);
  await page.waitForFunction(()=>EnviroOS.UI.secondDevice.status().online);
  await page.screenshot({path:'/tmp/enviroos-second-device.png',fullPage:true});
  await page.evaluate(()=>EnviroOS.UI.toggleTheme());
  await page.screenshot({path:'/tmp/enviroos-second-device-dark.png',fullPage:true});
  await page.setViewport({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'/tmp/enviroos-second-device-mobile.png',fullPage:true});
  await page.setViewport({width:1440,height:1000});
  await page.click('[data-pause-second-device]');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>EnviroOS.UI.go('second-device'));
  assert.equal(await page.evaluate(()=>__mqtt.sockets.length),0);
  assert.equal(await page.evaluate(()=>EnviroOS.UI.secondDevice.status().remembered),true);
  await page.waitForSelector('[data-connect-second-device]');
  assert.match(await page.$eval('[data-connect-second-device]',e=>e.textContent),/Resume/);
  await page.click('[data-connect-second-device]');
  assert.equal(await page.evaluate(()=>EnviroOS.UI.isDlgOpen()),false);
  await page.waitForFunction(()=>__mqtt.sockets.length===1&&__mqtt.sockets[0].readyState===1);
  await page.evaluate(data=>__mqtt.emit('esp32bot/4493A6470968/sensors',data),reading);
  await page.waitForFunction(()=>EnviroOS.UI.secondDevice.status().online);
  async function selectModel(main,secondary){
   await page.evaluate(()=>EnviroOS.UI.dlgSignIn(true));
   await page.select('#signin-main-model',main);await page.select('#signin-asst-model',secondary);await page.click('#signin-submit');
   await page.waitForFunction(()=>!EnviroOS.UI.isDlgOpen());
  }
  await selectModel('Enviro Advanced','Enviro Basic');
  assert.match(await page.$eval('#tabs [data-go=second-device]',e=>e.textContent),/Enviro D2/);
  await page.evaluate(()=>EnviroOS.UI.dlgNodes());
  assert.match(await page.$eval('[data-pick-node="4493A6470968"]:not([data-open-device-slot])',e=>e.textContent),/Enviro Advanced/);
  assert.match(await page.$eval('[data-open-device-slot="enviro-d2"]',e=>e.textContent),/Enviro Basic/);
  await page.evaluate(()=>EnviroOS.UI.closeDlg());
  await selectModel('Enviro Basic','Enviro Advanced');
  assert.match(await page.$eval('#tabs [data-go=second-device]',e=>e.textContent),/Enviro D2/);
  await selectModel('Enviro Advanced','Rover');
  assert.equal(await page.$$eval('#tabs [data-go=rover]',els=>els.length),0);
  await selectModel('Rover','none');
  assert.equal(await page.$$eval('#tabs [data-go=rover]',els=>els.length),1);
  assert.equal(await page.$$eval('#tabs .tab',els=>els.length),7);
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
  await page.evaluate(()=>EnviroOS.UI.dlgSignIn(true));
  await page.select('#signin-main-model','Enviro Basic');
  await page.select('#signin-main-model','Rover');
  await page.select('#signin-asst-model','Enviro Advanced');
  assert.deepEqual(await page.$$eval('#signin-other-model option', options => options.map(option => option.value)),
    ['Enviro Basic', 'Enviro Advanced', 'Rover', 'none']);
  assert.equal(await page.$eval('#signin-other-model', select => select.value), 'none');
  await page.select('#signin-other-model','Enviro Basic');
  assert.equal(await page.$('#f-signin [id$="-nodes"]'),null);
  await page.click('#signin-submit');
  await page.evaluate(()=>{
    const ui = EnviroOS.UI;
    ui.auth.mainNodeCount = 2;
    ui.saveAuth(ui.auth);
    ui.go('second-device');
  });
  const deviceTabs = '#rail .device-tab';
  assert.deepEqual(await page.$$eval(deviceTabs + ' .tab-lbl', labels => labels.map(label => label.textContent)),
    ['Enviro D2', 'Enviro D3', 'Enviro D4']);
  assert.equal(await page.$('.other-node-picker'),null);
  await page.click('#rail [data-go="other-device-3"]');
  assert.equal(await page.$eval('.device-page h1', title=>title.textContent),'Enviro D4');
  assert.equal(await page.$eval('.device-identity p', title=>title.textContent),'Enviro Basic');
  await page.click('[data-connect-second-device]');
  await page.type('#other-node-id','AB:CD:EF:12:34:56');
  await page.click('#other-node-form button[type=submit]');
  await page.waitForFunction(()=>__mqtt.sockets.some(socket=>socket.sent.some(bytes=>new TextDecoder().decode(new Uint8Array(bytes)).includes('ABCDEF123456/sensors'))));
  await page.evaluate(()=>__mqtt.emit('esp32bot/ABCDEF123456/sensors',{device:'ABCDEF123456',bh1750:{ok:true,lux:123}}));
  await page.waitForFunction(()=>document.querySelector('[data-second-lux]')?.textContent==='123 lx');
  await page.click('#rail [data-go="other-device-2"]');
  assert.equal(await page.$eval('#rail [data-go="other-device-2"]',tab=>tab.getAttribute('aria-selected')),'true');
  assert.equal(await page.$eval('[data-second-lux]',e=>e.textContent),'—');
  assert.equal(await page.$('[data-connect-second-device]'),null);
  await page.waitForFunction(()=>__mqtt.sockets.some(socket=>socket.readyState===1&&socket.sent.some(bytes=>new TextDecoder().decode(new Uint8Array(bytes)).includes('149853470968/sensors'))));
  await page.evaluate(()=>__mqtt.emit('esp32bot/149853470968/sensors',{bh1750:{ok:true,lux:77}}));
  await page.waitForFunction(()=>document.querySelector('[data-second-lux]')?.textContent==='77 lx');
  assert.equal(await page.$eval('.device-hud-badge',el=>el.dataset.connection),'live');
  assert.equal(await page.$('.device-nutrients'), null);
  await page.click('#s-second-device [data-open-rover-pumps]');
  assert.equal(await page.evaluate(()=>EnviroOS.UI.route), 'rover');
  assert.match(await page.$eval('.device-hud-facts',el=>el.textContent),/149853470968.*MQTT broker.*Connected/s);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    localStorage.setItem('enviroos.mqtt.dev', JSON.stringify({deviceId:'149853470968'}));
    EnviroOS.UI.useSource('live');
    EnviroOS.UI.dlgNodes();
  });
  assert.equal(await page.evaluate(()=>EnviroOS.UI.mqtt.deviceId),'4493A6470968');
  await page.click('[data-pick-node="149853470968"]');
  assert.equal(await page.evaluate(()=>EnviroOS.UI.route),'other-device-2');
  assert.equal(await page.evaluate(()=>EnviroOS.UI.mqtt.deviceId),'4493A6470968');
  await page.evaluate(()=>{
    __mqtt.emit('esp32bot/149853470968/sensors',{device:'149853470968',bh1750:{ok:true,lux:77}});
    __mqtt.emit('esp32bot/4493A6470968/sensors',{device:'149853470968',bh1750:{ok:true,lux:77}});
  });
  assert.equal(await page.evaluate(()=>EnviroOS.UI.mqtt.reading.lux),null);
  await page.evaluate(()=>EnviroOS.UI.go('home'));
  assert.equal(await page.$$eval('#s-home .configured-nodes .half', cards=>cards.length),1);
  await page.evaluate(()=>EnviroOS.UI.openOtherNode('other-0'));
  assert.equal(await page.evaluate(()=>EnviroOS.UI.auth.otherModel),'Enviro Basic');
  assert.equal(await page.$$eval(deviceTabs, tabs=>tabs.length),3);
  await page.waitForFunction(()=>__mqtt.sockets.some(socket=>socket.sent.some(bytes=>new TextDecoder().decode(new Uint8Array(bytes)).includes('ABCDEF123456/sensors'))));
  await page.evaluate(()=>EnviroOS.UI.dlgSignIn(true));
  await page.select('#signin-main-model','Rover');
  await page.select('#signin-asst-model','none');
  await page.select('#signin-other-model','Rover');
  await page.click('#signin-submit');
  await page.evaluate(()=>{
    const ui = EnviroOS.UI;
    ui.auth.otherNodeCount = 3;
    ui.go('second-device');
  });
  assert.deepEqual(await page.evaluate(()=>EnviroOS.UI.otherDeviceRoutes.map(route=>EnviroOS.UI.otherDeviceForRoute(route).key)),
    ['enviro-d2', 'enviro-d3', 'other-2']);
  await page.setViewport({width:390,height:640});
  assert(await page.evaluate(()=>{
    const first = document.querySelector('#rail .tab').getBoundingClientRect();
    const last = document.querySelector('#rail [data-go="other-device-3"]').getBoundingClientRect();
    const account = document.querySelector('.rail-account').getBoundingClientRect();
    return first.top < 20 && last.bottom <= account.top && document.documentElement.scrollWidth <= innerWidth + 1;
  }));
  await page.click('#rail [data-go="other-device-2"]');
  assert.equal(await page.$eval('.device-page h1',title=>title.textContent),'Enviro D3');
  assert(await page.$('.device-page .screen-top .ptitle'));
  assert(await page.$('.device-page .card .device-metrics .stic'));
  await page.addStyleTag({content:'.rail .tab { transition: none !important; }'});
  for (const theme of ['light', 'dark']) {
    const colors = await page.evaluate(theme=>{
      localStorage.setItem('enviroos.theme', theme);
      EnviroOS.UI.applyTheme();
      return ['home', 'second-device', 'other-device-2'].map(route=>{
        EnviroOS.UI.go(route);
        const active = document.querySelector('.rail [aria-selected="true"]');
        const style = getComputedStyle(active);
        return [style.color, style.backgroundColor];
      });
    }, theme);
    assert.deepEqual(colors[1], colors[0]);
    assert.deepEqual(colors[2], colors[0]);
  }
  await page.evaluate(()=>EnviroOS.UI.dlgSignIn(true));
  await page.select('#signin-other-model','none');
  await page.click('#signin-submit');
  assert.equal(await page.$$eval('#tabs [data-go=second-device]',els=>els.length),0);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: known and saved device autoconnect, no device selector, MQTT handshake retry, late live recovery from Auto demo, exact topic pairing, MAC input, connection HUD, main feed isolation, separate device sidebar tabs, compact mobile navigation, optional third model, shared four-node limit, second-node setup, exact device discovery, retained/demo rejection, real zero readings, saved reconnect, offline handling, broker recovery, pause persistence, model-based Rover visibility, frame removal and matching light/dark themes. MQTT transport was simulated; no hardware commands sent.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
