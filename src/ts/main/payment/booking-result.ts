// Normalisation of the provider's bookingData response into the booking result shown to the user.

export interface PassengerResult {
  name: string;
  status: string;
  confirmed: boolean;
  age: number | undefined;
  gender: string | undefined;
  coach: string | undefined;
  berth: string | undefined;
  berthType: string | undefined;
  currentStatus: string | undefined;
  fare: number | undefined;
}

export interface BookingResult {
  pnr: string;
  trainNumber: string;
  trainName: string;
  fromStation: string;
  toStation: string;
  boardingDate: string;
  journeyClass: string;
  quota: string;
  amount: number;
  passengers: PassengerResult[];
  allConfirmed: boolean;
  errorMessage?: string | undefined;
  fromCode?: string | undefined;
  toCode?: string | undefined;
  boardingStation?: string | undefined;
  departureTime?: string | undefined;
  arrivalTime?: string | undefined;
  paymentMode?: string | undefined;
  bookingTime?: string | undefined;
  reservationId?: string | undefined;
  ticketType?: string | undefined;
  qrText?: string | undefined;
  ersMessages?: string[] | undefined;
  userName?: string | undefined;
}

/** The parts of the provider's passenger record that are read. Values are untrusted JSON. */
type Loose = Record<string, unknown>;

const text = (value: unknown): string => (value == null ? '' : String(value));

export function emptyBooking(): BookingResult {
  return { pnr: '', trainNumber: '', trainName: '', fromStation: '', toStation: '', boardingDate: '', journeyClass: '', quota: '', amount: 0, passengers: [], allConfirmed: false };
}

export function passengerResult(passenger: Loose): PassengerResult {
  const status = (passenger.bookingStatusDetails || passenger.currentStatusDetails || '') as string;
  const current = (passenger.currentStatusDetails || '') as string;
  return {
    name: (passenger.passengerName || '') as string, status, confirmed: /CNF/i.test(status),
    age: passenger.passengerAge != null ? Number(passenger.passengerAge) : undefined,
    gender: text(passenger.passengerGender) || undefined, coach: text(passenger.bookingCoachId) || undefined,
    berth: text(passenger.bookingBerthNo) || undefined, berthType: text(passenger.bookingBerthCode) || undefined,
    currentStatus: current && current !== status ? current : undefined,
    fare: passenger.passengerNetFare != null ? Number(passenger.passengerNetFare) : undefined,
  };
}

export function normalizeBooking(
  response: unknown,
  { extractError, empty = emptyBooking }: { extractError: (body: unknown) => string | null | undefined; empty?: () => BookingResult },
): BookingResult | null {
  const body = (response ?? {}) as Loose;
  if (body.bankErrorFlag === true || body.bankErrorFlag === 'true') return { ...empty(), errorMessage: 'Payment Not Captured By IRCTC, Please use different App or Bank to Pay' };
  const row = (body.bookingResponseDTO as Loose[] | undefined)?.[0] as Loose | undefined;
  if (!row) { const error = extractError(body); return error ? { ...empty(), errorMessage: error } : null; }
  const error = (row.errorMessage || '') as string, pnr = (row.pnrNumber || '') as string;
  if (!pnr) return error ? { ...empty(), errorMessage: error } : null;
  const passengers = ((row.psgnDtlList ?? []) as Loose[]).map(passengerResult), user = (body.userDetail ?? {}) as Loose;
  const messages = Array.isArray(row.ersDisplayMessage) ? row.ersDisplayMessage.map(value => String(value)).filter(Boolean) : undefined;
  return {
    pnr, trainNumber: (row.trainNumber || '') as string, trainName: (row.trainName || '') as string,
    fromStation: (row.fromStnName || row.fromStn || '') as string, toStation: (row.resvnUptoStnName || row.destStnName || row.resvnUptoStn || '') as string,
    fromCode: text(row.fromStn) || undefined, toCode: text(row.resvnUptoStn) || text(row.destStn) || undefined,
    boardingStation: (row.boardingStnName || row.boardingStn || undefined) as string | undefined,
    boardingDate: String(row.boardingDate || row.journeyDate || '').split('T')[0] as string,
    departureTime: text(row.departureTime) || undefined, arrivalTime: text(row.arrivalTime) || undefined,
    journeyClass: (row.journeyClass || '') as string, quota: (row.bookedQuota || row.journeyQuota || '') as string,
    amount: Number(row.totalCollectibleAmount ?? body.totalCollectibleAmount ?? 0),
    paymentMode: text(body.bankNameDis) || text(row.bankNameDis) || text(body.bankPaymentMode) || undefined,
    bookingTime: text(body.bookingDate) || text(row.bookingDate) || undefined,
    reservationId: text(row.reservationId) || text(body.transactionId) || undefined, ticketType: text(row.ticketType) || undefined,
    qrText: text(body.qrCodeText) || text(row.qrCodeText) || undefined, ersMessages: messages, userName: text(user.firstName) || undefined,
    passengers, allConfirmed: passengers.length > 0 && passengers.every(passenger => passenger.confirmed), errorMessage: error || undefined,
  };
}
