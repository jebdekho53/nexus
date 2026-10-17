// Source: src/ts/renderer/matrix-book-now.ts. Compiled into src/renderer/matrix-book-now.js by `npm run build:renderer`; edit the TypeScript, not this file.
document.addEventListener('DOMContentLoaded', () => {
  const update = (): void => {
    const chip = document.getElementById('loginModeChip');
    if (chip && (document.getElementById('quotaSel') as HTMLSelectElement | null)?.value === 'GN' && (document.getElementById('loginFlowSel') as HTMLSelectElement | null)?.value === 'auto') {
      const label = document.getElementById('loginModeVal');
      if (label && label.textContent !== 'AUTO · NOW') label.textContent = 'AUTO · NOW';
      chip.title = 'Auto Book now: standard Auto login/browser-check stages without an opening-time countdown. Provider waits and availability still apply.';
    }
  };
  document.addEventListener('change', update); setInterval(update, 750); update();
});
