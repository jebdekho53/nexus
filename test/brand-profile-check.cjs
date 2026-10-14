'use strict';
const fs=require('node:fs'),path=require('node:path');
async function run(electron,root,log) {
  const report={readOnly:true};
  try {
    let controller;const deadline=Date.now()+90000;
    while(Date.now()<deadline){
      controller=electron.BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().split('?')[0].endsWith('/controller.html'));
      if(controller&&!controller.webContents.isLoading())break;
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    if(!controller)throw Error('Controller unavailable');
    const result=await controller.webContents.executeJavaScript(`(async()=>{
      const result=await window.api.listForms();if(!result.ok)throw Error('Saved forms could not be listed');
      let readable=0;
      for(const row of result.data){const form=await window.api.getForm(row.id);if(form.ok&&form.data?.journey)readable++;}
      return {forms:result.data.length,readable};
    })()`);
    Object.assign(report,result,{passed:result.forms===result.readable});
    report.appName=electron.app.getName();
    report.font=await controller.webContents.executeJavaScript('getComputedStyle(document.body).fontFamily');
  } catch(error){report.passed=false;report.error=String(error.message);}
  fs.writeFileSync(path.join(root,'diagnostics/brand-profile-check.json'),JSON.stringify(report,null,2));
  log('matrix-brand-profile-check',report);
}
module.exports={run};
