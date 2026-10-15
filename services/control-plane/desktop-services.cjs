'use strict';
// Declarative capabilities only: never distribute scripts, upstream secrets or
// arbitrary replacement URLs through desktop configuration.
function configuration(){return {schema:1,provider:'Matrix',capabilities:{webLogin:true,manualCaptcha:true,automaticCaptcha:false,railOne:false},reasons:{railOne:'Supported official integration is not configured',automaticCaptcha:'Enter the provider CAPTCHA manually'}};}
function handle(req,res,url){
  if(req.method!=='GET'||!['/api/desktop/config','/api/desktop/status','/api/desktop/time'].includes(url.pathname))return false;
  const serverTime=Date.now();
  const body=url.pathname.endsWith('/time')?{schema:1,provider:'Matrix',serverTime}:url.pathname.endsWith('/status')?{...configuration(),ok:true,serverTime}:configuration();
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));return true;
}
module.exports={configuration,handle};
