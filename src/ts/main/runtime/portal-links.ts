// Opens the Matrix portal pages (admin / seller / client) in the system browser, only from the Tools window.
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PortalElectron {
  ipcMain: { handle(channel: string, handler: (event: { sender: { getURL(): string } }, role: unknown) => unknown): void };
  shell: { openExternal(url: string): Promise<unknown> };
}

export function install(electron: PortalElectron, root: string): void {
  electron.ipcMain.handle('matrix:portal:open', (event, role) => {
    try {
      const url = new URL(event.sender.getURL());
      if (url.protocol !== 'file:' || path.resolve(fileURLToPath(url)) !== path.join(root, 'src/renderer/tools.html') || !['admin', 'seller', 'client'].includes(role as string)) return { ok: false };
    } catch { return { ok: false }; }
    return electron.shell.openExternal('https://matrix.vaidya-gpt.com/' + (role as string)).then(() => ({ ok: true }));
  });
}
