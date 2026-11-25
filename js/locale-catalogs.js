// App and embedded Rover labels ship together so a language switch works offline.
const sources = import.meta.glob('./locales/*.json', { eager: true, import: 'default' });

export const catalogs = Object.fromEntries(Object.entries(sources).map(([path, catalog]) => [
  path.slice('./locales/'.length, -'.json'.length),
  catalog,
]));

export function roverLabels(language) {
  return catalogs[language]?.rover ?? {};
}
