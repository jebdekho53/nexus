'use strict';
const path = require('node:path');

module.exports = async function debugPair(electron, root) {
  console.log('=== START LIVE PAIR DOCKING TEST (DRAGGED PARENT) ===');
  
  let controller;
  for (let i = 0; i < 50; i++) {
    controller = electron.BrowserWindow.getAllWindows().find(w => {
      try { return w.webContents.getURL().includes('controller.html'); } catch { return false; }
    });
    if (controller) break;
    await new Promise(r => setTimeout(r, 200));
  }
  
  const form1 = {
    id: 'test-form-dragged',
    label: 'Test Form Dragged',
    account: { username: 'drag_user', password: 'pass1' },
    journey: { trainNumber: '12301', journeyDate: '2026-10-25', origin: 'NDLS', destination: 'HWH', quota: 'GN', classCode: '3A' },
    payment: { method: 'paytm' },
    passengers: [{ name: 'Passenger One', age: 30, gender: 'M', berth: 'No Preference', food: 'No Food' }]
  };

  await controller.webContents.executeJavaScript(`window.api.saveForm(${JSON.stringify(form1)})`);
  console.log('Opening Dragged Parent Form...');
  await controller.webContents.executeJavaScript(`window.api.openBookingBox(${JSON.stringify(form1.id)})`);
  await new Promise(r => setTimeout(r, 1500));

  let box1 = electron.BrowserWindow.getAllWindows().find(w => {
    try {
      const u = new URL(w.webContents.getURL());
      return u.pathname.includes('booking-box.html') && u.searchParams.get('id') === form1.id && u.searchParams.get('view') !== 'ticket';
    } catch { return false; }
  });

  // Manually move box1 to x: 400, y: 300
  console.log('Moving Box 1 to custom user position { x: 400, y: 300 }...');
  box1.setBounds({ x: 400, y: 300, width: 348, height: 208 });
  box1.emit('moved'); // simulate user drag
  await new Promise(r => setTimeout(r, 500));

  console.log('Box 1 bounds after user drag:', box1.getBounds());

  // Click Pair in Box 1
  console.log('Now clicking Pair inside Box 1...');
  const pairResult = await box1.webContents.executeJavaScript(`(async () => {
    const userIn = document.getElementById('pairUsername');
    const passIn = document.getElementById('pairPassword');
    if (userIn) userIn.value = 'drag_pair_user';
    if (passIn) passIn.value = 'drag_pass';
    const createBtn = document.getElementById('pairCreate');
    if (createBtn) {
      createBtn.click();
      return { clicked: true };
    }
    return { clicked: false };
  })()`);
  console.log('Pair button trigger result:', pairResult);

  await new Promise(r => setTimeout(r, 2500));

  const allBoxes = electron.BrowserWindow.getAllWindows().filter(w => {
    try {
      const u = new URL(w.webContents.getURL());
      return u.pathname.includes('booking-box.html') && u.searchParams.get('view') !== 'ticket' && (u.searchParams.get('id') === form1.id || w.__pairedFrom === box1.id || true);
    } catch { return false; }
  }).map(w => ({
    id: w.id,
    url: new URL(w.webContents.getURL()).searchParams.get('id'),
    bounds: w.getBounds()
  }));

  console.log('ALL BOOKING BOXES:');
  console.dir(allBoxes, { depth: null });

  console.log('=== END TEST ===');
  setTimeout(() => process.exit(0), 1000);
};
