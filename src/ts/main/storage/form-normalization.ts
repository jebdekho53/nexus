// Pure stored-form conversion: legacy flat imports and nested models into the
// schema consumed by the vault. Legacy fields are carried as data only; no
// provider, browser, authentication or payment operations occur here.
export type Fields = Record<string, unknown>;
export interface DefaultForm extends Fields {
  journey: Fields;
}
export function defaultForm(id: unknown, now: unknown): DefaultForm {
  return {
    id, label: '', loginMode: 'railone', browserProvider: 'gologin',
    account: {username: '', password: '', mobileNumber: ''},
    journey: {trainNumber: '', specialTrain: false, journeyDate: '', origin: '', destination: '',
      boardingStation: '', quota: 'TQ', classCode: 'SL'},
    options: {bookOnlyIfConfirmed: true, travelInsurance: true, autoOtpSync: false, racers: 1},
    payment: {method: '', paymentPause: false, freechargeBypass: false},
    passengers: [], proxy: {enabled: false, host: '', port: ''}, createdAt: now, updatedAt: now,
  };
}
export interface NormalizeDeps {
  defaults(id: unknown, now: unknown): DefaultForm;
  isRecord(value: unknown): boolean;
  string(value: unknown): string;
  label(route: string, username: string): unknown;
  enumValue(choices: unknown, value: unknown, fallback: unknown): unknown;
  quotas(): unknown;
  classes(): unknown;
  paymentMethods(): unknown;
  fare(value: unknown): unknown;
  racers(value: unknown): unknown;
  paymentMethod(value: unknown): unknown;
  passenger(): (value: unknown, index: number, all: unknown[]) => unknown;
}
export function normalizeForm(value: unknown, id: unknown, now: unknown, deps: NormalizeDeps): DefaultForm {
  const base = deps.defaults(id, now);
  if (!deps.isRecord(value)) return base;
  const input = value as Fields;
  const account = deps.isRecord(input.account) ? input.account as Fields : {};
  const journey = deps.isRecord(input.journey) ? input.journey as Fields : {};
  const options = deps.isRecord(input.options) ? input.options as Fields : {};
  const payment = deps.isRecord(input.payment) ? input.payment as Fields : {};
  const card = deps.isRecord(payment.card) ? payment.card as Fields : null;
  const proxy = deps.isRecord(input.proxy) ? input.proxy as Fields : {};
  const username = deps.string(account.username ?? input.username);
  const origin = deps.string(journey.origin ?? input.fromStation);
  const destination = deps.string(journey.destination ?? input.toStation);
  const confirmed = options.bookOnlyIfConfirmed ?? input.bookOnlyIfCnf;
  // Property evaluation order is observable through injected helpers and is
  // intentionally the same as the recovered object construction.
  return {
    ...base,
    label: deps.string(input.label) || deps.label((origin || '—') + ' → ' + (destination || '—'), username),
    loginMode: deps.enumValue(['railone', 'weblogin', 'uilogin'], input.loginMode, base.loginMode),
    browserProvider: deps.enumValue(['chrome', 'brave', 'brave-beta', 'edge', 'gologin', 'fingerprint', 'brahmos'],
      input.browserProvider === 'adspower' ? 'gologin' : input.browserProvider === 'comet' ? 'chrome' : input.browserProvider, base.browserProvider),
    manualLogin: (input.manualLogin ?? input.manual) === true,
    brahmosLogin: input.brahmosLogin === true,
    railBrahmos: input.railBrahmos === true,
    directLogin: input.directLogin === true,
    account: {username, password: deps.string(account.password ?? input.password), mobileNumber: deps.string(account.mobileNumber ?? input.mobileNumber)},
    journey: {
      trainNumber: deps.string(journey.trainNumber ?? input.trainNumber),
      specialTrain: (journey.specialTrain ?? input.specialTrain) === true,
      journeyDate: deps.string(journey.journeyDate ?? input.journeyDate), origin, destination,
      boardingStation: deps.string(journey.boardingStation ?? input.boardingStation) || undefined,
      quota: deps.enumValue(deps.quotas(), journey.quota ?? input.quota, base.journey.quota),
      classCode: deps.enumValue(deps.classes(), journey.classCode ?? input.coach, base.journey.classCode),
    },
    options: {
      bookOnlyIfConfirmed: confirmed !== false,
      travelInsurance: (options.travelInsurance ?? input.travelInsurance) !== false,
      fareLimit: deps.fare(options.fareLimit ?? input.fareLimit),
      autoOtpSync: (options.autoOtpSync ?? input.autoOtpSync) === true,
      racers: deps.racers(options.racers ?? input.racers),
    },
    payment: {
      method: deps.enumValue(deps.paymentMethods(), deps.paymentMethod(payment.method ?? input.paymentMethod), ''),
      upiId: deps.string(payment.upiId ?? input.upiId) || undefined,
      paymentPause: (payment.paymentPause ?? input.stopPayEnabled) === true,
      freechargeBypass: payment.freechargeBypass === true,
      card: card ? {number: deps.string(card.number), expiry: deps.string(card.expiry), cvv: deps.string(card.cvv),
        staticPassword: deps.string(card.staticPassword), holderName: deps.string(card.holderName)} : undefined,
    },
    passengers: Array.isArray(input.passengers) ? input.passengers.map(deps.passenger()) : [],
    proxy: {enabled: false, host: deps.string(proxy.host), port: deps.string(proxy.port),
      username: deps.string(proxy.username ?? proxy.user) || undefined,
      password: deps.string(proxy.password ?? proxy.pass) || undefined},
    timing: deps.isRecord(input.timing) ? input.timing : undefined,
    id, createdAt: now, updatedAt: now,
  };
}
