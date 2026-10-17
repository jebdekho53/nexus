const path=require('node:path'),{fileURLToPath}=require('node:url');
function install(electron,root){electron.ipcMain.handle('matrix:portal:open',(event,role)=>{
 try{const url=new URL(event.sender.getURL());if(url.protocol!=='file:'||path.resolve(fileURLToPath(url))!==path.join(root,'src/renderer/tools.html')||!['admin','seller','client'].includes(role))return {ok:false};}catch{return {ok:false};}
 return electron.shell.openExternal('https://matrix.vaidya-gpt.com/'+role).then(()=>({ok:true}));
});}
module.exports={install};
