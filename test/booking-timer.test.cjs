const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('General timer shows idle, elapsed run and actual remaining submit seconds',()=>{
 const timer={},quota={value:'GN'};let listener,change;
 const document={getElementById:id=>id==='matrixGeneralTimer'?timer:quota,addEventListener:(event,fn)=>{if(event==='DOMContentLoaded')fn();else change=fn;}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/renderer/matrix-booking-timer.js'),'utf8'),{document,matrixBookingTiming:{subscribe:fn=>listener=fn}});
 assert.equal(timer.hidden,false);assert.equal(timer.textContent,'Book now');
 listener({active:true,elapsedSeconds:3.6,remainingMs:null});assert.equal(timer.textContent,'Run 3s');
 listener({active:true,elapsedSeconds:10,remainingMs:44991});assert.equal(timer.textContent,'Submit 45s');
 quota.value='TQ';change();assert.equal(timer.hidden,true);
 quota.value='GN';change();listener({active:false,remainingMs:null});assert.equal(timer.textContent,'Book now');
});
