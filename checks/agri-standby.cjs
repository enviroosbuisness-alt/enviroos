const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');

(async () => {
  const browser = await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    await page.setViewport({width:1366,height:768});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('enviroos.auth', JSON.stringify({name:'Voice check',mainModel:'Enviro Advanced',assistantModel:'Enviro Pro'}));
      localStorage.setItem('enviroos.profile', JSON.stringify({onboarded:true}));
      localStorage.setItem('enviroos.source', 'demo');
      localStorage.setItem('enviroos.lang', 'en');
      const permission = new EventTarget();
      permission.state = 'prompt';
      window.voicePermission = value => {
        permission.state = value;
        permission.dispatchEvent(new Event('change'));
      };
      const query = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = params => params.name === 'microphone' ? Promise.resolve(permission) : query(params);
      window.recordings = [];
      window.packs = new Set(['en-US','hi-IN','fr-FR']);
      window.denyNext = false;
      window.SpeechRecognition = class {
        static async available({langs,processLocally}) {
          if (!processLocally) throw Error('Standby requested remote recognition');
          return packs.has(langs[0]) ? 'available' : 'unavailable';
        }
        processLocally = false;
        start() {
          if (recordings.some(item => item.active)) throw Error('Overlapping microphone sessions');
          this.active = true;
          recordings.push(this);
          setTimeout(() => {
            if (!this.active) return;
            if (denyNext) {
              window.denyNext = false;
              this.onerror?.({error:'not-allowed'});
            } else this.onstart?.();
          }, 5);
        }
        abort() {
          this.active = false;
          setTimeout(() => this.onend?.(), 5);
        }
      };
      window.spoken = [];
      let playing;
      Object.defineProperty(window,'speechSynthesis',{value:{
        get speaking(){ return Boolean(playing); },
        getVoices:()=>[],
        addEventListener(){},
        speak(utterance){ playing = utterance; spoken.push(utterance); },
        cancel(){ playing = null; },
        finish(){ const utterance = playing; playing = null; utterance?.onend?.(); },
        fail(){ const utterance = playing; playing = null; utterance?.onerror?.({error:'voice-unavailable'}); }
      }});
      window.hear = (text, final = true) => {
        const row = [{transcript:text}];
        row.isFinal = final;
        recordings.at(-1).onresult?.({resultIndex:0,results:[row]});
      };
    });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173', {waitUntil:'networkidle2'});
    await page.waitForFunction(() => window.EnviroOS?.UI?.auth);
    await page.evaluate(async () => {
      const timing = (await import('/js/hands-free.js')).voiceTiming;
      timing.followUpMs = 800;
      timing.silenceMs = 80;
      window.questions = [];
      window.holdAnswer = false;
      EnviroOS.gemini.configured = () => true;
      EnviroOS.gemini.generateAgriAnswer = async (text, history, snapshot, analysis, profile, lang, image, options) => {
        if (!options.readOnly) return 'Typed chat still works.';
        questions.push({text,history:history.length,snapshot,lang,readOnly:options.readOnly,signal:options.signal});
        if (holdAnswer) await new Promise(resolve => {window.releaseAnswer = resolve;});
        return 'Mock answer for ' + text;
      };
      EnviroOS.voice.answerCommand = async () => { throw Error('Voice question called the hardware command dispatcher'); };
    });
    const state = status => page.waitForFunction(value => EnviroOS.voice.handsFree.state().status === value, {}, status);
    assert.equal(await page.evaluate(()=>recordings.length),0,'Standby must require opt-in');
    assert.equal(await page.$eval('#btn-node', e=>e.innerText), 'Enviro Advanced');
    assert(await page.$('#btn-node .dot.on'));
    await page.evaluate(() => EnviroOS.UI.dlgSignIn(true));
    assert.equal(await page.$$eval('select option[value="Enviro Advanced"]', items => items.length),2);
    await page.evaluate(() => EnviroOS.UI.closeDlg());

    await page.click('#btn-wake');
    assert.equal(await page.evaluate(()=>EnviroOS.UI.isDlgOpen()),false);
    await state('standby');
    await page.click('#btn-wake');
    await state('disabled');
    assert.equal(await page.$('#btn-wake .dot.on'),null);
    assert.equal(await page.evaluate(()=>EnviroOS.UI.isDlgOpen()),false);
    await page.click('#btn-wake');
    await state('standby');
    assert(await page.$('#btn-wake .dot.on'));
    assert.equal(await page.evaluate(()=>recordings.at(-1).processLocally),true);
    await page.evaluate(()=>{ EnviroOS.UI.closeDlg(); voicePermission('granted'); });
    await page.evaluate(()=>hear('agriculture and irrigation'));
    assert(await page.$eval('#hands-free-panel', e=>e.hidden));
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'voice-screen-draft';
      input.value = 'Unsubmitted field note';
      document.querySelector('.screen.active').prepend(input);
      input.focus();
      window.originalDraft = input;
      hear('Hey, Agri, how wet', false);
    });
    await state('listening');
    await page.evaluate(()=>hear('Hey, Agri. how wet is the soil?'));
    await state('speaking');
    assert.deepEqual(await page.evaluate(()=>questions.map(item=>item.text)),['how wet is the soil?']);
    assert(await page.evaluate(()=>questions[0].snapshot === null && !recordings.at(-1).active));
    assert(await page.evaluate(()=>EnviroOS.UI.route === 'home' && document.activeElement === originalDraft && originalDraft.value === 'Unsubmitted field note'));
    assert.match(await page.$eval('#hf-answer',e=>e.textContent),/Mock answer/);
    await page.evaluate(()=>hear('Hey Agri, stop the irrigation'));
    assert.equal(await page.evaluate(()=>questions.length),1);
    await page.waitForFunction(()=>spoken.length === 1);
    assert.equal(await page.evaluate(()=>spoken[0].lang),'en-US');
    await page.click('#hf-stop');
    await page.waitForFunction(()=>EnviroOS.voice.handsFree.state().listening);
    await page.evaluate(()=>hear('What can I check next?'));
    await page.waitForFunction(()=>questions.length===2);
    assert(await page.evaluate(()=>questions[1].history >= 2));
    await page.waitForFunction(()=>spoken.length===2);
    await page.evaluate(()=>speechSynthesis.finish());
    await state('standby');

    await page.setViewport({width:390,height:844});
    await page.evaluate(()=>{EnviroOS.UI.go('crop'); EnviroOS.i18n.setLang('hi');});
    await state('standby');
    assert.equal(await page.evaluate(()=>recordings.at(-1).lang),'hi-IN');
    await page.evaluate(()=>{
      window.holdAnswer = true;
      const first = Object.assign([{transcript:'हे'}], {isFinal:true});
      const second = Object.assign([{transcript:'एग्री, मिट्टी कैसी है?'}], {isFinal:true});
      recordings.at(-1).onresult({resultIndex:1,results:[first,second]});
    });
    await state('processing');
    assert.equal(await page.evaluate(()=>EnviroOS.UI.route),'crop');
    assert(await page.evaluate(()=>document.querySelector('#hands-free-panel').getBoundingClientRect().right <= innerWidth));
    await page.screenshot({path:'/tmp/enviro-hands-free-phone.png'});
    await page.click('#hf-dismiss');
    await page.evaluate(()=>{window.releaseAnswer(); window.holdAnswer=false;});
    await state('standby');
    assert(await page.evaluate(()=>questions.at(-1).signal.aborted && document.querySelector('#hands-free-panel').hidden));

    await page.evaluate(()=>EnviroOS.i18n.setLang('gu'));
    await state('standby');
    assert(await page.evaluate(()=>EnviroOS.voice.handsFree.state().fallback && recordings.at(-1).lang==='en-US'));
    await page.evaluate(()=>hear('Hey Agri'));
    await state('follow_up');
    await page.click('#hf-talk');
    await state('listening');
    assert(await page.evaluate(()=>recordings.at(-1).lang==='gu-IN' && !recordings.at(-1).processLocally));
    await page.evaluate(()=>{ Object.defineProperty(navigator,'onLine',{value:false,configurable:true}); hear('જમીન વિશે કહો'); });
    await state('error');
    assert(await page.$eval('#hf-retry',e=>!e.hidden));
    assert.equal(await page.evaluate(()=>EnviroOS.voice.handsFree.state().error),'hf_offline');
    await page.evaluate(()=>{delete navigator.onLine; voicePermission('denied');});
    await state('error');
    assert(await page.evaluate(()=>!recordings.at(-1).active));
    await page.evaluate(()=>{EnviroOS.voice.setWake(false); EnviroOS.voice.setWake(true);});
    await state('error');
    assert.equal(await page.evaluate(()=>EnviroOS.voice.handsFree.state().error),'hf_denied');
    await page.evaluate(()=>voicePermission('granted'));
    await state('standby');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
    await state('suspended');
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    await state('standby');
    await page.evaluate(()=>{ EnviroOS.i18n.setLang('fr'); });
    await state('standby');
    await page.evaluate(()=>hear('Salut Agri, quel est le temps ?'));
    await page.waitForFunction(()=>spoken.length===3);
    assert.equal(await page.evaluate(()=>spoken.at(-1).lang),'fr-FR');
    await page.evaluate(()=>speechSynthesis.fail());
    await page.waitForFunction(()=>EnviroOS.voice.handsFree.state().notice==='hf_no_speech_output');
    assert.match(await page.$eval('#hf-answer',e=>e.textContent),/Mock answer/);
    await page.evaluate(()=>{ EnviroOS.voice.handsFree.dismiss(); packs.clear(); EnviroOS.i18n.setLang('en'); });
    await state('tap');
    assert(await page.evaluate(()=>recordings.every(entry=>!entry.active)));
    await page.click('#btn-wake');
    await state('disabled');
    await page.click('#btn-wake');
    await state('tap');
    await page.click('#hf-trial');
    await state('wake_test');
    assert.equal(await page.evaluate(()=>recordings.at(-1).processLocally),false);
    await page.evaluate(()=>hear('Hey, Agri, test the fallback'));
    await state('speaking');
    assert.equal(await page.evaluate(()=>questions.at(-1).text),'test the fallback');
    await page.click('#hf-dismiss');
    await state('tap');
    await page.evaluate(()=>{ window.denyNext=true; EnviroOS.voice.handsFree.test(); });
    await state('error');
    assert.equal(await page.evaluate(()=>EnviroOS.voice.handsFree.state().error),'hf_service');
    await page.evaluate(()=>{ EnviroOS.voice.setWake(false); EnviroOS.UI.go('agri'); });
    await state('disabled');
    assert.equal(await page.$('#btn-wake .dot.on'),null);
    await page.evaluate(()=>EnviroOS.UI.handleAgriQuery('Typed question'));
    assert.match(await page.$eval('#agritalklog',e=>e.textContent),/Typed chat still works/);
    assert.deepEqual(errors,[]);
    console.log('PASS: model choices/lights, opt-in, language packs and fallback, popup without navigation, chat history, speech, follow-up, denial/revocation, suspension, offline retry and cancellation. Audio and AI mocked.');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode=1;});
