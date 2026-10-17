// Source: src/ts/renderer/matrix-logs.ts. Compiled into src/renderer/matrix-logs.js by `npm run build:renderer`; edit the TypeScript, not this file.
(async () => {
  const list = document.getElementById('logList') as HTMLElement, empty = document.getElementById('empty') as HTMLElement, banner = document.getElementById('runInfo') as HTMLElement;
  const rows: MatrixLogRow[] = [], ids = new Set<number>();
  const filter = document.createElement('select'); filter.className = 'btn sm'; filter.setAttribute('aria-label', 'Filter log runs');
  const all = document.createElement('option'); all.value = 'all'; all.textContent = 'All runs'; filter.append(all);
  const runIds = new Set<string>(); const bar = document.getElementById('filterBar') as HTMLElement; bar.append(filter);
  filter.onchange = () => { for (const item of list.children as HTMLCollectionOf<HTMLElement>) item.hidden = filter.value !== 'all' && item.dataset.run !== filter.value; };
  const clock = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false });
  function append(row: MatrixLogRow): void {
    if (ids.has(row.id)) return; ids.add(row.id); rows.push(row);
    const item = document.createElement('div'); item.className = 'nx-log ' + row.kind + ' ' + (['info', 'warn', 'error', 'success'].includes(row.level) ? row.level : 'info');
    item.dataset.run = row.runId; item.hidden = filter.value !== 'all' && filter.value !== row.runId;
    if (!runIds.has(row.runId)) { runIds.add(row.runId); const option = document.createElement('option'); option.value = row.runId; option.textContent = row.runId === 'app' ? 'App' : 'Run ' + row.runId.slice(0, 8); filter.append(option); if (runIds.size > 1) bar.style.display = 'flex'; }
    for (const text of [clock.format(new Date(row.at)), row.elapsedSeconds === null ? '—' : '+' + row.elapsedSeconds.toFixed(1) + 's', (row.runId === 'app' ? '' : row.runId.slice(0, 8) + ' · ') + row.stage, row.message + (row.kind === 'heartbeat' ? ' · step ' + (row.stepSeconds as number).toFixed(1) + 's' : '')]) { const cell = document.createElement('span'); cell.textContent = text; item.append(cell); }
    list.append(item); empty.hidden = true; banner.textContent = 'IST · ' + row.stage + ' · ' + (row.elapsedSeconds ?? 0) + 's elapsed'; banner.classList.remove('ri-idle');
    if (rows.length > 5000) { const removed = rows.shift() as MatrixLogRow; ids.delete(removed.id); list.firstChild?.remove(); }
    if ((document.getElementById('follow') as HTMLInputElement).checked) item.scrollIntoView({ block: 'end' });
  }
  if (!window.matrixLogs) { empty.textContent = 'Log bridge unavailable. Restart Matrix to load the current build.'; return; }
  window.matrixLogs.subscribe(append);
  for (const row of await window.matrixLogs.snapshot()) append(row);
  (document.getElementById('clearBtn') as HTMLElement).onclick = async () => { await (window.matrixLogs as NonNullable<Window['matrixLogs']>).clear(); rows.length = 0; ids.clear(); list.replaceChildren(); empty.hidden = false; };
  (document.getElementById('downloadBtn') as HTMLElement).onclick = () => { const selected = filter.value === 'all' ? rows : rows.filter(row => row.runId === filter.value); const url = URL.createObjectURL(new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'Matrix-activity.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  (document.getElementById('winClose') as HTMLElement).onclick = () => window.close();
})();
