'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('availability refresh validates journey and triggers the existing request without saving',()=>{
 let click,events=0;const fields={};for(const id of ['trainNumber','journeyDate','fromStation','toStation'])fields[id]={value:'',dispatchEvent:event=>{assert.equal(event.type,'change');events++;}};
 fields.nexusCheckAvailability={addEventListener:(_name,handler)=>click=handler};fields.nexusAvailabilityHint={textContent:''};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/nexus-availability.js'),'utf8'),{document:{addEventListener:(_name,handler)=>handler(),getElementById:id=>fields[id]},Event:class{constructor(type){this.type=type;}},setTimeout:()=>{}});
 click();assert.equal(events,0);assert.match(fields.nexusAvailabilityHint.textContent,/Enter train/);
 for(const id of ['trainNumber','journeyDate','fromStation','toStation'])fields[id].value='test';
 click();assert.equal(events,1);assert.match(fields.nexusAvailabilityHint.textContent,/Refreshing/);
});
