'use strict';
// Legacy snapshot: the corresponding lines of src/main/index.cjs before they moved to runtime/startup-support.ts.
// The closure variables of index.cjs (testSecrets, activity, Module, vendorRequire) are passed in explicitly.
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
module.exports={
  loadTestSecrets(diagnostics){
    let testSecrets=[];
    try {const account=JSON.parse(fs.readFileSync(path.join(diagnostics,'test-account.json'),'utf8'));testSecrets=[account.password].filter(Boolean);} catch {}
    return testSecrets;
  },
  createStartupLog({diagnostics,secrets,activity:getActivity}){
    return (event, details = {}) => {
      const testSecrets=secrets(),activity=getActivity();
      let text=JSON.stringify({time:new Date().toISOString(),pid:process.pid,event,...details});
      for(const secret of testSecrets)text=text.replaceAll(secret,'[redacted]');
      if(activity)text=activity.redact(text);
      fs.appendFileSync(path.join(diagnostics,'startup.jsonl'),text+'\n');
      activity?.record(event,details);
    };
  },
  errorDetails:error => ({message:String(error?.message || error),stack:error?.stack,frames:error?.recoveredFrames}),
  installNativeBytecodeGuard(Module,log){
    const nativeLoad=Module._load;
    Module._load=function(request,parent,isMain){
      if(typeof request==='string'&&/\.jsc$/i.test(request)) {
        log('native-bytecode-load-rejected',{file:path.basename(request)});
        throw new Error('This source project executes JavaScript definitions and does not load .jsc code');
      }
      return Reflect.apply(nativeLoad,this,[request,parent,isMain]);
    };
  },
  createEsmImport(vendorRequire,importModule){
    return specifier => {
      if (/^(node:|data:|file:|https?:)/.test(specifier)) return importModule(specifier);
      return importModule(pathToFileURL(vendorRequire.resolve(specifier)).href);
    };
  },
};
