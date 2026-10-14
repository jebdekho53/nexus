'use strict';
const fs=require('node:fs'),path=require('node:path');
async function run(electron,root){
 const controller=electron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/controller.html'));
 const form={id:'efd6c934-513f-4cc9-9d6b-814016000002',label:'Packaged panel QA',account:{username:'qa-manual-account',password:'SyntheticOnly123',mobileNumber:'9999999999'},journey:{trainNumber:'13307',journeyDate:'2026-10-20',origin:'DDU',destination:'BSB',quota:'GN',classCode:'SL'},options:{},payment:{method:'paytm'},passengers:[{name:'QA Passenger',age:30,gender:'M',berth:'No Preference',food:'No Food'}],proxy:{enabled:false},timing:{},updatedAt:Date.now()};
 const saved=await controller.webContents.executeJavaScript('window.api.saveForm('+JSON.stringify(form)+')');if(!saved.ok)throw Error('Cannot save packaged QA form');
 try{
  await controller.webContents.executeJavaScript('window.api.openBookingBox('+JSON.stringify(form.id)+')');
  const deadline=Date.now()+12000;let state,panel;
  while(Date.now()<deadline){panel=electron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('booking-box.html?id='+form.id));if(panel&&!panel.webContents.isLoading()){state=await panel.webContents.executeJavaScript("({account:document.querySelector('#acctPick .bb-pick-label')?.textContent,payment:document.getElementById('paySel')?.value,paymentLabel:document.querySelector('#payPick .bb-pick-label')?.textContent,modeLabelPresent:!!document.getElementById('loginModeVal'),status:document.getElementById('statusText')?.textContent})");if(state.account?.startsWith(form.account.username.slice(0,4))&&state.paymentLabel==='Paytm QR')break;}await new Promise(resolve=>setTimeout(resolve,200));}
  if(panel)fs.writeFileSync(path.join(root,'diagnostics/packaged-panel.png'),(await panel.webContents.capturePage()).toPNG());
  const result={accountLoaded:state?.account?.startsWith(form.account.username.slice(0,4)),paymentLoaded:state?.payment===form.payment.method&&state?.paymentLabel==='Paytm QR',modeLabelPresent:state?.modeLabelPresent,status:state?.status,syntheticData:true};fs.writeFileSync(path.join(root,'diagnostics/packaged-panel.json'),JSON.stringify(result,null,2));if(!result.accountLoaded||!result.paymentLoaded||!result.modeLabelPresent)throw Error('Packaged panel account/payment failed: '+JSON.stringify(result));return result;
 }finally{await controller.webContents.executeJavaScript('window.api.deleteForm('+JSON.stringify(form.id)+')');}
}
module.exports={run};
