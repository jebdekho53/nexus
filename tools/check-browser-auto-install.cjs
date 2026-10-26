'use strict';
const fs=require('node:fs'),path=require('node:path'),{Readable}=require('node:stream');
const {create}=require('../src/main/runtime/matrix-browser-installer.cjs');
(async()=>{
 const online=process.argv.includes('--online'),root=path.resolve(__dirname,'..'),base=path.join(root,'diagnostics',online?'browser-online-install-check':'browser-local-install-check');
 const archive=path.resolve(root,'..','matrix-browser-build/Matrix-Browser-156.0.8078.48-win-x64.zip');
 const installer=create({base,...(!online?{fetcher:async()=>new Response(Readable.toWeb(fs.createReadStream(archive)))}:{})});
 const result=await installer.install();if(!result.ok)throw Error(result.error);
 const ready=await installer.ready();if(!ready)throw Error('Installed runtime not ready');
 const repeated=await installer.install();if(!repeated.alreadyInstalled)throw Error('Repeat click did not skip downloading');
 const report={online,ready,repeatSkipped:repeated.alreadyInstalled,state:installer.state,measuredAt:new Date().toISOString(),booking:false};
 fs.writeFileSync(path.join(root,'diagnostics',online?'browser-online-install-verified.json':'browser-local-install-verified.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
