import { catalogs } from './locale-catalogs.js';
import { displayLocale, displayNumber } from './display-locales.js';

window.EnviroOS ??= {};

(function () {
  const E = window.EnviroOS;
  const STRINGS = Object.fromEntries(Object.entries(catalogs).map(([language, catalog]) => [
    language,
    Object.assign({}, ...Object.entries(catalog)
      .filter(([section]) => section !== 'rover')
      .map(([, labels]) => labels)),
  ]));

  const LANGS = [
    { id: 'en', label: 'English', name: 'English', native: 'English', group: 'neutral', code: 'EN' },
    { id: 'hi', label: 'Hindi', name: 'Hindi', native: 'हिन्दी', group: 'indian', code: 'HI' },
    { id: 'mr', label: 'Marathi', name: 'Marathi', native: 'मराठी', group: 'indian', code: 'MR' },
    { id: 'gu', label: 'Gujarati', name: 'Gujarati', native: 'ગુજરાતી', group: 'indian', code: 'GU' },
    { id: 'pa', label: 'Punjabi', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', group: 'indian', code: 'PA' },
    { id: 'ta', label: 'Tamil', name: 'Tamil', native: 'தமிழ்', group: 'indian', code: 'TA' },
    { id: 'te', label: 'Telugu', name: 'Telugu', native: 'తెలుగు', group: 'indian', code: 'TE' },
    { id: 'kn', label: 'Kannada', name: 'Kannada', native: 'ಕನ್ನಡ', group: 'indian', code: 'KN' },
    { id: 'bn', label: 'Bengali', name: 'Bengali', native: 'বাংলা', group: 'indian', code: 'BN' },
    { id: 'es', label: 'Spanish', name: 'Spanish', native: 'Español', group: 'international', code: 'ES' },
    { id: 'fr', label: 'French', name: 'French', native: 'Français', group: 'international', code: 'FR' },
    { id: 'pt', label: 'Portuguese', name: 'Portuguese', native: 'Português', group: 'international', code: 'PT' },
    { id: 'it', label: 'Italian', name: 'Italian', native: 'Italiano', group: 'international', code: 'IT' },
    { id: 'zh', label: 'Mandarin', name: 'Mandarin Chinese', native: '中文 (普通话)', group: 'international', code: 'ZH' },
    { id: 'de', label: 'German', name: 'German', native: 'Deutsch', group: 'international', code: 'DE' }
  ];

  const languageKey = 'enviroos.lang';
  const rtlLanguages = new Set(['ar', 'fa', 'he', 'ur']);
  let current = 'en';
  try {
    const saved = localStorage.getItem(languageKey);
    if (Object.hasOwn(STRINGS, saved)) current = saved;
  } catch (_) { /* Storage may be unavailable. */ }

  function t(key, values = {}) {
    const message = STRINGS[current][key] ?? STRINGS.en[key] ?? key;
    return message.replace(/\{(\w+)\}/g, (token, name) =>
      Object.hasOwn(values, name) ? String(values[name]) : token);
  }

  function plural(key, count) {
    const locale = displayLocale(current);
    const category = new Intl.PluralRules(locale).select(count);
    const variant = key + '_' + category;
    const messageKey = Object.hasOwn(STRINGS[current], variant) ? variant : key + '_other';
    return t(messageKey, { count: displayNumber(count, locale) });
  }

  function applyDocumentLanguage() {
    const root = document.documentElement;
    root.lang = current;
    root.dir = rtlLanguages.has(current.split('-')[0]) ? 'rtl' : 'ltr';
    document.title = t('app_page_title');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('app_description'));
  }

  function setLang(id) {
    if (!Object.hasOwn(STRINGS, id)) return;
    const changed = current !== id;
    current = id;
    try { localStorage.setItem(languageKey, id); } catch (_) { /* Storage may be unavailable. */ }
    applyDocumentLanguage();
    if (changed) E.voice?.refreshLang?.();
  }

  E.i18n = {
    t, plural, setLang, applyDocumentLanguage, LANGS, STRINGS,
    get lang() { return current; },
    get locale() { return displayLocale(current); },
    number(value, decimals = 0) { return displayNumber(value, displayLocale(current), decimals); },
    date(value, options) {
      if (value == null || value === '') return '—';
      const date = new Date(value);
      return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(displayLocale(current), options).format(date) : '—';
    }
  };
})();
