// Embedded Rover views share EnviroOS's language without reloading the drive session.
let preference = {lang:'en', locale:'en-IN', labels:{}};

export const roverText = text => preference.labels[text] || text;

export function roverNumber(value, decimalPlaces = 0) {
  return Number.isFinite(value) ? new Intl.NumberFormat(preference.locale, {
    minimumFractionDigits:decimalPlaces, maximumFractionDigits:decimalPlaces
  }).format(value) : '—';
}

export function roverDate(value, options) {
  return new Intl.DateTimeFormat(preference.locale, options).format(value);
}

export function roverLabel(element, source) {
  element.dataset.roverText = source;
  const text = roverText(source);
  if (element.textContent !== text) element.textContent = text;
}

export function roverLocale() {
  return preference;
}

export function receiveRoverLocale(event) {
  if (event.source !== window.parent || event.origin !== location.origin ||
      event.data?.type !== 'enviroos:rover-locale') return false;
  const {lang, locale, labels} = event.data;
  if (typeof lang !== 'string' || typeof locale !== 'string' || !labels) return false;
  preference = {lang, locale, labels};
  document.documentElement.lang = lang;
  document.documentElement.dir = /^(ar|fa|he|ur)(-|$)/i.test(lang) ? 'rtl' : 'ltr';
  for (const element of document.querySelectorAll('[data-rover-text]')) {
    roverLabel(element, element.dataset.roverText);
  }
  const attributes = {aria: 'aria-label', title: 'title', alt: 'alt', placeholder: 'placeholder'};
  for (const [annotation, attribute] of Object.entries(attributes)) {
    const key = 'data-rover-' + annotation;
    for (const element of document.querySelectorAll('[' + key + ']')) {
      element.setAttribute(attribute, roverText(element.getAttribute(key)));
    }
  }
  return true;
}
