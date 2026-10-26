'use strict';
const path = require('node:path'), { fileURLToPath } = require('node:url');
function freePosition(area,size,occupied,reference,gap=14){
  const fits=p=>p.x>=area.x&&p.y>=area.y&&p.x+size.width<=area.x+area.width&&p.y+size.height<=area.y+area.height&&!occupied.some(b=>p.x<b.x+b.width+gap&&p.x+size.width+gap>b.x&&p.y<b.y+b.height+gap&&p.y+size.height+gap>b.y);
  const candidates=[{x:reference.x+reference.width+gap,y:reference.y},{x:reference.x-size.width-gap,y:reference.y}];
  const startX=Math.max(area.x,Math.min(...occupied.map(b=>b.x))),startY=Math.max(area.y,Math.min(...occupied.map(b=>b.y)));
  const stepY=Math.max(size.height,...occupied.map(b=>b.height))+gap;
  for(const origin of [{x:startX,y:startY},{x:area.x,y:area.y}])for(let y=origin.y;y+size.height<=area.y+area.height;y+=stepY)for(let x=origin.x;x+size.width<=area.x+area.width;x+=size.width+gap)candidates.push({x,y});
  return candidates.find(fits)||null;
}

function install(electron, root) {
  let lastPairSourceWindow = null;

  const route = win => {
    try {
      const raw = win.webContents.getURL();
      if (!raw) return null;
      const u = new URL(raw);
      return (u.pathname.includes('booking-box.html') || path.resolve(fileURLToPath(u)) === path.join(root, 'src/renderer/booking-box.html')) ? u : null;
    } catch {
      return null;
    }
  };

  const isPairBox = win => {
    const r = route(win);
    return Boolean(r && r.searchParams.get('view') !== 'ticket');
  };

  const isTicket = win => {
    const r = route(win);
    return Boolean(r && r.searchParams.get('view') === 'ticket');
  };

  const isFormEditor = win => {
    try {
      const raw = win.webContents.getURL();
      if (!raw) return false;
      const u = new URL(raw);
      return (u.pathname.includes('form.html') || path.resolve(fileURLToPath(u)) === path.join(root, 'src/renderer/form.html')) && !u.pathname.includes('open-form.html');
    } catch {
      return false;
    }
  };

  electron.app.on('browser-window-created', (_event, ticket) => {
    let parent, popupParent, placing = false, attached = false, popupAttached = false, tiled = false;
    const nativeBounds = ticket.setBounds.bind(ticket);
    function fitCompactTicket() {
      if(ticket.__matrixSingleFlow)return;
      if (ticket.isDestroyed() || !isTicket(ticket)) return;
      const b=ticket.getBounds(),area=electron.screen.getDisplayMatching(b).workArea;
      const width=Math.min(348,area.width),height=Math.min(241,area.height);
      if(b.width!==width||b.height!==height)nativeBounds({...b,width,height});
    }

    // Track if this window triggers a pair creation (app:save-form)
    ticket.webContents.on('ipc-message', (_e, channel) => {
      if (channel === 'app:save-form' && isPairBox(ticket)) {
        lastPairSourceWindow = ticket;
      }
    });

    // Side-by-side layout: when multiple forms or pair windows open, place them side-by-side rather than overlapping.
    function tileSideBySide() {
      if (ticket.isDestroyed() || isTicket(ticket)) return false;
      if(tiled)return true;
      const pair = isPairBox(ticket), form = isFormEditor(ticket);
      if (!pair && !form) return false;

      const all = electron.BrowserWindow.getAllWindows().filter(w =>
        w !== ticket && !w.isDestroyed() && (pair ? isPairBox(w) : isFormEditor(w)) &&
        w.isVisible !== false && (typeof w.isVisible !== 'function' || w.isVisible())
      );
      if (!all.length) return false;

      const cur = ticket.getBounds();
      const w = cur.width || (pair ? 348 : 480);
      const h = cur.height || (pair ? 208 : 540);
      const gap = 14;

      // 1. If this window was spawned from clicking "Pair" on a specific window, dock next to that parent
      let refWin = null;
      if (pair && lastPairSourceWindow && !lastPairSourceWindow.isDestroyed() && lastPairSourceWindow !== ticket) {
        refWin = lastPairSourceWindow;
        lastPairSourceWindow = null;
      } else {
        all.sort((a, b) => a.getBounds().x - b.getBounds().x);
        refWin = all[all.length - 1];
      }

      const bRef = refWin.getBounds();
      const area = electron.screen.getDisplayMatching(bRef).workArea;

      const position=freePosition(area,{width:w,height:h},all.map(win=>win.getBounds()),bRef,gap);
      if(!position)return false;
      const nextX=position.x,nextY=position.y;

      tiled = true;
      ticket.__matrixTiledPos = { x: nextX, y: nextY };
      nativeBounds({ ...cur, x: nextX, y: nextY, width: w, height: h });
      return true;
    }

    const findPopup = (id, pb) => {
      if (id && electron.__qrPopups?.has(id)) {
        const p = electron.__qrPopups.get(id);
        if (p && !p.isDestroyed() && p.isVisible !== false && (typeof p.isVisible !== 'function' || p.isVisible())) return p;
      }
      return electron.BrowserWindow.getAllWindows().find(w =>
        w !== ticket && !w.isDestroyed() && w.isVisible !== false && (typeof w.isVisible !== 'function' || w.isVisible()) &&
        (typeof w.getTitle === 'function' && w.getTitle() === 'Scan to Pay') &&
        (!id || w.__formId === id || Math.abs(w.getBounds().x - pb.x) < 50)
      );
    };

    function place() {
      if(ticket.__matrixSingleFlow)return;
      if (placing || ticket.isDestroyed() || !isTicket(ticket)) return false;
      const id = route(ticket)?.searchParams?.get('id');
      const all = electron.BrowserWindow.getAllWindows().filter(w => w !== ticket && !w.isDestroyed() && isPairBox(w));
      const found = (id ? all.find(w => route(w)?.searchParams.get('id') === id) : null) || (all.length === 1 ? all[0] : null) || all[0];
      if (!found) return false;
      if (found !== parent) {
        detach();
        parent = found;
        parent.on('move', place);
        parent.on('resize', place);
        attached = true;
      }
      placing = true;
      try {
        let b = parent.getBounds();
        const qr = findPopup(id, b);
        if (qr !== popupParent) {
          detachPopup();
          if (qr) {
            popupParent = qr;
            popupParent.on('move', place);
            popupParent.on('resize', place);
            popupParent.on('closed', place);
            popupAttached = true;
          }
        }
        const t = ticket.getBounds(), p = qr?.getBounds(), area = electron.screen.getDisplayMatching(b).workArea;
        const totalHeight = b.height + 8 + (p ? p.height + 8 : 0) + t.height;
        if (totalHeight <= area.height) {
          const y = Math.max(area.y, Math.min(b.y, area.y + area.height - totalHeight));
          if (y !== b.y) { b = { ...b, y }; parent.setBounds(b); }
        }
        const anchor = p || b;
        const x = Math.max(area.x, Math.min(b.x, area.x + area.width - t.width)),
              y = Math.max(area.y, Math.min(anchor.y + anchor.height + 8, area.y + area.height - t.height));
        if (x !== t.x || y !== t.y) nativeBounds({ ...t, x, y });
        return true;
      } finally { placing = false; }
    }

    function detachPopup() {
      if (popupAttached) {
        popupParent?.removeListener('move', place);
        popupParent?.removeListener('resize', place);
        popupParent?.removeListener('closed', place);
        popupParent = null;
      }
      popupAttached = false;
    }

    function detach() {
      detachPopup();
      if (attached) {
        parent?.removeListener('move', place);
        parent?.removeListener('resize', place);
        parent = null;
      }
      attached = false;
    }

    ticket.setBounds = (bounds, ...args) => {
      if (ticket.__matrixTiledPos && !isTicket(ticket) && bounds && typeof bounds.x === 'number') {
        if (!ticket.__userDragged) {
          bounds = { ...bounds, x: ticket.__matrixTiledPos.x, y: ticket.__matrixTiledPos.y };
        }
      }
      const result = nativeBounds(bounds, ...args);
      place();
      return result;
    };

    if (typeof ticket.setPosition === 'function') {
      const native = ticket.setPosition.bind(ticket);
      ticket.setPosition = (...args) => {
        if (ticket.__matrixTiledPos && !isTicket(ticket) && typeof args[0] === 'number') {
          if (!ticket.__userDragged) {
            args[0] = ticket.__matrixTiledPos.x;
            args[1] = ticket.__matrixTiledPos.y;
          }
        }
        const result = native(...args);
        place();
        return result;
      };
    }

    ticket.on('will-move', () => { ticket.__userDragged = true; });
    ticket.webContents.on('did-finish-load', () => { fitCompactTicket(); place(); tileSideBySide(); });
    ticket.on('show', () => { fitCompactTicket(); place(); tileSideBySide(); });
    ticket.on('ready-to-show', () => { fitCompactTicket(); place(); tileSideBySide(); });
    ticket.on('resize', place);
    ticket.on('closed', detach);
  });
}

module.exports = { install,freePosition };
