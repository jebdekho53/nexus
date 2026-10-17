// Source: src/ts/renderer/matrix-updates.ts. Compiled into src/renderer/matrix-updates.js by `npm run build:renderer`; edit the TypeScript, not this file.
document.addEventListener('DOMContentLoaded', () => {
  const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement, bridge = window.matrixUpdates;
  let busy = false;
  const install = document.createElement('button'); install.className = 'btn primary'; install.textContent = 'Download & install update'; install.hidden = true; (el('reason').closest('.card') as Element).append(install);
  const message = (text: string | undefined): void => { el('reason').textContent = text as string; };
  async function check(): Promise<void> {
    if (busy) return;
    busy = true; (el('checkBtn') as HTMLButtonElement).disabled = true; message('Checking Matrix release service…');
    try {
      const status = await bridge.check();
      el('ver').textContent = 'v' + status.currentVersion; (el('autoUpdate') as HTMLInputElement).checked = status.autoUpdate === true; el('versionList').replaceChildren();
      if (!status.ok) { el('statusBadge').textContent = 'Could not check'; el('source').textContent = 'Unavailable'; message(status.error); install.hidden = true; return; }
      el('source').textContent = 'Matrix release service'; el('statusBadge').textContent = status.available ? 'Update available · v' + status.latestVersion : '✓ Up to date';
      message(status.available ? status.notes || 'A new Matrix release is available.' : 'Latest published release: v' + status.latestVersion);
      const row = document.createElement('div'); row.className = 'kv'; row.textContent = 'Installed: v' + status.currentVersion + ' · Latest: v' + status.latestVersion; el('versionList').append(row);
      install.hidden = !(status.available && status.updaterAvailable && status.installable);
    } catch (error) { message(String((error as Error).message)); }
    finally { busy = false; (el('checkBtn') as HTMLButtonElement).disabled = false; }
  }
  el('checkBtn').addEventListener('click', check); el('winClose').addEventListener('click', () => bridge.close());
  el('autoUpdate').addEventListener('change', async () => { const box = el('autoUpdate') as HTMLInputElement; const result = await bridge.settings(box.checked); if (!result.ok) { box.checked = !box.checked; message(result.error); } });
  install.addEventListener('click', async () => { install.disabled = true; (el('checkBtn') as HTMLButtonElement).disabled = true; const result = await bridge.install(); if (!result.ok) { message(result.error); install.disabled = false; (el('checkBtn') as HTMLButtonElement).disabled = false; } });
  bridge.subscribe(row => message(row.phase === 'error' ? row.error : row.phase === 'installing' ? 'Verified. Installing and restarting Matrix…' : 'Downloading small updater: ' + row.percent + '%'));
  check();
});
