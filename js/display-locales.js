// Display preferences are used for rendered text. Protocol values and IDs stay unchanged.
const locales = {
  en:'en-IN', hi:'hi-IN-u-nu-deva', mr:'mr-IN-u-nu-deva', gu:'gu-IN-u-nu-gujr',
  pa:'pa-IN-u-nu-guru', ta:'ta-IN-u-nu-tamldec', te:'te-IN-u-nu-telu',
  kn:'kn-IN-u-nu-knda', bn:'bn-IN-u-nu-beng', es:'es-ES', fr:'fr-FR',
  pt:'pt-BR', it:'it-IT', zh:'zh-CN-u-nu-hanidec', de:'de-DE'
};

export const displayLocale = language => locales[language] || locales.en;
const formats = new Map();

export function displayNumber(value, locale, maximumFractionDigits = 0) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const key = locale + '|' + maximumFractionDigits;
  if (!formats.has(key)) {
    formats.set(key, new Intl.NumberFormat(locale, {maximumFractionDigits}));
  }
  return formats.get(key).format(Number(value));
}
