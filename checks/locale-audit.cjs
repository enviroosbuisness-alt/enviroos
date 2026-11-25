const { readdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

const directory = path.resolve(__dirname, '../js/locales');
const catalogs = Object.fromEntries(readdirSync(directory).filter(file => file.endsWith('.json'))
  .map(file => [file.slice(0, -5), JSON.parse(readFileSync(path.join(directory, file), 'utf8'))]));

function catalogEntries(catalog) {
  return Object.entries(catalog).flatMap(([section, labels]) =>
    Object.entries(labels).map(([key, value]) => [section + '.' + key, value]));
}

function placeholders(value) {
  return [...new Set(value.match(/\{\w+\}/g) ?? [])].sort().join(' ');
}

const base = new Map(catalogEntries(catalogs.en));
const appKeys = new Set([...base.keys()].filter(key => !key.startsWith('rover.'))
  .map(key => key.slice(key.indexOf('.') + 1)));
const jsDirectory = path.resolve(__dirname, '../js');
const jsFiles = readdirSync(jsDirectory).filter(file => file.endsWith('.js'));
const undefinedReferences = jsFiles.flatMap(file =>
  [...readFileSync(path.join(jsDirectory, file), 'utf8').matchAll(/\bt\(['"]([a-zA-Z0-9_]+)['"]\)/g)]
    .filter(([, key]) => !appKeys.has(key)).map(([, key]) => file + ': ' + key));
const markup = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
for (const [, key] of markup.matchAll(/\bdata-i18n(?:-[\w-]+)?="([\w_]+)"/g)) {
  if (!appKeys.has(key)) undefinedReferences.push('index.html: ' + key);
}
if (undefinedReferences.length) console.log('Undefined keys: ' + [...new Set(undefinedReferences)].join(', '));

const roverDirectory = path.resolve(__dirname, '../public/rover');
const appViews = ['../index.html', ...jsFiles.map(file => '../js/' + file)];
const roverViews = readdirSync(roverDirectory).filter(file => file.endsWith('.html'))
  .map(file => '../public/rover/' + file);
const rawAttributes = [];
const untranslatedRoverAnnotations = new Set();
for (const file of [...appViews, ...roverViews]) {
  const html = readFileSync(path.resolve(__dirname, file), 'utf8');
  for (const tag of html.matchAll(/<(?:button|a|input|textarea|select|img|iframe|aside|section|nav)\b[^>]*>/g)) {
    for (const [, attribute, value] of tag[0].matchAll(/\b(aria-label|title|alt|placeholder)="([A-Za-z][^"$<>{]*)"/g)) {
      const suffix = attribute === 'aria-label' ? 'aria' : attribute;
      if (tag[0].includes('data-rover-' + suffix + '=') || tag[0].includes('data-i18n-' + suffix + '=')) continue;
      rawAttributes.push(`${file}: ${attribute}="${value}"`);
    }
  }
  if (roverViews.includes(file)) {
    for (const [, label] of html.matchAll(/\bdata-rover-(?:text|aria|title|alt|placeholder)="([^"]+)"/g)) {
      if (!base.has('rover.' + label)) untranslatedRoverAnnotations.add(label);
    }
  }
}
console.log(`Literal accessibility, tooltip, and placeholder attributes to review: ${rawAttributes.length}`);
if (process.argv.includes('--details')) {
  console.log(rawAttributes.join('\n'));
  console.log('Uncataloged Rover annotations: ' + [...untranslatedRoverAnnotations].join(', '));
}

const details = process.argv.includes('--details');
let review = rawAttributes.length + untranslatedRoverAnnotations.size;
let structuralErrors = undefinedReferences.length;
for (const [language, catalog] of Object.entries(catalogs)) {
  if (language === 'en') continue;
  const entries = new Map(catalogEntries(catalog));
  const missing = [];
  const identical = [];
  const mismatched = [];
  for (const [key, english] of base) {
    const value = entries.get(key);
    if (typeof value !== 'string' || !value.trim()) missing.push(key);
    else if (placeholders(value) !== placeholders(english)) mismatched.push(key);
    else if (value === english) identical.push(key);
  }
  const extra = [...entries.keys()].filter(key => !base.has(key));
  structuralErrors += mismatched.length + extra.length;
  review += missing.length + identical.length;
  console.log(`${language}: ${missing.length} missing, ${identical.length} matching English (review), ${mismatched.length} placeholder mismatches, ${extra.length} extra`);
  for (const [label, keys] of [['Missing', missing], ['Matching English', identical], ['Placeholder mismatches', mismatched], ['Extra', extra]]) {
    if (keys.length && (details || label === 'Placeholder mismatches' || label === 'Extra')) {
      console.log(`  ${label}: ${keys.join(', ')}`);
    }
  }
}
if (structuralErrors || (process.argv.includes('--strict') && review)) process.exitCode = 1;
