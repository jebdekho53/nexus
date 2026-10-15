'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
// Called before recovered login navigation, resource routing or form filling.
async function run({page,context,browser,dispose,directory},root,finish){
  if(process.argv.includes('--private-flow-probe'))return armFlowProbe({page,context,dispose,directory},root,finish);
  const report={at:new Date().toISOString(),credentialsSubmitted:false,phase:'before-login-page-handling',responses:[]};
  page.on('response',response=>{
    const url=new URL(response.url());
    if(url.hostname==='www.irctc.co.in'&&(response.request().isNavigationRequest()||url.pathname.startsWith('/_sec/')))
      report.responses.push({path:url.pathname,status:response.status()});
  });
  try{
    const cdp=await context.newCDPSession(page);
    const {targetInfo}=await cdp.send('Target.getTargetInfo');
    report.separateBrowserContext=!!targetInfo.browserContextId;
    await cdp.detach();
    report.initialCookies=(await context.cookies()).length;
    await page.goto('https://www.irctc.co.in/nget/',{waitUntil:'domcontentloaded',timeout:30000}).catch(error=>{report.navigationError=String(error.message).slice(0,180);});
    await page.waitForFunction(()=>document.querySelector('app-root input')||/access denied/i.test(document.title),undefined,{timeout:15000}).catch(()=>{});
    report.page=await page.evaluate(()=>({title:document.title,path:location.pathname,bookingForm:!!document.querySelector('app-root input'),accessDenied:/access denied/i.test(document.title),challengeDenied:/_sec\/cpr\/challenge/.test(document.body.innerText)}));
    await page.screenshot({path:path.join(root,'diagnostics/private-access-probe.png')});
    // Only a local synthetic cookie; no external credential or booking request.
    await context.addCookies([{name:'matrix_isolation_probe',value:'synthetic',url:'http://127.0.0.1'}]);
    const second=await browser.newContext();
    report.secondContextCookies=(await second.cookies()).length;
    report.cookieIsolation=!(await second.cookies()).some(cookie=>cookie.name==='matrix_isolation_probe');
    await second.close();
  }catch(error){report.error=String(error.message).slice(0,300);}
  finally{
    await dispose().catch(error=>{report.cleanupError=String(error.code||error.message);});
    report.profileRemoved=await fs.access(directory).then(()=>false,()=>true);
    await fs.writeFile(path.join(root,'diagnostics/private-access-probe.json'),JSON.stringify(report,null,2));
    finish(report.error?1:0);
  }
}
function armFlowProbe({page,context,dispose,directory},root,finish){
  const report={at:new Date().toISOString(),credentialsSubmitted:false,operations:[]};
  const note=(method,data)=>report.operations.push({method,...data});
  for(const target of [page,context]){
    for(const method of ['route','addInitScript','setExtraHTTPHeaders','addCookies','clearCookies']){
      if(typeof target[method]!=='function')continue;
      const original=target[method].bind(target);
      target[method]=(...args)=>{
        note(method,method==='route'?{pattern:String(args[0])}:method==='addCookies'?{count:args[0]?.length}:method==='setExtraHTTPHeaders'?{names:Object.keys(args[0]||{})}:{});
        return original(...args);
      };
    }
  }
  const goto=page.goto.bind(page);
  page.goto=async(url,options)=>{
    const parsed=new URL(url);
    if(parsed.hostname!=='www.irctc.co.in'){
      note('navigation',{origin:parsed.origin,path:parsed.pathname});
      return goto(url,options);
    }
    report.destination={origin:parsed.origin,path:parsed.pathname};
    report.cookiesBefore=(await context.cookies()).map(cookie=>({name:cookie.name,domain:cookie.domain}));
    try{
      const response=await goto(url,options);report.status=response?.status();
      await page.waitForFunction(()=>document.querySelector('app-root input')||/access denied/i.test(document.title),undefined,{timeout:15000}).catch(()=>{});
      report.page=await page.evaluate(()=>({title:document.title,path:location.pathname,bookingForm:!!document.querySelector('app-root input'),accessDenied:/access denied/i.test(document.title)}));
    }catch(error){report.error=String(error.message).slice(0,200);}
    finally{
      await dispose().catch(error=>{report.cleanupError=String(error.code||error.message);});
      report.profileRemoved=await fs.access(directory).then(()=>false,()=>true);
      await fs.writeFile(path.join(root,'diagnostics/private-flow-probe.json'),JSON.stringify(report,null,2));
      finish(0);
    }
  };
}
module.exports={run};
