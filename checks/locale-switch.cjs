const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

async function run() {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    const url = process.env.APP_URL || 'http://127.0.0.1:5173';
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const target = new URL(request.url());
      if (target.pathname === '/qr/cards') {
        void request.respond({status: 200, contentType: 'application/json', body: '[]'});
      } else if (target.origin !== new URL(url).origin || target.pathname.startsWith('/rover-pi/')) {
        void request.abort();
      } else {
        void request.continue();
      }
    });
    await page.evaluateOnNewDocument(() => {
      if (window !== window.top || localStorage.getItem('locale-check.initialized')) return;
      localStorage.setItem('locale-check.initialized', '1');
      localStorage.setItem('enviroos.auth', JSON.stringify({
        name: 'Locale check', mainModel: 'Rover', assistantModel: 'Enviro Advanced', otherModel: 'Enviro Basic'
      }));
      localStorage.setItem('enviroos.profile', JSON.stringify({onboarded: true}));
      localStorage.setItem('enviroos.source', 'demo');
      localStorage.setItem('enviroos.lang', 'en');
    });
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.EnviroOS?.UI?._lastRoute === 'home');
    await page.setViewport({width: 1365, height: 900});
    await page.evaluate(() => EnviroOS.UI.go('market'));
    const languages = await page.evaluate(() => EnviroOS.i18n.LANGS);
    const toTest = languages.filter(({id}) => id !== 'it').concat(languages.filter(({id}) => id === 'it'));

    for (const {id, group} of toTest) {
      await page.click('#btn-lang');
      if (group !== 'neutral') await page.click(`[data-lang-tab="${group}"]`);
      await page.click(`[data-lang="${id}"]`);
      await page.waitForFunction(expected => document.documentElement.lang === expected, {}, id);
      const result = await page.evaluate(() => {
        const {i18n, UI} = EnviroOS;
        const catalog = i18n.STRINGS[i18n.lang];
        const card = document.querySelector('#s-market .mk-card');
        const edge = card?.getBoundingClientRect().right;
        return {
          route: UI.route,
          persist: localStorage.getItem('enviroos.lang'),
          titleMatches: document.title === catalog.app_page_title,
          descriptionMatches: document.querySelector('meta[name="description"]').content === catalog.app_description,
          navMatches: document.querySelector('aside.rail').getAttribute('aria-label') === catalog.main_navigation,
          marketMatches: document.querySelector('#s-market').textContent.includes(catalog.mk_specs),
          gridOverflow: [...(card?.querySelectorAll('.mk-actions-row .btn') ?? [])]
            .some(button => button.getBoundingClientRect().right > edge + 1),
          pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        };
      });
      assert.deepEqual(result, {
        route: 'market', persist: id, titleMatches: true, descriptionMatches: true,
        navMatches: true, marketMatches: true, gridOverflow: false, pageOverflow: false,
      }, id);
    }

    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => document.documentElement.lang === 'it');
    for (const width of [390, 1365]) {
      await page.setViewport({width, height: 900});
      for (const route of ['home', 'soil', 'crop', 'weather', 'agri', 'market', 'second-device', 'rover']) {
        await page.evaluate(route => EnviroOS.UI.go(route), route);
        assert.equal(await page.evaluate(() => EnviroOS.UI.route), route);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${route} overflow at ${width}px`);
      }
    }
    const rover = (await page.waitForSelector('#rover-mission-control'));
    const frame = await rover.contentFrame();
    await frame.waitForFunction(() => document.documentElement.lang === 'it');
    assert.equal(await frame.$eval('#manualMode', button => button.textContent.trim()), 'Guida manuale');
    assert.equal(await page.evaluate(() => EnviroOS.i18n.plural('chist_reading_count', 1)), '1 lettura');
    assert.equal(await page.evaluate(() => EnviroOS.i18n.plural('chist_reading_count', 2)), '2 letture');
    await frame.$eval('#qrFrame', element => { element.src = 'qr.html'; element.closest('dialog').showModal(); });
    const qr = await (await frame.$('#qrFrame')).contentFrame();
    try {
      await qr.waitForFunction(() => document.documentElement.lang === 'it', {timeout: 8000});
    } catch (error) {
      const state = await qr.evaluate(() => ({ url: location.href, lang: document.documentElement.lang, title: document.title }));
      throw new Error(JSON.stringify({state, errors}), {cause: error});
    }
    assert.equal(await qr.$eval('#label', input => input.placeholder), 'Ingresso della serra');
    assert.equal(await qr.$eval('.qr-commands span', label => label.textContent), 'Comandi');
    await qr.$eval('#commands', field => { field.value = 'forward(3), wait(5)'; });
    await qr.$eval('#label', input => { input.value = 'North gate'; });
    await page.evaluate(() => {
      EnviroOS.i18n.setLang('de');
      EnviroOS.UI.render();
    });
    await qr.waitForFunction(() => document.documentElement.lang === 'de', {timeout: 8000});
    assert.equal(await qr.$eval('#label', input => input.value), 'North gate');
    assert.equal(await qr.$eval('.qr-commands span', label => label.textContent), 'Befehle');
    assert.equal(await qr.$eval('#commands', field => field.value), 'forward(3), wait(5)');
    assert.deepEqual(errors, []);
    console.log('PASS: 15 live language switches, labels and metadata, persisted selection, Italian layouts at two widths, plural forms, and Rover and QR locale sync.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
