'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events'),{pathToFileURL}=require('node:url');
const {install,bookingPnr}=require('../src/main/runtime/success-download.cjs');
test('actual e-ticket exporter receives full booking, saves in dedicated Downloads folder and deduplicates',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-eticket-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));const root=path.resolve(__dirname,'..'),app=new EventEmitter();app.getPath=name=>path.join(temp,name);let opened=0;
 const e={app,shell:{openPath:async()=>{opened++;}},ipcMain:{handle(){}}},bridge=install(e,root);let exports=0;
 const record={pnr:'1234567890',passengers:[{name:'Full ticket passenger',status:'CNF'}],printDetail:{transactionId:'synthetic'}};
 const sender={id:1,getURL:()=>pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href+'?id=form&view=ticket',printToPDF(){throw Error('Success card must never be exported')}};
 const exporter=async(event,value)=>{exports++;assert.equal(event.sender,sender);assert.deepEqual(value,record);const dir=app.getPath('desktop');assert.equal(dir,path.join(temp,'downloads','Matrix Tickets'));assert(fs.existsSync(dir));await e.shell.openPath('ignored');const file=path.join(dir,'eTicket-fixture.pdf');fs.writeFileSync(file,'%PDF-1.7 full e-ticket fixture');return{ok:true,data:file}};
 bridge.setExporter(exporter);bridge.observe('app:get-success-ticket',['form'],{ok:true,data:{event:record}},{sender});
 const results=await Promise.all([bridge.save(sender),bridge.save(sender)]);assert(results.every(v=>v.ok));assert.equal(exports,1);assert.equal(opened,0);assert.equal(app.getPath('desktop'),path.join(temp,'desktop'));assert((await bridge.save(sender)).existing);
 const restarted=install(e,root);restarted.setExporter(exporter);restarted.observe('app:get-success-ticket',['form'],{ok:true,data:{event:record}},{sender});assert((await restarted.save(sender)).existing);assert.equal(exports,1);
 assert.equal((await bridge.save({...sender,getURL:()=> 'https://example.com/booking-box.html'})).ok,false);
});
test('failed e-ticket export is reported without writing a success-card replacement',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-eticket-failure-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));const app=new EventEmitter();app.getPath=n=>path.join(temp,n);const root=path.resolve(__dirname,'..'),bridge=install({app,ipcMain:{handle(){}}},root),sender={id:2,getURL:()=>pathToFileURL(path.join(root,'src/renderer/booking-box.html')).href+'?id=one'};
 bridge.setExporter(async()=>({ok:false,error:'Ticket detail unavailable'}));bridge.observe('app:get-success-ticket',['one'],{ok:true,data:{event:{pnr:'1234567890'}}},{sender});const result=await bridge.save(sender);assert.equal(result.ok,false);assert.match(result.error,/Ticket detail unavailable/);assert.deepEqual(fs.readdirSync(path.join(temp,'downloads','Matrix Tickets')),[]);
});
test('only successful unmasked PNR records are eligible',()=>{assert.equal(bookingPnr({pnr:'1234567890',success:false}),null);assert.equal(bookingPnr({event:{pnr:'1234567890'}}),'1234567890');assert.equal(bookingPnr({pnr:'•••••••834'}),null)});
test('e-ticket print windows use white native and page backgrounds instead of app dark margins',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-eticket-white-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));const app=new EventEmitter();app.getPath=n=>path.join(temp,n);const bridge=install({app,ipcMain:{handle(){}}},path.resolve(__dirname,'..')),trace=[];
 await bridge.withExport(async()=>{const w=new EventEmitter();w.setBackgroundColor=c=>trace.push(['background',c]);w.webContents={id:7,send(){},async insertCSS(css){trace.push(['css',css]);return'white-style'},async printToPDF(){trace.push(['print']);return Buffer.from('%PDF-')},async removeInsertedCSS(id){trace.push(['remove',id])}};app.emit('browser-window-created',{},w);await w.webContents.printToPDF({printBackground:true});});
 assert.deepEqual(trace.map(r=>r[0]),['background','css','print','remove']);assert.equal(trace[0][1],'#ffffff');assert.match(trace[1][1],/html,body.*#ffffff/);
});
