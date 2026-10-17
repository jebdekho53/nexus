// Completion of a booking after payment: cleanup, result message, ticket attachment and client-update report.
import type { Timers } from './pnr-lifecycle';

const noop = (): void => undefined;
const pendingMessage = 'Payment is still being processed — your ticket MIGHT be booked. Check your IRCTC account before retrying; any amount debited is auto-refunded by IRCTC.';

export interface FinishedBooking {
  pnr?: string;
  amount?: number;
  allConfirmed?: boolean;
  errorMessage?: string;
  passengers: Array<{ confirmed?: boolean }>;
  [field: string]: unknown;
}

export interface FinishResult {
  success: boolean;
  reference?: string;
  message: string;
}

export interface FinishActor {
  gateway?: { disposeSurvivor(): Promise<unknown>; disposeDirectContext(): Promise<unknown> } | null;
  gatewayReqCtx?: { dispose(): Promise<unknown> } | undefined;
  paymentCancelled?: unknown;
  paidQrAmount?: number;
  opts: { onBooked?: ((booking: FinishedBooking) => void) | null };
  stoppedResult(): unknown;
  log(category: string, message: string, level?: string): void;
  attachPrintTicket(booking: FinishedBooking): Promise<unknown>;
  onProgress(stage: string, message: string): void;
  reportClientUpdate(booking: FinishedBooking): Promise<unknown>;
  finishBookingCore(booking: FinishedBooking | null | undefined): Promise<unknown>;
  endFinalPnrRequest(): void;
  endSettling(): void;
}

export async function finishBookingCore(actor: FinishActor, booking: FinishedBooking | null | undefined, { timers = globalThis }: { timers?: Timers } = {}): Promise<unknown> {
  actor.gateway?.disposeSurvivor().catch(noop);
  actor.gateway?.disposeDirectContext().catch(noop);
  if (actor.gatewayReqCtx) {
    actor.gatewayReqCtx.dispose().catch(noop);
    actor.gatewayReqCtx = undefined;
  }
  if (actor.paymentCancelled) return actor.stoppedResult();

  if (booking && booking.pnr) {
    if (actor.paidQrAmount && Number.isFinite(actor.paidQrAmount) && actor.paidQrAmount > 0 && booking.amount !== actor.paidQrAmount) {
      actor.log('gateway', 'IRCTC-QR: ticket follows the QR amount ₹' + actor.paidQrAmount + ' (bookingData reported ₹' + booking.amount + ')', 'info');
      booking.amount = actor.paidQrAmount;
    }
    const label = booking.allConfirmed ? 'Confirmed' : 'Booked';
    await Promise.race([
      actor.attachPrintTicket(booking),
      new Promise<void>(resolve => timers.setTimeout(resolve, 3000)),
    ]).catch(noop);
    actor.opts.onBooked?.(booking);
    actor.onProgress('booking:pnr', 'PNR ' + booking.pnr + ' — ' + label);

    if (booking.passengers.some(passenger => passenger.confirmed)) {
      let completed = false;
      const report = actor.reportClientUpdate(booking).finally(() => { completed = true; });
      await Promise.race([
        report,
        new Promise<void>(resolve => timers.setTimeout(() => {
          if (!completed) actor.log('clientupdate', 'report not confirmed in 5s — ticket already shown (report continues in the background)', 'warn');
          resolve();
        }, 5000)),
      ]);
      // Recovered code awaits again after the race. Keep parity here; changing
      // this timing requires an explicit behavior change with separate tests.
      await report;
    } else {
      actor.log('clientupdate', 'skipped — PNR ' + booking.pnr + ' has no confirmed passenger (waitlist/RAC)', 'info');
    }
    return { success: true, reference: booking.pnr, message: 'PNR ' + booking.pnr + ' (' + label + ')' } satisfies FinishResult;
  }
  if (booking && booking.errorMessage) {
    actor.onProgress('booking:error', 'Booking failed: ' + booking.errorMessage);
    return { success: false, message: booking.errorMessage } satisfies FinishResult;
  }
  actor.onProgress('booking:error', pendingMessage);
  return { success: false, message: pendingMessage } satisfies FinishResult;
}

// Keep cleanup synchronous and ordered, including when the core rejects.
export async function finishBooking(actor: FinishActor, booking: FinishedBooking | null | undefined): Promise<unknown> {
  try {
    return await actor.finishBookingCore(booking);
  } finally {
    actor.endFinalPnrRequest();
    actor.endSettling();
  }
}
