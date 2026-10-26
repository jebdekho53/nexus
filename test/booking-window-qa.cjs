'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function install(electron){
 const register=electron.ipcMain.handle.bind(electron.ipcMain);
 electron.ipcMain.handle=(channel,handler)=>register(channel,channel==='app:check-id-status'?async(event,ids,...args)=>Array.isArray(ids)&&ids.every(id=>id==='SYNTHETIC_UI')?{ok:true,data:ids.map(userId=>({userId,state:'verified',source:'isolated-ui-fixture'}))}:handler(event,ids,...args):handler);
}
async function run(electron,root){
 let controller;for(let n=0;n<400;n++){controller=electron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/controller.html'));if(controller&&!controller.webContents.isLoading())break;await sleep(100);}
 if(!controller)throw Error('No release controller');
 const panels=[];
 for(let n=1;n<=6;n++){
  const form={id:crypto.randomUUID(),label:'Window check '+n,account:{username:'SYNTHETIC_UI',password:'not-a-real-login',mobileNumber:'9999999999'},journey:{trainNumber:'53047',journeyDate:'2026-10-28',origin:'BWN',destination:'KAN',quota:'GN',classCode:'2S'},options:{},payment:{method:'paytm'},passengers:[{name:'UI FIXTURE',age:30,gender:'M',berth:'No Preference',food:'No Food'}],proxy:{enabled:false},timing:{},updatedAt:Date.now()};
  const result=await controller.webContents.executeJavaScript('window.api.saveForm('+JSON.stringify(form)+')');assert(result.ok,'Cannot save isolated fixture');
  await controller.webContents.executeJavaScript('window.api.openBookingBox('+JSON.stringify(form.id)+')');
  let panel;for(let i=0;i<100;i++){panel=electron.BrowserWindow.getAllWindows().find(w=>{try{return new URL(w.webContents.getURL()).searchParams.get('id')===form.id;}catch{return false;}});if(panel&&!panel.webContents.isLoading()&&panel.isVisible())break;await sleep(100);}
  assert(panel&&panel.isVisible(),'Missing booking box '+n);panels.push(panel);await sleep(200);
 }
 await sleep(1000);
 const report={isolatedProfile:true,syntheticIdStatus:true,bookingStarted:false,paymentStarted:false,boxes:[]};
 for(const [n,panel]of panels.entries()){
  const bounds=panel.getBounds(),area=electron.screen.getDisplayMatching(bounds).workArea;
  assert.equal(bounds.width,348);assert.equal(bounds.height,241);assert(bounds.x>=area.x&&bounds.y>=area.y&&bounds.x+348<=area.x+area.width&&bounds.y+241<=area.y+area.height);
  for(const prior of report.boxes){const b=prior.bounds;assert(!(bounds.x<b.x+b.width&&bounds.x+bounds.width>b.x&&bounds.y<b.y+b.height&&bounds.y+bounds.height>b.y),'Overlapping booking boxes');}
  const layout=await panel.webContents.executeJavaScript(`(()=>{const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height}};return{height:innerHeight,footer:rect('.bb-telemetry-bar'),actions:rect('.bb-actions-aux'),minimizeBridge:!!window.matrixBookingWindow};})()`);
  assert(layout.footer.bottom<=layout.height+1,'Footer is clipped');assert(layout.actions.bottom<=layout.footer.top+1,'Actions cover footer');assert(layout.minimizeBridge);
  report.boxes.push({number:n+1,bounds,layout});
 }
 await panels[5].webContents.executeJavaScript("document.getElementById('boxMinBtn').click()");await sleep(250);report.minimizeWorked=panels[5].isMinimized();assert(report.minimizeWorked,'Minimize did not target box six');
 panels[5].restore();panels[5].show();await sleep(200);report.restoreWorked=!panels[5].isMinimized();assert(report.restoreWorked);
 fs.writeFileSync(path.join(root,'diagnostics/booking-window-six-verified.json'),JSON.stringify(report,null,2));
 fs.writeFileSync(path.join(root,'diagnostics/booking-box-layout-fixed.png'),(await panels[0].webContents.capturePage()).toPNG());
}
module.exports={run,install};
