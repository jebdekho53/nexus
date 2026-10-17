// CSV tokenizer and form mapping recovered from f473-f483. This deliberately
// retains permissive quote handling, alias priority and the historical default
// gender mapping; it does not silently "correct" imported user data.
export const nonemptyCell = (cell: unknown): boolean => cell !== '';
export const trimCell = (cell: string): string => cell.trim();
export const trimNullableCell = (cell: string | null | undefined): string => (cell ?? '').trim();
export const normalizeHeader = (header: string): string => header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (source[index + 1] === '"') {cell += '"'; index++;}
      else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ',') {row.push(cell); cell = '';}
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      row.push(cell); cell = '';
      if (row.some(nonemptyCell)) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    if (row.some(nonemptyCell)) rows.push(row);
  }
  return rows;
}
export interface CsvPassenger {
  passengerName?: string; passengerAge?: string; passengerGender: string;
  passengerBerthChoice?: string; passengerFoodChoice?: string;
}
export function parsePassenger(text: string): CsvPassenger {
  const [name, age, gender, berth, food] = text.split(':').map(trimNullableCell);
  return {passengerName: name, passengerAge: age,
    passengerGender: (gender || '').toUpperCase().startsWith('F') ? 'F' : 'M',
    passengerBerthChoice: (berth || '').toUpperCase() || undefined,
    passengerFoodChoice: food || undefined};
}
export const passengerHasName = (passenger: CsvPassenger): string | undefined => passenger.passengerName;
export function parsePassengers(text: string): CsvPassenger[] {
  return text.split(/[;|]/).map(trimCell).filter(Boolean).map(parsePassenger).filter(passengerHasName);
}
export function aliasedCell(row: (string | null | undefined)[], headers: string[], aliases: string[]): string {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index >= 0 && row[index] != null) return row[index]!.trim();
  }
  return '';
}
export interface CsvDeps {
  rows(text: string): string[][];
  passengers(text: string): unknown;
}
export function parseFormsCsv(text: string, deps: CsvDeps): Record<string, unknown>[] {
  const rows = deps.rows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader), forms: Record<string, unknown>[] = [];
  for (let index = 1; index < rows.length; index++) {
    const get = (...aliases: string[]) => aliasedCell(rows[index], headers, aliases);
    const origin = get('fromstation', 'from', 'origin', 'src', 'source');
    const destination = get('tostation', 'to', 'destination', 'dst', 'dest');
    const train = get('trainnumber', 'train', 'trainno');
    if (!origin && !destination && !train) continue;
    const passengers = get('passengers', 'pax');
    const form: Record<string, unknown> = {
      fromStation: origin, toStation: destination, trainNumber: train,
      journeyDate: get('journeydate', 'date', 'doj'), coach: get('coach', 'class', 'classcode'),
      quota: get('quota'), boardingStation: get('boardingstation', 'boarding') || undefined,
      username: get('username', 'user', 'loginid', 'id'), password: get('password', 'pass'),
      mobileNumber: get('mobilenumber', 'mobile', 'phone'),
      paymentMethod: get('paymentmethod', 'payment', 'paymethod'),
      upiId: get('upiid', 'upi', 'vpa') || undefined, loginMode: get('loginmode', 'mode') || undefined,
    };
    if (passengers) form.passengers = deps.passengers(passengers);
    forms.push(form);
  }
  return forms;
}
