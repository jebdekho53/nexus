// File dispatch and portable form export (f484-f486). Fields and coercions
// follow the recovered format, including its historical version string.
// Serialization is explicit user export, never logging or telemetry.
export interface Passenger {
  name?: unknown; age?: unknown; gender?: unknown; berthPreference?: unknown;
  foodChoice?: PropertyKey; childBerth?: unknown;
}
export interface StoredForm {
  account: {username?: unknown; password?: unknown; mobileNumber?: unknown};
  journey: {trainNumber?: unknown; origin?: unknown; destination?: unknown;
    boardingStation?: unknown; classCode?: unknown; quota?: unknown;
    journeyDate?: unknown; specialTrain?: unknown};
  payment: {method?: unknown; upiId?: unknown; paymentPause?: unknown};
  options: {bookOnlyIfConfirmed?: unknown; fareLimit?: unknown; travelInsurance?: unknown;
    autoOtpSync?: unknown; racers?: unknown};
  passengers: Passenger[];
  proxy: {host?: unknown; port?: unknown; username?: unknown; password?: unknown};
  loginMode?: unknown; browserProvider?: unknown; manualLogin?: unknown;
  directLogin?: unknown; brahmosLogin?: unknown; railBrahmos?: unknown;
  label?: unknown; timing?: unknown;
}
export interface CodecDeps {
  extensions(): {includes(extension: string): boolean};
  csv(text: unknown): unknown[];
  paymentName(method: unknown): unknown;
  foodNames(): Record<PropertyKey, unknown>;
  isoNow(): string;
}
export function parseFormFile(name: unknown, text: unknown, deps: Pick<CodecDeps, 'extensions' | 'csv'>): unknown[] {
  const extension = (String(name).match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
  // Checking the extension list lies outside the parse try/catch in f484.
  if (!deps.extensions().includes(extension)) return [];
  try {
    if (extension === '.csv') return deps.csv(text);
    const parsed: unknown = JSON.parse(text as string);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {return [];}
}
export function exportPassenger(passenger: Passenger, index: number, foodNames: () => Record<PropertyKey, unknown>): Record<string, unknown> {
  return {
    passengerName: passenger.name,
    passengerAge: String(passenger.age),
    passengerGender: passenger.gender,
    passengerBerthChoice: passenger.berthPreference,
    passengerFoodChoice: foodNames()[passenger.foodChoice as PropertyKey] ?? 'Meal Not Applicable',
    passengerNationality: 'IN',
    passengerSerialNumber: index + 1,
    childBerthFlag: passenger.childBerth !== false,
    needsChildBerth: passenger.childBerth !== false,
    childBerth: passenger.childBerth,
  };
}
export function exportForm(model: StoredForm, date: unknown, deps: Pick<CodecDeps, 'paymentName' | 'foodNames' | 'isoNow'>): Record<string, unknown> {
  const exportDate = date !== undefined ? date : deps.isoNow();
  return {
    version: 'V6.5.8', exportDate,
    username: model.account.username, password: model.account.password,
    mobileNumber: model.account.mobileNumber,
    trainNumber: model.journey.trainNumber, fromStation: model.journey.origin,
    toStation: model.journey.destination, boardingStation: model.journey.boardingStation || '',
    coach: model.journey.classCode, quota: model.journey.quota,
    journeyDate: model.journey.journeyDate,
    paymentMethod: deps.paymentName(model.payment.method), upiId: model.payment.upiId || '',
    bookOnlyIfCnf: model.options.bookOnlyIfConfirmed, fareLimit: model.options.fareLimit,
    travelInsurance: model.options.travelInsurance, autoOtpSync: model.options.autoOtpSync,
    racers: model.options.racers, loginMode: model.loginMode, browserProvider: model.browserProvider,
    manualLogin: model.manualLogin === true, directLogin: model.directLogin === true,
    brahmosLogin: model.brahmosLogin === true, railBrahmos: model.railBrahmos === true,
    stopPayEnabled: model.payment.paymentPause,
    passengers: model.passengers.map((passenger, index) => exportPassenger(passenger, index, deps.foodNames)),
    proxy: {host: model.proxy.host, port: model.proxy.port,
      user: model.proxy.username || '', pass: model.proxy.password || ''},
    label: model.label, specialTrain: model.journey.specialTrain, timing: model.timing,
  };
}
