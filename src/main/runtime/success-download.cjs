'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{fileURLToPath}=require('node:url'),{AsyncLocalStorage}=require('node:async_hooks');
function bookingRecord(value,depth=0){if(!value||typeof value!=='object'||depth>4||value.success===false)return null;if(/^\d{10}$/.test(String(value.pnr||'').trim()))return value;for(const key of ['event','booking','result','data','ticket','record']){const found=bookingRecord(value[key],depth+1);if(found)return found;}return null;}
function bookingPnr(value){const record=bookingRecord(value);return record?String(record.pnr).trim():null;}
function install(electron,root,log=()=>{}){
 const records=new Map(),inflight=new Map(),scope=new AsyncLocalStorage();let exporter;
 const nativeGetPath=electron.app.getPath.bind(electron.app);
 const directory=()=>path.join(nativeGetPath('downloads'),'Matrix Tickets');
 const ledgerFile=()=>path.join(nativeGetPath('userData'),'e-ticket-downloads.json');
 electron.app.getPath=name=>name==='desktop'&&scope.getStore()?directory():nativeGetPath(name);
 if(electron.shell?.openPath){const open=electron.shell.openPath.bind(electron.shell);electron.shell.openPath=(...args)=>scope.getStore()?Promise.resolve(''):open(...args);}
 const withExport=invoke=>{fs.mkdirSync(directory(),{recursive:true});return scope.run(true,invoke)};
 const trusted=sender=>{try{const u=new URL(sender.getURL());return u.protocol==='file:'&&path.resolve(fileURLToPath(u))===path.join(root,'src/renderer/booking-box.html')}catch{return false}};
 const formId=sender=>{try{return new URL(sender.getURL()).searchParams.get('id')}catch{return null}};
 const remember=(sender,value,id)=>{const record=bookingRecord(value);if(record){records.set('window:'+sender.id,record);if(id)records.set('form:'+id,record);}};
 electron.app.on('browser-window-created',(_event,win)=>{
  if(scope.getStore()){
   win.setBackgroundColor?.('#ffffff');
   const print=win.webContents.printToPDF?.bind(win.webContents);
   if(print)win.webContents.printToPDF=async options=>{
    const css=await win.webContents.insertCSS('html,body{background:#ffffff!important;color-scheme:light!important}');
    try{return await print(options);}finally{await win.webContents.removeInsertedCSS(css).catch(()=>{});}
   };
  }
  const senderId=win.webContents.id,send=win.webContents.send.bind(win.webContents);win.webContents.send=(channel,...args)=>{if(channel==='app:booked')remember(win.webContents,args[0],args[0]?.formId||formId(win.webContents));return send(channel,...args)};win.on('closed',()=>records.delete('window:'+senderId));
 });
 async function save(sender){
  if(!trusted(sender))return{ok:false,error:'Booking window required'};
  const record=records.get('window:'+sender.id)||records.get('form:'+formId(sender));if(!record||!exporter)return{ok:false,waiting:true};
  const key=crypto.createHash('sha256').update(String(record.pnr)).digest('hex');if(inflight.has(key))return inflight.get(key);
  const operation=(async()=>{
   let ledger={};try{ledger=JSON.parse(fs.readFileSync(ledgerFile(),'utf8'))}catch{}
   const valid=file=>typeof file==='string'&&path.dirname(path.resolve(file))===path.resolve(directory())&&file.toLowerCase().endsWith('.pdf')&&fs.existsSync(file)&&fs.readFileSync(file).subarray(0,5).equals(Buffer.from('%PDF-'));
   if(valid(ledger[key]))return{ok:true,path:ledger[key],existing:true};
   const result=await withExport(()=>exporter({sender},record,formId(sender)));
   const file=result?.data;if(!result?.ok||!valid(file))throw Error(result?.error||'E-ticket export did not produce a ticket PDF');
   ledger[key]=file;fs.mkdirSync(path.dirname(ledgerFile()),{recursive:true});fs.writeFileSync(ledgerFile(),JSON.stringify(ledger,null,2));log('matrix-eticket-saved',{page:'E-ticket saved to Downloads/Matrix Tickets'});return{ok:true,path:file};
  })().catch(error=>({ok:false,error:String(error.message)})).finally(()=>inflight.delete(key));inflight.set(key,operation);return operation;
 }
 electron.ipcMain.handle('matrix:success:save',event=>save(event.sender));
 return{setExporter(handler){exporter=handler},withExport,observe(channel,args,result,event){if(channel==='app:get-success-ticket'&&result?.ok)remember(event.sender,result.data,args[0]);},save};
}
module.exports={install,bookingPnr,bookingRecord};
