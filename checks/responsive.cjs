const puppeteer=require('puppeteer-core'),assert=require('node:assert/strict');
(async()=>{const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message);});await page.evaluateOnNewDocument(()=>{localStorage.setItem('enviroos.auth',JSON.stringify({name:'Responsive check',mainModel:'Rover',assistantModel:'Enviro Basic'}));localStorage.setItem('enviroos.profile',JSON.stringify({onboarded:true}));localStorage.setItem('enviroos.source','demo');localStorage.setItem('enviroos.lang','en');});
await page.goto(process.env.APP_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle2'});
for(const [width,height,device] of [[320,740,'mobile'],[390,844,'mobile'],[768,1024,'tablet'],[1024,768,'tablet'],[1440,1000,'desktop'],[844,390,'tablet']]){
 await page.setViewport({width,height});await page.waitForFunction(expected=>document.documentElement.dataset.device===expected,{},device);
 assert.equal(await page.$eval('.tabs',e=>getComputedStyle(e).display),'none');
 assert.equal(await page.$eval('.rail',e=>getComputedStyle(e).display),'block');
 assert(await page.$$eval('.rail .tab',els=>els.every(el=>el.getAttribute('aria-label')&&el.offsetWidth>=48&&el.offsetHeight>=48)));
 for(const route of ['home','soil','crop','weather','market','second-device','rover']){
  await page.evaluate(route=>EnviroOS.UI.go(route),route);
  assert.equal(await page.evaluate(()=>EnviroOS.UI.route),route);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route} overflow at ${width}`);
 }
}
await page.setViewport({width:390,height:844});await page.evaluate(()=>EnviroOS.UI.go('home'));
assert.equal(await page.$eval('#sheet',e=>getComputedStyle(e).visibility),'hidden');
assert.notEqual(await page.$eval('#btn-lang .ui-ic',e=>getComputedStyle(e).display),'none');
await page.click('.rail [data-go=market]');assert.equal(await page.evaluate(()=>EnviroOS.UI.route),'market');
await page.click('#btn-lang');await page.waitForFunction(()=>EnviroOS.UI.isDlgOpen(),{timeout:5000});await page.evaluate(()=>EnviroOS.UI.closeDlg());
await page.click('#btn-theme');assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
await page.evaluate(()=>EnviroOS.UI.go('home'));await page.screenshot({path:'/tmp/enviroos-adaptive-mobile.png',fullPage:true});
assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: 42 screen/viewport checks, icon-only accessible navigation, touch targets, mobile language/theme controls, closed overlay visibility and orientation adaptation.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
