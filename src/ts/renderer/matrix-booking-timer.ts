// Source: src/ts/renderer/matrix-booking-timer.ts. Compiled into src/renderer/matrix-booking-timer.js by `npm run build:renderer`; edit the TypeScript, not this file.
document.addEventListener('DOMContentLoaded', () => {
  const timer = document.getElementById('matrixGeneralTimer') as HTMLElement, quota = document.getElementById('quotaSel') as HTMLSelectElement | null;
  let state: { remainingMs?: number | null; active?: boolean; elapsedSeconds?: number } | undefined;
  const draw = (): void => { timer.hidden = quota?.value !== 'GN'; if (timer.hidden) return; timer.textContent = state?.remainingMs != null ? 'Submit ' + Math.ceil(state.remainingMs / 1000) + 's' : state?.active ? 'Run ' + Math.floor(state.elapsedSeconds || 0) + 's' : 'Book now'; };
  matrixBookingTiming?.subscribe((row: { remainingMs?: number | null; active?: boolean; elapsedSeconds?: number }) => { state = row; draw(); }); document.addEventListener('change', draw); draw();
});
