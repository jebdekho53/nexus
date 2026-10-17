// Offline JSON catalog loading and local suggestions (f3495-f3497).
export interface StationRecord {sc: string; en: string}
export interface StationSuggestion {code: string; name: string}

export function readCatalog(
  name: unknown,
  fallback: unknown,
  deps: {fs(): {readFileSync(path: unknown, encoding: 'utf8'): string}; path(name: unknown): unknown},
): unknown {
  try { return JSON.parse(deps.fs().readFileSync(deps.path(name), 'utf8')) as unknown; }
  catch { return fallback; }
}

export function suggestStations(query: unknown, catalog: () => Iterable<StationRecord>): StationSuggestion[] {
  const needle = (query as string).trim().toUpperCase();
  if (!needle) return [];
  const exact: StationSuggestion[] = [], codePrefix: StationSuggestion[] = [];
  const namePrefix: StationSuggestion[] = [], contains: StationSuggestion[] = [];
  for (const station of catalog()) {
    const code = station.sc.toUpperCase(), name = station.en.toUpperCase();
    const suggestion = {code: station.sc, name: station.en};
    if (code === needle) exact.push(suggestion);
    else if (code.startsWith(needle)) codePrefix.push(suggestion);
    else if (name.startsWith(needle)) namePrefix.push(suggestion);
    else if (code.includes(needle) || name.includes(needle)) contains.push(suggestion);
  }
  // All rows must be examined before truncation: an exact code can occur last.
  return [...exact, ...codePrefix, ...namePrefix, ...contains].slice(0, 12);
}

export function suggestTrains(query: unknown, catalog: () => Iterable<string>): string[] {
  const needle = (query as string).trim().toUpperCase();
  if (!needle) return [];
  const matches: string[] = [];
  for (const train of catalog()) {
    if (train.toUpperCase().includes(needle)) {
      matches.push(train);
      if (matches.length >= 12) break;
    }
  }
  return matches;
}
