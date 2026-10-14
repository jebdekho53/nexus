'use strict';
const fs=require('node:fs'),path=require('node:path');
async function run(electron,root,log) {
  const report={time:new Date().toISOString(),gpu:electron.app.getGPUFeatureStatus(),windows:[]};
  report.initialVisible=electron.BrowserWindow.getAllWindows().filter(win=>win.isVisible()).map(win=>path.basename(win.webContents.getURL().split('?')[0]));
  if(process.argv.includes('--ui-actions')) {
    report.actions=[];
    const controller=electron.BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().endsWith('/controller.html'));
    report.dynamicBranding=await controller.webContents.executeJavaScript(`(async()=>{const node=document.createElement('span');node.hidden=true;node.textContent='BRAHMOS LOGIN';node.title='Brahmos Browser';document.body.append(node);await new Promise(resolve=>setTimeout(resolve,0));const result={text:node.textContent,title:node.title};node.remove();return result;})()`);
    const pages={'new-form':'form.html','open-form':'open-form.html','login-data':'login-data.html',proxy:'proxy.html',payment:'payment.html',history:'history.html',tools:'tools.html',updates:'updates.html',logs:'logs.html'};
    for(const [action,page]of Object.entries(pages)) {
      const result=await controller.webContents.executeJavaScript('window.api.controllerAction('+JSON.stringify(action)+')');
      const deadline=Date.now()+5000;let panel;
      while(Date.now()<deadline){panel=electron.BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().split('?')[0].endsWith('/'+page));if(panel?.isVisible()&&!panel.webContents.isLoading())break;await new Promise(resolve=>setTimeout(resolve,100));}
      report.actions.push({action,ok:result?.ok!==false,visible:panel?.isVisible()||false,ready:panel?await panel.webContents.executeJavaScript('document.readyState'):null});
      panel?.hide();
    }
  }
  for(const win of electron.BrowserWindow.getAllWindows()) {
    const info={id:win.id,page:path.basename(win.webContents.getURL().split('?')[0]),visible:win.isVisible(),loading:win.webContents.isLoading(),title:win.getTitle()};
    const timeout=promise=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('Renderer diagnostic timed out')),4000))]);
    try {
      info.dom=await timeout(win.webContents.executeJavaScript(`({ready:document.readyState,elements:document.querySelectorAll('*').length,api:typeof window.api,logBridge:typeof window.matrixLogs,legacyVisible:/\\b(?:brahmos|xhamster|tatkal software)\\b/i.test(document.body.innerText),font:getComputedStyle(document.body).fontFamily,background:getComputedStyle(document.body).backgroundColor,width:innerWidth,height:innerHeight})`));
      fs.writeFileSync(path.join(root,'diagnostics',`ui-window-${win.id}.png`),(await timeout(win.webContents.capturePage())).toPNG());
    }catch(error){info.error=String(error.message);}
    report.windows.push(info);
  }
  fs.writeFileSync(path.join(root,'diagnostics/ui-diagnostic.json'),JSON.stringify(report,null,2));
  log('matrix-ui-diagnostic-complete',{windows:report.windows.length,visible:report.windows.filter(w=>w.visible).map(w=>w.page)});
}
module.exports={run};
