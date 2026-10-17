// Local login text import orchestration (f3580/f3581). Parsers stay injected.
export interface RecordImportDeps {
  id(): unknown;
  now(): number;
  parseObject(value: unknown, id: unknown, now: number): unknown;
  parseText(value: string, id: unknown, now: number): unknown;
}
export interface ImportCounter {
  records(): {push(value: unknown): unknown};
  count(): unknown;
  setCount(value: number | bigint): void;
}
export function appendImportedRecord(value: unknown, state: ImportCounter): void {
  if (!value) return;
  state.records().push(value);
  const previous = state.count();
  state.setCount(typeof previous === 'bigint' ? previous + 1n : Number(previous) + 1);
}
export function importRecords(input: unknown, records: {push(value: unknown): unknown}, deps: RecordImportDeps): number {
  const text = ((input || '') as string).replace(/^\uFEFF/, '').trim();
  if (!text) return 0;
  let count = 0;
  const append = (value: unknown): void => {if (value) {records.push(value); count++;}};
  if (text[0] === '[' || text[0] === '{') {
    try {
      const parsed: unknown = JSON.parse(text);
      for (const item of Array.isArray(parsed) ? parsed : [parsed])
        append(deps.parseObject(item, deps.id(), deps.now()));
      return count;
    } catch { /* Keep any appended prefix, then try the original line format. */ }
  }
  for (const line of text.split(/\r?\n/)) append(deps.parseText(line, deps.id(), deps.now()));
  return count;
}
