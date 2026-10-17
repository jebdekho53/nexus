// Source: src/ts/renderer/matrix-availability.ts. Compiled into src/renderer/matrix-availability.js by `npm run build:renderer`; edit the TypeScript, not this file.
document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('matrixCheckAvailability') as HTMLElement, hint = document.getElementById('matrixAvailabilityHint') as HTMLElement;
  button.addEventListener('click', () => {
    const missing = ['trainNumber', 'journeyDate', 'fromStation', 'toStation'].filter(id => !(document.getElementById(id) as HTMLInputElement | null)?.value.trim());
    if (missing.length) { hint.textContent = 'Enter train number, journey date, From and To stations first.'; return; }
    hint.textContent = 'Refreshing availability for this journey…';
    // Reuse the shipped request, quota mapping, proxy configuration and result UI.
    (document.getElementById('journeyDate') as HTMLElement).dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(() => { hint.textContent = 'The result updates below when the service responds. Refresh again before booking; availability can change.'; }, 1000);
  });
});
