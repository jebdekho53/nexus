// Attaches the printable ticket detail to a booking result (best effort: failures are logged, never thrown).

export interface PrintTicketActor {
  gateway?: { printTicket(request: { pnr: string; accessToken: unknown; greq: unknown; bmiyek: unknown; spaCsrf: unknown }): Promise<unknown> } | null;
  opts: { gatewayHosts?: { wps?: unknown } | null };
  api?: { currentCsrf?: unknown } | null;
  tok(): { accessToken: unknown; greq: unknown; bmiyek: unknown };
  spaCsrf(): unknown;
  log(category: string, message: string, level?: string): void;
}

export interface BookingWithTicket {
  pnr?: string;
  printDetail?: unknown;
  [field: string]: unknown;
}

export async function attachPrintTicket(actor: PrintTicketActor, booking: BookingWithTicket): Promise<void> {
  if (!actor.gateway || !actor.opts.gatewayHosts?.wps || !booking.pnr) return;
  const tokens = actor.tok();
  const detail = await actor.gateway.printTicket({
    pnr: booking.pnr,
    accessToken: tokens.accessToken,
    greq: tokens.greq,
    bmiyek: tokens.bmiyek,
    spaCsrf: actor.api?.currentCsrf || actor.spaCsrf(),
  }).catch((error: { message?: string }) => {
    actor.log('payment', 'printTicket fetch failed: ' + error.message, 'warn');
    return null;
  });
  if (detail && typeof detail === 'object') {
    booking.printDetail = detail;
    actor.log('payment', 'printTicket detail captured for PNR ' + booking.pnr);
  }
}
