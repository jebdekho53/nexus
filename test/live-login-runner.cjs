'use strict';
const fs=require('node:fs');
const path=require('node:path');

async function run(electron,root,log) {
  const directory=path.join(root,'diagnostics');
  const testMode=process.argv.find(arg=>arg.startsWith('--test-mode='))?.split('=')[1];
  const testTrain=process.argv.find(arg=>arg.startsWith('--test-train='))?.split('=')[1];
  if(testTrain&&!/^\d{5}$/.test(testTrain))throw new Error('Invalid test train number');
  if(testMode&&!['auto','direct','direct2'].includes(testMode))throw new Error('Unsupported automated test mode');
  const reportPath=path.join(directory,testMode?'live-e2e-'+(testTrain?testTrain+'-':'')+testMode+'.json':'live-login-report.json');
  const account=JSON.parse(fs.readFileSync(path.join(directory,'test-account.json'),'utf8'));
  const clean=value=>String(value||'').replaceAll(account.password,'[redacted]').replaceAll(account.username,'[test-account]');
  const report={started:new Date().toISOString(),mode:testMode||'saved',phase:'inspecting',paymentSubmitted:false};
  const write=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
  let controller;
  write();
  try {
    const readyDeadline=Date.now()+90000;
    while(Date.now()<readyDeadline) {
      controller=electron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().split('?')[0].endsWith('/controller.html'));
      if(controller&&!controller.webContents.isLoading())break;
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(!controller)throw new Error('Controller window unavailable');
    const execute=script=>controller.webContents.executeJavaScript(script);
    await execute(`window.__nexusQrProbe=null;window.api.onQr(payload=>{
      if(payload.closed||!payload.dataUrl)return;
      const image=new Image();image.onload=()=>{window.__nexusQrProbe={at:Date.now(),formId:payload.formId,ready:true,width:image.naturalWidth,height:image.naturalHeight};};image.src=payload.dataUrl;
    });true;`);
    const rows=await execute('window.api.listForms()');
    if(!rows.ok||!rows.data.length)throw new Error('No saved form is available for the authorized live test');
    let selected=rows.data.find(row=>row.search?.toLowerCase().includes(account.username.toLowerCase()))||rows.data[0];
    let loaded;
    if(testTrain){
      const matches=[];
      for(const row of rows.data){const candidate=await execute('window.api.getForm('+JSON.stringify(row.id)+')');if(candidate?.ok&&String(candidate.data?.journey?.trainNumber)===testTrain)matches.push(candidate);}
      matches.sort((a,b)=>(b.data.updatedAt||0)-(a.data.updatedAt||0));
      loaded=matches[0];
      if(!loaded)throw new Error('No saved form found for train '+testTrain);
    }else loaded=await execute('window.api.getForm('+JSON.stringify(selected.id)+')');
    if(!loaded.ok||!loaded.data)throw new Error('Saved form unavailable');
    const form=loaded.data;
    report.savedQuota=form.journey?.quota;
    form.account={...form.account,...account};
    if(testMode){
      const flags=await execute("import('./assets/types-B0-2ZUtm.js').then(module=>module.p("+JSON.stringify(testMode)+"))");
      Object.assign(form,flags);form.journey.quota='GN';
      form.payment={...form.payment,method:'paytm'};
      // Only the isolated diagnostic profile is saved; the user's form is untouched.
      if(!process.argv.includes('--isolated-live-test'))throw new Error('Mode tests require isolated profile');
      const saved=await execute('window.api.saveForm('+JSON.stringify(form)+')');
      if(!saved?.ok)throw new Error('Unable to prepare isolated test form');
      const availabilityStarted=performance.now();
      const result=await Promise.race([execute("import('./assets/types-B0-2ZUtm.js').then(module=>window.api.checkAvailability("+JSON.stringify({source:form.journey.origin,destination:form.journey.destination,classCode:form.journey.classCode,quota:'GN',doj:form.journey.journeyDate.replaceAll('-',''),trainNumber:form.journey.trainNumber})+",module.N("+JSON.stringify(form.proxy)+")))"),new Promise(resolve=>setTimeout(()=>resolve({ok:false,error:'Availability request exceeded 30 seconds'}),30000))]);
      report.availability={seconds:Number(((performance.now()-availabilityStarted)/1000).toFixed(2)),ok:result?.ok,status:clean(result?.data?.status||result?.data?.text),error:clean(result?.error)};
    }
    report.form={id:form.id,train:form.journey?.trainNumber,date:form.journey?.journeyDate,from:form.journey?.origin,to:form.journey?.destination,class:form.journey?.classCode,quota:form.journey?.quota,passengers:form.passengers?.length};
    report.flows=await execute('window.api.getLoginFlows()');
    await execute('window.api.openBookingBox('+JSON.stringify(form.id)+')');
    report.phase='starting-chrome-login';
    const loginStarted=performance.now();
    report.loginStarted=new Date().toISOString();write();
    const input={mode:'weblogin',provider:'chrome',credentials:account,formId:form.id,profileId:form.id,
      manual:false,directLogin:form.directLogin===true,brahmosLogin:form.brahmosLogin===true};
    const response=await execute('window.api.login('+JSON.stringify(input)+')');
    report.loginSeconds=Number(((performance.now()-loginStarted)/1000).toFixed(2));
    report.login={ok:response?.ok,error:clean(response?.error),code:response?.code};
    report.phase=response?.ok?'login-handler-ready':'login-failed';
    if(response?.ok&&process.argv.includes('--live-booking-test')) {
      if(!/^(paytm|.*qr.*)$/i.test(form.payment?.method||''))throw new Error('The selected form is not configured for a QR payment method');
      report.phase='starting-booking-to-qr';write();
      const bookingForm=await execute("import('./assets/types-B0-2ZUtm.js').then(module=>module.J("+JSON.stringify(form)+"))");
      report.bookingRoute={from:bookingForm.from,to:bookingForm.to,date:bookingForm.date};write();
      const bookingStarted=performance.now();
      const start=await execute('window.api.startBooking('+JSON.stringify({form:{...bookingForm,classCode:form.journey.classCode,quota:form.journey.quota},formId:form.id})+')');
      report.bookingStart={ok:start?.ok,error:clean(start?.error)};write();
      if(!start?.ok)throw new Error('Booking start failed: '+clean(start?.error));
      const deadline=Date.now()+300000;
      let unavailableChecks=0;
      while(Date.now()<deadline) {
        const box=electron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/booking-box.html?')&&w.webContents.getURL().includes(form.id)&&new URL(w.webContents.getURL()).searchParams.get('view')!=='ticket');
        if(box) {
          const state=await box.webContents.executeJavaScript(`(() => {
            const visible=id=>{const el=document.getElementById(id);return !!el&&!el.classList.contains('hidden');};
            return {status:document.getElementById('statusText')?.textContent,qrVisible:visible('qrOverlay'),qrImageReady:!!document.getElementById('qrImg')?.naturalWidth,
              captchaVisible:visible('captchaOverlay'),otpVisible:visible('otpOverlay'),failureVisible:visible('failView'),failure:document.getElementById('failMsg')?.textContent};
          })()`);
          report.workspace={...state,status:clean(state.status),failure:clean(state.failure)};
          report.phase='waiting-for-qr';write();
          if(testMode&&/NOT AVAILABLE/i.test(state.status||'')){
            if(++unavailableChecks>=3){report.phase='journey-unavailable';report.bookingToUnavailableSeconds=Number(((performance.now()-bookingStarted)/1000).toFixed(2));break;}
          }else unavailableChecks=0;
          if(state.qrVisible&&state.qrImageReady){report.phase='qr-ready';break;}
          const probe=await box.webContents.executeJavaScript('window.__nexusQrProbe')||await execute('window.__nexusQrProbe');
          if(probe?.ready&&(!probe.formId||probe.formId===form.id)){
            report.qrEvent={...probe};report.phase='qr-generated';break;
          }
          if(globalThis.__nexusActualQrAt&&performance.now()-globalThis.__nexusActualQrAt>2000){report.phase='qr-generated-stage';report.qrReportedByBooking=true;break;}
          if(globalThis.__nexusWarmupQrReady){report.warmupQrVerified=true;if(!testMode){report.phase='browser-check-qr-ready';break;}}
          if(state.captchaVisible||state.otpVisible){report.phase=state.captchaVisible?'captcha-required':'otp-required';break;}
          if(state.failureVisible){report.phase='booking-failed';break;}
        }
        await new Promise(resolve=>setTimeout(resolve,2000));
      }
      if(report.phase==='waiting-for-qr')report.phase='qr-timeout';
      if(['qr-ready','qr-generated','qr-generated-stage','browser-check-qr-ready'].includes(report.phase)) {
        const qrAt=globalThis.__nexusActualQrAt||(testMode?performance.now():(globalThis.__nexusWarmupQrAt||performance.now()));
        report.loginToQrSeconds=Number(((qrAt-loginStarted)/1000).toFixed(2));
        report.bookingToQrSeconds=Number(((qrAt-bookingStarted)/1000).toFixed(2));
      }
      report.windows=electron.BrowserWindow.getAllWindows().map(w=>({title:clean(w.getTitle()),page:path.basename(w.webContents.getURL().split('?')[0])}));
      const page=globalThis.__nexusDiagnosticPage;
      if(page&&!page.isClosed()) {
        try {
          report.browser={url:page.url().split('?')[0],title:clean(await page.title()),text:clean(await page.evaluate(()=>document.body.innerText.slice(0,1800)))};
          await page.screenshot({path:path.join(directory,'live-browser.png')});
        } catch(error) {report.browserCaptureError=clean(error.message);}
      }
      for(const win of electron.BrowserWindow.getAllWindows()) {
        if(win.webContents.getURL().includes('/booking-box.html')) {
          fs.writeFileSync(path.join(directory,'live-booking.png'),(await win.webContents.capturePage()).toPNG());
        }
      }
    }
    if(process.argv.includes('--live-booking-test')&&report.bookingStart?.ok) {
      report.stop=await execute('window.api.stopRun('+JSON.stringify(form.id)+')');
      report.testStopped=true;
    }
    report.finished=new Date().toISOString();write();
    log('nexus-live-login-result',{ok:report.login.ok,phase:report.phase,error:report.login.error});
  } catch(error) {
    report.phase='diagnostic-error';report.error=clean(error.message);report.finished=new Date().toISOString();write();
    log('nexus-live-login-diagnostic-error',{error:report.error});
  } finally {
    if(testMode){report.stages=globalThis.__nexusE2eStages||[];write();}
    if(process.argv.includes('--isolated-live-test')&&controller&&report.form?.id){
      try {await controller.webContents.executeJavaScript('window.api.stopRun('+JSON.stringify(report.form.id)+').then(()=>window.api.logout('+JSON.stringify(report.form.id)+'))');report.sessionClosed=true;write();}
      catch(error){report.cleanupError=clean(error.message);write();}
    }
  }
}
module.exports={run};
