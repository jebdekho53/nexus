'use strict';
// Apply before app readiness. This controls Electron's UI, not external booking browsers.
function configure(app,{platform=process.platform,env=process.env}={}){
 if(platform!=='win32'||env.MATRIX_DESKTOP_GPU==='1')return false;
 app.disableHardwareAcceleration();
 return true;
}
module.exports={configure};
